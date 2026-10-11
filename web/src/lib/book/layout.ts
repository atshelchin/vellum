/**
 * Setting an entry's words on pages: where the lines break, and where the
 * pages do. Nothing here draws; it is given a way to measure text and answers
 * in lines.
 */

/** The width of a run of text, in the same units as the page. */
export type Measure = (text: string) => number;

/**
 * A page as it is painted, in pixels of its texture. A page is the same shape
 * whatever it is painted for; what changes with the screen is how large the
 * writing is, and so how much of it a page holds.
 */
export interface Metrics {
	name: 's' | 'm' | 'l' | 'xl';
	width: number;
	height: number;
	/** The margin on the side the page is bound. */
	inner: number;
	outer: number;
	top: number;
	fontSize: number;
	lineHeight: number;
	/** Lines on a page that begins an entry, under its date. */
	firstLines: number;
	/** Lines on every page after that. */
	lines: number;
}

export const PAGE_WIDTH = 1024;
export const PAGE_HEIGHT = 1454;

/**
 * The same page set four ways, from the smallest writing to the largest. The
 * smaller the page is on the screen, the larger the writing has to be drawn
 * on it to be read, and the fewer lines it holds.
 */
const SETTINGS: Metrics[] = [
	{
		name: 's',
		inner: 110,
		outer: 80,
		top: 128,
		fontSize: 40,
		lineHeight: 50,
		firstLines: 21,
		lines: 24
	},
	{
		name: 'm',
		inner: 112,
		outer: 82,
		top: 130,
		fontSize: 46,
		lineHeight: 57,
		firstLines: 18,
		lines: 21
	},
	{
		name: 'l',
		inner: 96,
		outer: 70,
		top: 132,
		fontSize: 54,
		lineHeight: 68,
		firstLines: 14,
		lines: 17
	},
	{
		name: 'xl',
		inner: 90,
		outer: 64,
		top: 132,
		fontSize: 62,
		lineHeight: 78,
		firstLines: 12,
		lines: 15
	}
].map((setting) => ({ ...setting, width: PAGE_WIDTH, height: PAGE_HEIGHT }) as Metrics);

/** The smallest the handwriting may appear on a screen, in CSS pixels. */
const LEGIBLE = 19;

/**
 * How to set a page that will be `shown` CSS pixels wide on the screen: with
 * the smallest writing that can still be read at that size, so that a page
 * holds as much as it can.
 */
export function metricsFor(shown: number): Metrics {
	return (
		SETTINGS.find((setting) => (setting.fontSize * shown) / PAGE_WIDTH >= LEGIBLE) ??
		SETTINGS[SETTINGS.length - 1]
	);
}

/** What a page is set in before anything is known about the screen. */
export const DEFAULT_METRICS = SETTINGS[0];

export function textWidth(metrics: Metrics): number {
	return metrics.width - metrics.inner - metrics.outer;
}

const segmenter =
	typeof Intl !== 'undefined' && 'Segmenter' in Intl
		? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
		: null;

/** What a reader would call the characters of a string: an emoji is one, however it is built. */
function characters(text: string): string[] {
	return segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text);
}

/**
 * Breaks text into lines no wider than `width`. A line break in the text is
 * kept, and an empty line is an empty string. A word too long for a line — a
 * link, or writing in a script that does not put spaces between words — is
 * broken where it has to be.
 */
export function wrap(text: string, width: number, measure: Measure): string[] {
	const lines: string[] = [];
	const paragraphs = text.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');

	for (const paragraph of paragraphs) {
		if (paragraph.trim() === '') {
			lines.push('');
			continue;
		}
		let line = '';
		for (const word of paragraph.trimEnd().split(' ')) {
			const candidate = line === '' ? word : `${line} ${word}`;
			if (measure(candidate) <= width) {
				line = candidate;
				continue;
			}
			if (line !== '') lines.push(line);
			line = word;
			if (measure(line) <= width) continue;

			// The word alone is too long: fill lines with as much of it as fits.
			let part = '';
			for (const character of characters(word)) {
				if (part !== '' && measure(part + character) > width) {
					lines.push(part);
					part = character;
				} else {
					part += character;
				}
			}
			line = part;
		}
		lines.push(line);
	}

	while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
	while (lines.length > 0 && lines[0] === '') lines.shift();
	return lines;
}

/**
 * Deals lines onto pages: `first` on the first, `rest` on each one after. A
 * page never opens on an empty line. There is always at least one page.
 */
export function paginate(lines: string[], first: number, rest: number): string[][] {
	const pages: string[][] = [];
	let page: string[] = [];
	for (const line of lines) {
		if (page.length === 0 && line === '') continue;
		page.push(line);
		if (page.length === (pages.length === 0 ? first : rest)) {
			pages.push(page);
			page = [];
		}
	}
	if (page.length > 0 || pages.length === 0) pages.push(page);
	return pages;
}
