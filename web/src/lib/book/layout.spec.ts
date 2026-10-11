import { describe, expect, it } from 'vitest';
import { metricsFor, paginate, wrap } from './layout';

/** Ten units a character: a line of width 100 holds ten. */
const measure = (text: string) => Array.from(text).length * 10;

describe('wrap', () => {
	it('breaks between words', () => {
		expect(wrap('one two three four', 100, measure)).toEqual(['one two', 'three four']);
	});

	it('keeps the line breaks that were written, and the empty lines', () => {
		expect(wrap('Dear diary,\n\nToday.', 200, measure)).toEqual(['Dear diary,', '', 'Today.']);
	});

	it('drops empty lines from the ends, never from the middle', () => {
		expect(wrap('\n\nfirst\n\n\nlast\n\n', 200, measure)).toEqual(['first', '', '', 'last']);
	});

	it('breaks a word that is longer than a line', () => {
		expect(wrap('abcdefghijklmnopqrstuvwxy', 100, measure)).toEqual([
			'abcdefghij',
			'klmnopqrst',
			'uvwxy'
		]);
	});

	it('breaks writing that has no spaces to break at', () => {
		const lines = wrap('今天下雨了我没有出门只是坐在窗边看了一下午的书', 100, measure);
		expect(lines.every((line) => measure(line) <= 100)).toBe(true);
		expect(lines.join('')).toBe('今天下雨了我没有出门只是坐在窗边看了一下午的书');
	});

	it('never cuts an emoji in half', () => {
		const lines = wrap(
			'👩‍👩‍👧‍👦'.repeat(6),
			30,
			(text) => [...new Intl.Segmenter().segment(text)].length * 10
		);
		expect(lines.join('')).toBe('👩‍👩‍👧‍👦'.repeat(6));
		for (const line of lines) expect(line.length % '👩‍👩‍👧‍👦'.length).toBe(0);
	});

	it('loses none of the words', () => {
		const text = 'The quick brown fox jumps over the lazy dog and keeps on running until dark';
		expect(wrap(text, 130, measure).join(' ')).toBe(text);
	});

	it('gives no lines for no words', () => {
		expect(wrap('', 100, measure)).toEqual([]);
		expect(wrap('  \n \n', 100, measure)).toEqual([]);
	});
});

describe('paginate', () => {
	const lines = (count: number) => Array.from({ length: count }, (_, index) => `line ${index}`);

	it('puts fewer lines on the first page than on the rest', () => {
		const pages = paginate(lines(10), 3, 4);
		expect(pages.map((page) => page.length)).toEqual([3, 4, 3]);
		expect(pages.flat()).toEqual(lines(10));
	});

	it('always gives a page, even for nothing', () => {
		expect(paginate([], 3, 4)).toEqual([[]]);
	});

	it('does not open a page on an empty line', () => {
		const pages = paginate(['a', 'b', '', 'c'], 2, 2);
		expect(pages).toEqual([['a', 'b'], ['c']]);
	});

	it('fills a page exactly without leaving an empty one after it', () => {
		expect(paginate(lines(7), 3, 4)).toHaveLength(2);
	});
});

describe('metricsFor', () => {
	it('sets small pages in larger writing, so it can still be read', () => {
		const phone = metricsFor(340);
		const desk = metricsFor(640);
		expect(phone.fontSize).toBeGreaterThan(desk.fontSize);
		expect(phone.lines).toBeLessThan(desk.lines);
	});

	it('never lets the writing fall under what is legible, down to a small phone', () => {
		for (let shown = 320; shown <= 1200; shown += 10) {
			const metrics = metricsFor(shown);
			expect((metrics.fontSize * shown) / metrics.width).toBeGreaterThanOrEqual(19);
		}
	});

	it('keeps every setting inside the page', () => {
		for (const shown of [300, 380, 440, 520, 900]) {
			const metrics = metricsFor(shown);
			expect(metrics.top + metrics.lines * metrics.lineHeight).toBeLessThan(metrics.height - 90);
			expect(metrics.firstLines).toBeLessThan(metrics.lines);
			expect(metrics.inner + metrics.outer).toBeLessThan(metrics.width / 3);
		}
	});
});
