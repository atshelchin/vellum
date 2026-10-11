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
import { mainnet } from 'viem/chains';
import {
	MAINNET_RPC_URL,
	MAINNET_VELLUM_ADDRESS,
	TESTNET_RPC_URL,
	TESTNET_VELLUM_ADDRESS
} from '$app/env/public';

/**
 * Vellum is on two networks: Ethereum, where a diary is kept for good, and Arc
 * Testnet, where the same diary can be tried for nothing first. It is one
 * contract and one site on both.
 *
 * Which of the two a page is on is said by its address: `/…` is Ethereum and
 * `/testnet/…` is the practice book. Nothing is remembered between pages and
 * nothing is guessed, so a link always opens on the network it was made on,
 * and a page that says Ethereum is on Ethereum.
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
 * It goes out through a CREATE2 factory, so it will have this same address on
 * Ethereum. That is not a reason to write it there before it is deployed
 * there: an address with nothing at it is not a Vellum.
 */
const DEPLOYED: Record<'mainnet' | 'testnet', Address | undefined> = {
	mainnet: undefined,
	testnet: '0xB19C2F9c703116B4E680953006fc01180AD1ab68'
};

export interface Net {
	id: 'mainnet' | 'testnet';
	/** What stands at the front of its pages' paths: nothing for Ethereum. */
	param: 'testnet' | undefined;
	/** What it is called on a switch, where there is room for one word. */
	label: string;
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
	 * Whether this is the practice book. What is written on a testnet is public
	 * like anything else on a chain, but a testnet can be wiped, so nothing
	 * shown on it may promise that it lasts.
	 */
	practice: boolean;
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
	mainnet: net({
		id: 'mainnet',
		param: undefined,
		label: 'Ethereum',
		chain: mainnet,
		nodes: MAINNET_RPC_URL
			? [MAINNET_RPC_URL]
			: [
					'https://ethereum-rpc.publicnode.com',
					'https://eth.drpc.org',
					'https://rpc.mevblocker.io'
				],
		vellum: MAINNET_VELLUM_ADDRESS ?? DEPLOYED.mainnet,
		coin: 'ETH',
		wait: 'about a minute',
		practice: false
	}),
	testnet: net({
		id: 'testnet',
		param: 'testnet',
		label: 'Testnet',
		chain: arcTestnet,
		nodes: TESTNET_RPC_URL ? [TESTNET_RPC_URL] : [...arcTestnet.rpcUrls.default.http],
		vellum: TESTNET_VELLUM_ADDRESS ?? DEPLOYED.testnet,
		coin: 'test USDC',
		wait: 'a few seconds',
		practice: true,
		faucet: 'https://faucet.circle.com'
	})
} satisfies Record<Net['id'], Net>;

/** The network a page is on, from what stands at the front of its path. */
export function netOf(param: string | undefined): Net {
	return param === 'testnet' ? NETS.testnet : NETS.mainnet;
}

/** The other one: the practice book from Ethereum, and Ethereum from the practice book. */
export function otherNet(from: Net): Net {
	return from.id === 'mainnet' ? NETS.testnet : NETS.mainnet;
}
