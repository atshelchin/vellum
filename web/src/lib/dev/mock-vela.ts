/**
 * A stand-in for Vela Wallet, for trying the site against a local fork without
 * a phone. Development only: it is loaded by nothing in a built site.
 *
 * It announces itself the way Vela does (EIP-6963, `app.getvela`) and answers
 * `eth_sendTransaction` the way Vela does, only once the transaction is in a
 * block. What it cannot do is sign: it asks the node to send the transaction
 * as the account, which only a fork that impersonates will agree to.
 *
 *     anvil --fork-url https://rpc.testnet.arc.network --auto-impersonate
 *
 * Then open any page with `?mock=<account>`, where the account is one made by
 * `contracts/script/DevWallet.s.sol`. Add `&mock-mode=reject` to have it refuse
 * every transaction, or `&mock-mode=timeout` to have it send one and then give
 * up waiting, as Vela does after a couple of minutes.
 */
export function installMockVela(
	account: string,
	node: string,
	chainId: number,
	mode: string | null
) {
	let id = 0;
	const rpc = async (method: string, params: unknown = []) => {
		const response = await fetch(node, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params })
		});
		const answer = (await response.json()) as {
			result?: unknown;
			error?: { code: number; message: string };
		};
		if (answer.error) throw Object.assign(new Error(answer.error.message), answer.error);
		return answer.result;
	};
	const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

	const provider = {
		isVela: true,
		async request({ method, params }: { method: string; params?: unknown[] }) {
			switch (method) {
				case 'eth_requestAccounts':
				case 'eth_accounts':
					return [account];
				case 'eth_chainId':
					return `0x${chainId.toString(16)}`;
				case 'wallet_switchEthereumChain':
					return null;
				case 'eth_sendTransaction': {
					if (mode === 'reject') {
						throw Object.assign(new Error('User rejected the request.'), { code: 4001 });
					}
					// About as long as it takes to read a signing sheet and press a thumb to it.
					await pause(600);
					const hash = await rpc('eth_sendTransaction', params);
					if (mode === 'timeout') {
						throw Object.assign(
							new Error(
								`The transaction was submitted but is not confirmed yet; it may still complete, so check the wallet before sending it again (user operation ${hash})`
							),
							{ code: -32603 }
						);
					}
					for (;;) {
						const receipt = (await rpc('eth_getTransactionReceipt', [hash])) as {
							status: string;
						} | null;
						if (receipt?.status === '0x1') return hash;
						if (receipt) {
							throw Object.assign(
								new Error(`The transaction was included but reverted (${hash})`),
								{
									code: -32603
								}
							);
						}
						await pause(200);
					}
				}
				default:
					return rpc(method, params);
			}
		},
		on() {},
		removeListener() {}
	};

	const icon =
		'data:image/svg+xml,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1f6feb"/><path d="M9 9l7 15 7-15" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
		);
	const detail = Object.freeze({
		info: Object.freeze({
			uuid: '0d6c1c1e-0000-4000-8000-000000000001',
			name: 'Vela Wallet (mock)',
			icon,
			rdns: 'app.getvela'
		}),
		provider
	});
	const announce = () =>
		window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }));
	window.addEventListener('eip6963:requestProvider', announce);
	announce();
}
