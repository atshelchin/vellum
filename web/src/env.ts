import { defineEnvVars } from '@sveltejs/kit/env';

const address = (name: string) => (value: string | undefined) => {
	if (!value) return undefined;
	if (!/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${name} must be an address`);
	return value as `0x${string}`;
};

/**
 * Nothing here needs setting: the site knows both of its networks and where
 * Vellum is deployed on each. These point one of them somewhere else, which is
 * how the site is tried against a fork or a new build of the contract.
 */
export const variables = defineEnvVars({
	MAINNET_VELLUM_ADDRESS: {
		public: true,
		static: true,
		description: 'A Vellum contract on Ethereum to use instead of the deployed one.',
		schema: address('MAINNET_VELLUM_ADDRESS')
	},
	MAINNET_RPC_URL: {
		public: true,
		static: true,
		description: 'An Ethereum node to read from instead of the public ones.',
		schema: (value) => value || undefined
	},
	TESTNET_VELLUM_ADDRESS: {
		public: true,
		static: true,
		description: 'A Vellum contract on Arc Testnet to use instead of the deployed one.',
		schema: address('TESTNET_VELLUM_ADDRESS')
	},
	TESTNET_RPC_URL: {
		public: true,
		static: true,
		description: 'An Arc Testnet node to read from instead of the public ones: a local fork, say.',
		schema: (value) => value || undefined
	}
});
