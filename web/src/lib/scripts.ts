import type { Range } from './unicode-range.ts';

/**
 * Which face writes which writing.
 *
 * A diary is read at length, like a novel, and it is in whatever its keeper
 * writes in. So every writing is set in a face made for reading at length in
 * that writing: the kind a publisher sets a book in, with a little character
 * and nothing that tires the eye. No one face does that for every writing, so
 * this is the list of them, and it is the only one. The book reads it to draw
 * a page, the build reads it to keep each face to its own writing, and the
 * Worker reads it to draw the card a link unfolds into. A diary therefore
 * looks the same on every device, and on its cards.
 *
 * A writing that is not listed is drawn in whatever the device has, and is
 * left off a card.
 */

/**
 * The face of the entries themselves, wherever they are in Latin, Cyrillic,
 * Greek or Vietnamese: Literata, which was drawn for reading books on a
 * screen. Titles and dates are set in Cormorant, as a book's are in a display
 * cut of its text face.
 */
export const TEXT_FAMILY = 'Literata Variable';

export interface Script {
	id: 'han' | 'hangul' | 'thai' | 'devanagari' | 'arabic' | 'hebrew';
	/** The face that writes it, by the name its files give it. */
	family: string;
	/** The package its files and style sheets come in. */
	source: string;
	/** The characters of it, as stretches of Unicode. Its face is offered for these and nothing else. */
	ranges: readonly Range[];
	/** Written from the right. */
	rtl?: boolean;
	/**
	 * False if a card cannot be trusted to draw it. A browser sets every
	 * writing here properly. What draws the cards does not: it puts the vowel
	 * signs of Devanagari in the wrong places and loses the spaces after them,
	 * whatever face it is given, and in a line of Arabic it draws the full
	 * stops and the figures as empty boxes. Words spelled wrongly are worse
	 * than no words, so such a writing is on the pages and is left off the
	 * cards.
	 */
	card?: false;
	/**
	 * About how wide one letter is, in ems. For setting lines where the face
	 * is not there to be measured. Marks that sit on a letter are not counted.
	 */
	advance: number;
}

export const SCRIPTS: readonly Script[] = [
	{
		// Chinese and Japanese. A pen's regular script: what readers of Chinese
		// most often choose for a long book when the choice is theirs, with
		// simplified and traditional characters and kana in one face, each in the
		// shape a reader of simplified Chinese was taught. It was drawn from Klee,
		// a Japanese schoolbook hand, so Japanese is at home in it too.
		id: 'han',
		family: 'LXGW WenKai',
		source: 'lxgw-wenkai-webfont',
		ranges: [
			[0x2e80, 0x2fdf],
			[0x3000, 0x312f],
			[0x3190, 0x31ff],
			[0x3400, 0x4dbf],
			[0x4e00, 0x9fff],
			[0xf900, 0xfaff],
			[0xfe30, 0xfe4f],
			[0xff00, 0xffef],
			[0x20000, 0x323af]
		],
		advance: 1
	},
	{
		// Korean. A batang, the kind Korean novels are set in, drawn a little softer.
		id: 'hangul',
		family: 'Gowun Batang',
		source: '@fontsource/gowun-batang',
		ranges: [
			[0x1100, 0x11ff],
			[0x3130, 0x318f],
			[0xa960, 0xa97f],
			[0xac00, 0xd7ff]
		],
		advance: 0.92
	},
	{
		// Thai, with the loops a reader of Thai expects in a book.
		id: 'thai',
		family: 'Noto Serif Thai',
		source: '@fontsource/noto-serif-thai',
		ranges: [[0x0e00, 0x0e7f]],
		advance: 0.62
	},
	{
		// Hindi, Marathi, Nepali and the rest that Devanagari writes.
		id: 'devanagari',
		family: 'Noto Serif Devanagari',
		source: '@fontsource/noto-serif-devanagari',
		ranges: [
			[0x0900, 0x097f],
			[0x1cd0, 0x1cff],
			[0xa8e0, 0xa8ff]
		],
		card: false,
		advance: 0.6
	},
	{
		// Arabic, Persian, Urdu. A naskh, which is what a book in Arabic is set in.
		id: 'arabic',
		family: 'Noto Naskh Arabic',
		source: '@fontsource/noto-naskh-arabic',
		ranges: [
			[0x0600, 0x06ff],
			[0x0750, 0x077f],
			[0x08a0, 0x08ff],
			[0xfb50, 0xfdff],
			[0xfe70, 0xfeff]
		],
		rtl: true,
		card: false,
		advance: 0.5
	},
	{
		// Hebrew. Frank-Ruhl, which nearly every Hebrew novel is set in.
		id: 'hebrew',
		family: 'Frank Ruhl Libre',
		source: '@fontsource/frank-ruhl-libre',
		ranges: [
			[0x0590, 0x05ff],
			[0xfb1d, 0xfb4f]
		],
		rtl: true,
		advance: 0.5
	}
];

/** Some stretches of Unicode, as the inside of a pattern's character class. */
function within(ranges: readonly Range[]): string {
	return ranges
		.map(([first, last]) => String.raw`\u{${first.toString(16)}}-\u{${last.toString(16)}}`)
		.join('');
}

/**
 * One or more characters of a writing. One written from the right takes the
 * spaces, figures and stops between its words with it, so that a phrase of it
 * is one stretch and is laid out as a whole: drawn a word at a time from the
 * left, it would come out backwards.
 */
function stretch(script: Script): string {
	const own = `[${within(script.ranges)}]`;
	return script.rtl ? String.raw`(?:${own}+(?:[\s\p{P}\p{N}]+(?=${own}))?)+` : `${own}+`;
}

const RUN = new RegExp(
	SCRIPTS.map((script) => `(?<${script.id}>${stretch(script)})`).join('|'),
	'gu'
);

/** A stretch of a line that one face writes. `script` is `null` for what the text face writes itself. */
export interface Run {
	text: string;
	script: Script | null;
}

/** A line as the stretches of it that different faces write, in order. */
export function runsOf(text: string): Run[] {
	const runs: Run[] = [];
	let from = 0;
	for (const found of text.matchAll(RUN)) {
		if (found.index > from) runs.push({ text: text.slice(from, found.index), script: null });
		const script = SCRIPTS.find((each) => found.groups?.[each.id] !== undefined) ?? null;
		runs.push({ text: found[0], script });
		from = found.index + found[0].length;
	}
	if (from < text.length) runs.push({ text: text.slice(from), script: null });
	return runs;
}

/** The listed writings a text has any of. */
export function scriptsIn(text: string): Script[] {
	const found = new Set<Script>();
	for (const run of runsOf(text)) if (run.script) found.add(run.script);
	return [...found];
}

/** Whether a line reads from the right: whether the first letter in it is of a writing that does. */
export function fromTheRight(text: string): boolean {
	const first = /\p{L}/u.exec(text)?.[0];
	if (!first) return false;
	const code = first.codePointAt(0)!;
	return SCRIPTS.some(
		(script) => script.rtl && script.ranges.some(([from, to]) => from <= code && code <= to)
	);
}

/** The faces for the listed writings, as a font stack: what follows the text face, or the serif. */
export const SCRIPT_FAMILIES = SCRIPTS.map((script) => `"${script.family}"`).join(', ');
