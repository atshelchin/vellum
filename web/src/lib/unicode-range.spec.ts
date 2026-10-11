import { describe, expect, it } from 'vitest';
import {
	formatRanges,
	holds,
	intersect,
	narrow,
	parseRanges,
	subtract,
	type Range
} from './unicode-range';

/** Korean's syllables and the letters they are built of: a writing to keep a face to, or out of. */
const HANGUL: Range[] = [
	[0x1100, 0x11ff],
	[0x3130, 0x318f],
	[0xa960, 0xa97f],
	[0xac00, 0xd7ff]
];

describe('the characters a piece of a face is for', () => {
	it('are read as a style sheet writes them', () => {
		expect(parseRanges('U+4e00-4eff, U+ff07,U+4e??, u+1F600')).toEqual([
			[0x4e00, 0x4eff],
			[0xff07, 0xff07],
			[0x4e00, 0x4eff],
			[0x1f600, 0x1f600]
		]);
	});

	it('are written back the same way', () => {
		expect(
			formatRanges([
				[0x4e00, 0x4eff],
				[0xff07, 0xff07]
			])
		).toBe('U+4e00-4eff, U+ff07');
	});

	it('can be kept to what lies inside some stretches', () => {
		expect(
			intersect(
				[
					[0x20, 0x7e],
					[0xabf0, 0xac10],
					[0xd7a0, 0xd900]
				],
				HANGUL
			)
		).toEqual([
			[0xac00, 0xac10],
			[0xd7a0, 0xd7ff]
		]);
	});

	it('can have some stretches taken out of them', () => {
		expect(
			subtract(
				[
					[0x20, 0x7e],
					[0xabf0, 0xac10],
					[0xac20, 0xac30],
					[0xd7f0, 0xd900]
				],
				HANGUL
			)
		).toEqual([
			[0x20, 0x7e],
			[0xabf0, 0xabff],
			[0xd800, 0xd900]
		]);
		// A stretch cut in two by what is taken out of its middle.
		expect(subtract([[0, 100]], [[40, 60]])).toEqual([
			[0, 39],
			[61, 100]
		]);
	});

	it('say whether a character is among them', () => {
		expect(holds([[0x4e00, 0x4eff]], 0x4e2d)).toBe(true);
		expect(holds([[0x4e00, 0x4eff]], 0x5b57)).toBe(false);
	});
});

describe('a style sheet kept to one writing', () => {
	const css = `/* a [1] */
@font-face {
  font-family: 'A';
  src: url(./files/a-1.woff2) format('woff2');
  unicode-range: U+20-7e, U+ac00-ac0f;
}
/* a [2] */
@font-face {
  font-family: 'A';
  src: url(./files/a-2.woff2) format('woff2');
  unicode-range: U+4e00-4eff;
}
`;

	it('keeps only that writing, and drops a piece that has none of it', () => {
		const kept = narrow(css, (ranges) => intersect(ranges, HANGUL));
		expect(kept).toContain('a-1.woff2');
		expect(kept).toContain('unicode-range: U+ac00-ac0f;');
		expect(kept).not.toContain('a-2.woff2');
		expect(kept).not.toContain('U+20-7e');
	});

	it('or gives that writing up, and keeps the rest', () => {
		const kept = narrow(css, (ranges) => subtract(ranges, HANGUL));
		expect(kept).toContain('unicode-range: U+20-7e;');
		expect(kept).toContain('unicode-range: U+4e00-4eff;');
		expect(kept).not.toContain('ac00');
	});

	it('leaves a rule alone that names no characters', () => {
		const whole = `@font-face { font-family: 'B'; src: url(b.woff2); }`;
		expect(narrow(whole, () => [])).toBe(whole);
	});
});
