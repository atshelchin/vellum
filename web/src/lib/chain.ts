import {
	createPublicClient,
	defineChain,
	fallback,
	http,
	numberToHex,
	type Address,
	type Chain,
	type Hex,
	type PublicClient
} from 'viem';
import { arc, mainnet } from 'viem/chains';
import {
	ARC_RPC_URL,
	ARC_VELLUM_ADDRESS,
	ETHEREUM_RPC_URL,
	ETHEREUM_VELLUM_ADDRESS,
	TESTNET_RPC_URL,
	TESTNET_VELLUM_ADDRESS
} from '$app/env/public';

/**
 * Vellum is on three networks, and it is one contract and one site on all of
 * them. What differs is what a diary on each is for:
 *
 * - Ethereum, where a page is dear and is kept for good: the diary proper.
 * - Arc, where a page costs a fraction of a cent: the diary for every day.
 * - Arc Testnet, where it costs nothing and nothing is promised: the practice
 *   book, for finding out how it works.
 *
 * Which one a page is on is said by its address: `/…` is Ethereum, `/arc/…` is
 * Arc and `/testnet/…` is the practice book. Nothing is remembered between
 * pages and nothing is guessed, so a link always opens on the network it was
 * made on, and a page that says Ethereum is on Ethereum.
 */
const arcTestnet = defineChain({
	id: 5042002,
	name: 'Arc Testnet',
	// Arc's gas coin is USDC, held on chain with 18 decimals.
	nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
	rpcUrls: {
		default: { http: ['https://rpc.testnet.arc.network', 'https://rpc.testnet.arc.io'] }
	},
	blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.testnet.arc.io' } },
	contracts: { multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' } },
	testnet: true
});

/**
 * Where Vellum is deployed: the same addresses as the table in
 * ../../../contracts/README.md. A network is open on the site the moment it
 * has one here.
 *
 * It goes out through a CREATE2 factory, so it will have the same address on
 * all three. That is not a reason to write it down before it is deployed: an
 * address with nothing at it is not a Vellum.
 */
const DEPLOYED: Record<Net['id'], Address | undefined> = {
	ethereum: undefined,
	arc: undefined,
	testnet: '0x9fE4b54FB1ffF75dB2600788696df8ABa0Fbc013'
};

export interface Net {
	id: 'ethereum' | 'arc' | 'testnet';
	/** What stands at the front of its pages' paths: nothing for Ethereum. */
	param: 'arc' | 'testnet' | undefined;
	/** What it is called on a switch, where there is room for one word. */
	label: string;
	/** And where there is not room for that, on a phone with three of them in a row. */
	short: string;
	chain: Chain;
	chainIdHex: Hex;
	client: PublicClient;
	/** The Vellum contract (contracts/src/Vellum.sol), or `undefined` where it is not deployed yet. */
	vellum: Address | undefined;
	/** What the coin is called wherever an amount is shown. */
	coin: string;
	/** Roughly how long a transaction takes to land, for what the page says while it waits. */
	wait: string;
	/**
	 * How often the chain is looked at for what a transaction did, and how long
	 * for after the wallet has stopped waiting, in milliseconds. A chain that
	 * makes a block a second is asked every second; Ethereum makes one in twelve.
	 */
	settle: { every: number; within: number };
	/**
	 * Whether this is the practice book. What is written on a testnet is public
	 * like anything else on a chain, but a testnet can be wiped, so nothing
	 * shown on it may promise that it lasts.
	 */
	practice: boolean;
	/**
	 * What a diary here is kept for, to finish "kept on Ethereum, …". Only
	 * Ethereum is said to keep a thing for good: it is what the others are
	 * measured against.
	 */
	keeping: 'for good' | 'for every day' | 'for practice';
	/** What it is, in a sentence, for whoever is choosing between the three. */
	about: string;
	/** How a page on another network offers the way to this one. */
	invite: string;
	/** Where the coin can be had for nothing, on a chain where it is worth nothing. */
	faucet?: string;
}

function net(
	settings: Omit<Net, 'chain' | 'chainIdHex' | 'client'> & {
		chain: Chain;
		/** Nodes that answer a browser on another origin. */
		nodes: string[];
	}
): Net {
	const { nodes, ...rest } = settings;
	const chain: Chain = { ...settings.chain, rpcUrls: { default: { http: nodes } } };
	return {
		...rest,
		chain,
		chainIdHex: numberToHex(chain.id),
		client: createPublicClient({
			chain,
			transport: fallback(nodes.map((url) => http(url))),
			batch: { multicall: true }
		})
	};
}

export const NETS = {
	ethereum: net({
		id: 'ethereum',
		param: undefined,
		label: 'Ethereum',
		short: 'ETH',
		chain: mainnet,
		nodes: ETHEREUM_RPC_URL
			? [ETHEREUM_RPC_URL]
			: [
					'https://ethereum-rpc.publicnode.com',
					'https://eth.drpc.org',
					'https://rpc.mevblocker.io'
				],
		vellum: ETHEREUM_VELLUM_ADDRESS ?? DEPLOYED.ethereum,
		coin: 'ETH',
		wait: 'about a minute',
		settle: { every: 3000, within: 90_000 },
		practice: false,
		keeping: 'for good',
		about: 'Kept for good. A page is dear here, and is still there in fifty years.',
		invite: 'Write for keeps on Ethereum'
	}),
	arc: net({
		id: 'arc',
		param: 'arc',
		label: 'Arc',
		short: 'Arc',
		chain: arc,
		nodes: ARC_RPC_URL ? [ARC_RPC_URL] : [...arc.rpcUrls.default.http],
		vellum: ARC_VELLUM_ADDRESS ?? DEPLOYED.arc,
		// Arc's gas coin is USDC itself.
		coin: 'USDC',
		wait: 'a few seconds',
		settle: { every: 1000, within: 20_000 },
		practice: false,
		keeping: 'for every day',
		about: 'For every day. A page costs a fraction of a cent.',
		invite: 'Write every day on Arc'
	}),
	testnet: net({
		id: 'testnet',
		param: 'testnet',
		label: 'Testnet',
		short: 'Test',
		chain: arcTestnet,
		nodes: TESTNET_RPC_URL ? [TESTNET_RPC_URL] : [...arcTestnet.rpcUrls.default.http],
		vellum: TESTNET_VELLUM_ADDRESS ?? DEPLOYED.testnet,
		coin: 'test USDC',
		wait: 'a few seconds',
		settle: { every: 1000, within: 20_000 },
		practice: true,
		keeping: 'for practice',
		about: 'The practice book. Free, and not kept for good.',
		invite: 'Try it first on Arc Testnet, for nothing',
		faucet: 'https://faucet.circle.com'
	})
} satisfies Record<Net['id'], Net>;

/** The three, in the order they are offered: the diary proper, the everyday one, the practice book. */
export const NET_LIST: readonly Net[] = [NETS.ethereum, NETS.arc, NETS.testnet];

/** The network a page is on, from what stands at the front of its path. */
export function netOf(param: string | undefined): Net {
	return NET_LIST.find((each) => each.param === param) ?? NETS.ethereum;
}

/**
 * The other networks that have a Vellum on them, for a page that offers the
 * way across. From a network that is not open yet, the practice book comes
 * first: it is what there is to do meanwhile.
 */
export function openElsewhere(from: Net): Net[] {
	const open = NET_LIST.filter((each) => each !== from && each.vellum);
	return from.vellum ? open : open.toSorted((a, b) => Number(b.practice) - Number(a.practice));
}
