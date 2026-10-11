import { getAddress, numberToHex, type Address, type Hex } from 'viem';
import { browser } from '$app/env';
import { vellumAbi } from './abi';
import { NETS, type Net } from './chain';

export interface Eip1193Provider {
	request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
	on?(event: string, listener: (...args: never[]) => void): unknown;
	removeListener?(event: string, listener: (...args: never[]) => void): unknown;
	isVela?: boolean;
}

/** A wallet found in the page, by EIP-6963 or on `window.ethereum`. */
export interface WalletOption {
	id: string;
	name: string;
	icon?: string;
	provider: Eip1193Provider;
	isVela: boolean;
}

/**
 * What Vellum makes of the connected account.
 *
 * - `vela`: the Vellum contract confirms it is a Vela account.
 * - `new-vela`: Vela Wallet is connected, and the account has no code on this
 *   chain yet. A Vela account is deployed by its first transaction, so the
 *   contract can only confirm it then.
 * - `not-vela`: any other account. It can read, not write.
 *
 * It is asked of one network at a time: an account that has been used on
 * Ethereum may never have been on Arc Testnet, and the other way round.
 */
export type Standing = 'checking' | 'vela' | 'new-vela' | 'not-vela';

const VELA_RDNS = 'app.getvela';
const REMEMBERED = 'vellum:wallet';

export function rpcCode(error: unknown): number | undefined {
	return typeof error === 'object' && error !== null && 'code' in error
		? Number((error as { code: unknown }).code)
		: undefined;
}

class Wallet {
	options = $state<WalletOption[]>([]);
	current = $state<WalletOption | null>(null);
	account = $state<Address | null>(null);
	balance = $state<bigint | null>(null);
	standing = $state<Standing>('checking');
	/** The id of the option being connected to. */
	connecting = $state<string | null>(null);
	error = $state<string | null>(null);
	pickerOpen = $state(false);

	canWrite = $derived(this.standing === 'vela' || this.standing === 'new-vela');

	/** The network of the page being shown: where the balance and the standing are read. */
	#net: Net = NETS.ethereum;

	/** Told which network the page is on. The same account is looked at again there. */
	use(net: Net) {
		if (net === this.#net) return;
		this.#net = net;
		if (!this.account) return;
		this.balance = null;
		this.standing = 'checking';
		void this.refresh();
	}

	#listening = false;
	#onAccounts = (accounts: string[]) => {
		if (accounts.length === 0) this.disconnect();
		else this.#setAccount(accounts[0]);
	};
	#onDisconnect = () => this.disconnect();

	/** Starts looking for wallets. Safe to call more than once. */
	discover() {
		if (!browser || this.#listening) return;
		this.#listening = true;

		window.addEventListener('eip6963:announceProvider', (event) => {
			const detail = (event as CustomEvent).detail as
				| {
						info?: { uuid?: string; name?: string; icon?: string; rdns?: string };
						provider?: Eip1193Provider;
				  }
				| undefined;
			if (!detail?.info?.name || typeof detail.provider?.request !== 'function') return;
			this.#add({
				id: detail.info.rdns ?? detail.info.uuid ?? detail.info.name,
				name: detail.info.name,
				icon: detail.info.icon,
				provider: detail.provider,
				isVela: detail.info.rdns === VELA_RDNS || detail.provider.isVela === true
			});
		});
		window.dispatchEvent(new Event('eip6963:requestProvider'));

