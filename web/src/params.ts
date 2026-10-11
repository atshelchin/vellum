import { defineParams } from '@sveltejs/kit/params';

export const params = defineParams({
	/**
	 * The one word that may stand at the front of a path: `arc`, for the
	 * everyday diary on Arc, or `testnet`, for the practice book. With nothing
	 * there, a page is on Ethereum.
	 */
	network: (param) => (param === 'arc' || param === 'testnet' ? param : undefined)
});
