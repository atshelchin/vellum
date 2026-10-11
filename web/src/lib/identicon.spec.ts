import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { identiconOf, identiconSvg } from './identicon';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/**
 * What Vela Wallet draws for a seed, by its length and its SHA-256: taken from
 * the wallet's own conformance vectors (`vela-core`, `identicon_svg_circular`).
 * An account must have the same face here as it has in its wallet, to the byte.
 */
const VELA: [seed: string, length: number, hash: string][] = [
	[
		'0x0000000000000000000000000000000000000000',
		3667,
		'b4154ef5aaa757964d058276933d2d92f298876adeaef4178d0c749cab204699'
	],
	[
		'0xffffffffffffffffffffffffffffffffffffffff',
		2953,
		'ed570b23b29b9bd65294cc807a2ba2980a8ca308e40231b3e65d77efad6a398c'
	],
	[
		'0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
		2253,
		'e43e19462f5f32f866cc42c1353933f3fc9289d0ff6e54a6d2fd7cdf89b56b87'
	],
	[
		'0xd8Da6BF26964aF9D7eEd9e03E53415D37aA96045',
		3182,
		'f7115585caaa733d1232a347d8e2a31976b4c74b3e5e8e92cca4dd4d35a83e7f'
	],
	[
		'0x762EdA60D3B68755c271D608644650278f88329F',
		4740,
		'2ad63ead18863a281dbe2786b9ccb32c9c5930d8e9c102895dbb50f65889d029'
	],
	['', 4075, 'af0b5a1206062cd66c385cbeed52743e3e3dfca66c3c1e255c8a23ace168fb95'],
	['nimiq', 5952, 'e23cf1e4f864c21968dd87a7afbc60e3922149868bd8efd0fa6380db2d5f04b2'],
	['test', 4245, 'e9cbf3c25848de004fcac982799efb2e142caaf7edb3deb755e398bb275a943b'],
	['💎', 5505, '2e9f5a98d80549ca84b6825b20f0a4d8e8ec07001ca02df06b565aa9702e4c12'],
	[
		'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
		2827,
		'92c130a1ccf89854c859336ff0ecaf1d928a037ee04aa5e0304ecb3bc31016ce'
	]
];

describe("an account's face", () => {
	it.each(VELA)('is the one Vela Wallet draws for %j', (seed, length, hash) => {
		const svg = identiconOf(seed);
		expect(svg).toHaveLength(length);
		expect(sha256(svg)).toBe(hash);
	});

	it('does not depend on how the address is capitalised', () => {
		const lower = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
		expect(identiconSvg('0xd8Da6BF26964aF9D7eEd9e03E53415D37aA96045')).toBe(identiconOf(lower));
		expect(identiconSvg(lower)).toBe(identiconOf(lower));
	});

	it('carries no id, so that many can be on one page', () => {
		expect(identiconSvg('0x762EdA60D3B68755c271D608644650278f88329F')).not.toMatch(/\sid=/);
	});
});