		// A wallet that predates EIP-6963 is only on `window.ethereum`. Wallets
		// that announce themselves answer the request above synchronously, so by
		// now an empty list means nobody will.
		const legacy = (window as { ethereum?: Eip1193Provider }).ethereum;
		if (this.options.length === 0 && typeof legacy?.request === 'function') {
			this.#add({
				id: 'window.ethereum',
				name: legacy.isVela ? 'Vela Wallet' : 'Browser wallet',
				provider: legacy,
				isVela: legacy.isVela === true
			});
		}
	}

	#add(option: WalletOption) {
		if (this.options.some((known) => known.id === option.id)) return;
		this.options = [...this.options, option].sort((a, b) => Number(b.isVela) - Number(a.isVela));
		if (!this.current && remembered() === option.id) void this.#resume(option);
	}

	/** Reconnects without a prompt, if the wallet still shares an account. */
	async #resume(option: WalletOption) {
		try {
			const accounts = (await option.provider.request({ method: 'eth_accounts' })) as string[];
			if (accounts.length > 0 && !this.current) this.#adopt(option, accounts[0]);
		} catch {
			// The wallet would rather be asked again.
		}
	}

	async connect(option: WalletOption) {
		this.connecting = option.id;
		this.error = null;
		try {
			const accounts = (await option.provider.request({
				method: 'eth_requestAccounts'
			})) as string[];
			if (accounts.length === 0) throw new Error('The wallet did not share an account.');
			this.#adopt(option, accounts[0]);
			remember(option.id);
			this.pickerOpen = false;
		} catch (error) {
			this.error =
				rpcCode(error) === 4001 ? 'Connection cancelled.' : 'Could not connect to that wallet.';
		} finally {
			this.connecting = null;
		}
	}

	disconnect() {
		this.current?.provider.removeListener?.('accountsChanged', this.#onAccounts);
		this.current?.provider.removeListener?.('disconnect', this.#onDisconnect);
		this.current = null;
		this.account = null;
		this.balance = null;
		this.standing = 'checking';
		remember(null);
	}

	#adopt(option: WalletOption, account: string) {
		if (this.current) this.disconnect();
		this.current = option;
		option.provider.on?.('accountsChanged', this.#onAccounts);
		option.provider.on?.('disconnect', this.#onDisconnect);
		this.#setAccount(account);
	}

	#setAccount(account: string) {
		const next = getAddress(account);
		if (next === this.account) return;
		this.account = next;
		this.balance = null;
		this.standing = 'checking';
		void this.refresh();
	}

	/** Re-reads the account's balance and whether it is a Vela account. */
	async refresh() {
		const account = this.account;
		const option = this.current;
		const net = this.#net;
		if (!account || !option) return;
		// An answer is for the account and the network it was asked about. If
		// either has changed by the time it arrives, it is nobody's.
		const current = () => this.account === account && this.#net === net;

		let standing: Standing;
		try {
			const [code, balance] = await Promise.all([
				net.client.getCode({ address: account }),
				net.client.getBalance({ address: account })
			]);
			if (!current()) return;
			this.balance = balance;

			if (!code || code === '0x') {
				standing = option.isVela ? 'new-vela' : 'not-vela';
			} else if (!net.vellum) {
				standing = option.isVela ? 'vela' : 'not-vela';
			} else {
				const isVela = await net.client.readContract({
					address: net.vellum,
					abi: vellumAbi,
					functionName: 'isVelaWallet',
					args: [account]
				});
				standing = isVela ? 'vela' : 'not-vela';
			}
		} catch {
			// The chain did not answer. The contract decides in the end; until
			// then, go by the wallet.
			standing = option.isVela ? 'vela' : 'not-vela';
		}
		if (current()) this.standing = standing;
	}

	/** Moves the wallet to a network's chain, adding the network to wallets that lack it. */
	async #switchChain(provider: Eip1193Provider, { chain, chainIdHex }: Net) {
		const chainId = (await provider.request({ method: 'eth_chainId' })) as string;
		if (Number(chainId) === chain.id) return;
		try {
			await provider.request({
				method: 'wallet_switchEthereumChain',
				params: [{ chainId: chainIdHex }]
			});
		} catch (error) {
			if (rpcCode(error) !== 4902) throw error;
			await provider.request({
				method: 'wallet_addEthereumChain',
				params: [
					{
						chainId: chainIdHex,
						chainName: chain.name,
						nativeCurrency: chain.nativeCurrency,
						rpcUrls: chain.rpcUrls.default.http,
						blockExplorerUrls: [chain.blockExplorers!.default.url]
					}
				]
			});
		}
	}

	/**
	 * Asks the wallet to send a transaction on a network, moving it there first
	 * if it is somewhere else.
	 *
	 * Vela answers once the transaction is in a block, which can be minutes
	 * after it was signed; other wallets answer as soon as it is sent. Either
	 * way the answer is not proof of anything: what was done is read from the
	 * chain.
	 */
	async send(net: Net, transaction: { to: Address; data: Hex; value?: bigint }): Promise<Hex> {
		const provider = this.current?.provider;
		if (!provider || !this.account) throw new Error('Connect a wallet first.');
		await this.#switchChain(provider, net);
		return (await provider.request({
			method: 'eth_sendTransaction',
			params: [
				{
					from: this.account,
					to: transaction.to,
					data: transaction.data,
					value: numberToHex(transaction.value ?? 0n)
				}
			]
		})) as Hex;
	}
}

function remembered(): string | null {
	try {
		return localStorage.getItem(REMEMBERED);
	} catch {
		return null;
	}
}

function remember(id: string | null) {
	try {
		if (id) localStorage.setItem(REMEMBERED, id);
		else localStorage.removeItem(REMEMBERED);
	} catch {
		// Storage is off limits here; the wallet is asked again next time.
	}
}

export const wallet = new Wallet();
