import { read } from '$app/server';
import hebrewSheet from '@fontsource/frank-ruhl-libre/400.css?raw';
import hangulSheet from '@fontsource/gowun-batang/400.css?raw';
import arabicSheet from '@fontsource/noto-naskh-arabic/400.css?raw';
import devanagariSheet from '@fontsource/noto-serif-devanagari/400.css?raw';
import thaiSheet from '@fontsource/noto-serif-thai/400.css?raw';
import hanSheet from 'lxgw-wenkai-webfont/lxgwwenkai-regular.css?raw';
import type { Script } from '#lib/scripts.ts';
import { holds, parseRanges, type Range } from '#lib/unicode-range.ts';
import italic from './VellumItalic.ttf';
import serif from './VellumSerif.ttf';
import text from './VellumText.ttf';
import textItalic from './VellumTextItalic.ttf';

/**
 * The faces a card is set in: the ones the book is set in.
 *
 * Four are whole, and small: the face the entries are in, upright and
 * italic, and the serif of the titles, upright and italic. They are cut down
 * to Latin, Cyrillic, Greek and Vietnamese by `scripts/card-fonts.py`.
 *
 * The faces for other writing (`lib/scripts.ts`) come to a browser cut into
 * pieces, of which it fetches the few a text has characters in. A card is
 * drawn from those same pieces, picked the same way, by the same list: so
 * what a card shows of a diary is letter for letter what its pages show, and
 * nothing is asked of anyone else's server to draw it.
 */
let own: Promise<Uint8Array[]> | undefined;

export function ownFonts(): Promise<Uint8Array[]> {
	return (own ??= Promise.all(
		[text, textItalic, serif, italic].map(
			async (asset) => new Uint8Array(await read(asset).arrayBuffer())
		)
	));
}

/**
 * The pieces of each face, by file name, as the addresses they are served
 * from. All of them, and not only the pieces with the writing's own letters:
 * a phrase of Arabic has full stops and figures in it, which are in another
 * piece of the same face. (Each list is asked for in full where it is, because a build can only
 * read a list that is spelled out.)
 */
const files: Record<Script['id'], Record<string, string>> = {
	han: import.meta.glob(
		'/node_modules/lxgw-wenkai-webfont/files/lxgwwenkai-regular-subset-*.woff2',
		{
			query: '?url',
			import: 'default',
			eager: true,
			exhaustive: true
		}
	),
	hangul: import.meta.glob('/node_modules/@fontsource/gowun-batang/files/*-400-normal.woff2', {
		query: '?url',
		import: 'default',
		eager: true,
		exhaustive: true
	}),
	thai: import.meta.glob('/node_modules/@fontsource/noto-serif-thai/files/*-400-normal.woff2', {
		query: '?url',
		import: 'default',
		eager: true,
		exhaustive: true
	}),
	devanagari: import.meta.glob(
		'/node_modules/@fontsource/noto-serif-devanagari/files/*-400-normal.woff2',
		{
			query: '?url',
			import: 'default',
			eager: true,
			exhaustive: true
		}
	),
	arabic: import.meta.glob('/node_modules/@fontsource/noto-naskh-arabic/files/*-400-normal.woff2', {
		query: '?url',
		import: 'default',
		eager: true,
		exhaustive: true
	}),
	hebrew: import.meta.glob('/node_modules/@fontsource/frank-ruhl-libre/files/*-400-normal.woff2', {
		query: '?url',
		import: 'default',
		eager: true,
		exhaustive: true
	})
};

const sheets: Record<Script['id'], string> = {
	han: hanSheet,
	hangul: hangulSheet,
	thai: thaiSheet,
	devanagari: devanagariSheet,
	arabic: arabicSheet,
	hebrew: hebrewSheet
};

/** One piece of a face: where it is, and the characters in it. */
interface Piece {
	asset: string;
	ranges: Range[];
}

const pieces = new Map<Script['id'], Piece[]>();

/** A face's pieces, read off the same list a browser is given. */
function piecesOf(script: Script['id']): Piece[] {
	let known = pieces.get(script);
	if (!known) {
		const named = Object.entries(files[script]).map(
			([path, asset]) => [path.slice(path.lastIndexOf('/') + 1), asset] as const
		);
		known = [];
		for (const [, rule] of sheets[script].matchAll(/@font-face\s*{([^}]*)}/g)) {
			const file = /url\(['"]?[^'")]*?([^/'")]+\.woff2)['"]?\)/.exec(rule)?.[1];
			const ranges = /unicode-range:\s*([^;]+)/.exec(rule)?.[1];
			const asset = named.find(([name]) => name === file)?.[1];
			if (asset && ranges) known.push({ asset, ranges: parseRanges(ranges) });
		}
		pieces.set(script, known);
	}
	return known;
}

// A piece that has been read is kept: the next card with the same common
// characters on it, which is most of them, has it at once.
const fetched = new Map<string, Promise<Uint8Array>>();

function piece(asset: string): Promise<Uint8Array> {
	let reading = fetched.get(asset);
	if (!reading) {
		reading = read(asset)
			.arrayBuffer()
			.then((buffer) => new Uint8Array(buffer));
		// One that could not be read is asked for again next time.
		reading.catch(() => fetched.delete(asset));
		fetched.set(asset, reading);
	}
	return reading;
}

export interface ScriptFonts {
	fonts: Uint8Array[];
	/** False if a piece that was wanted could not be read: some character will be missing. */
	whole: boolean;
}

/**
 * The pieces that hold these characters, for each writing: `written` is, for
 * each face, every character that is to be drawn in it.
 */
export async function scriptFonts(written: Map<Script['id'], Set<string>>): Promise<ScriptFonts> {
	const wanted = new Set<string>();
	for (const [script, characters] of written) {
		const known = piecesOf(script);
		for (const character of characters) {
			const code = character.codePointAt(0)!;
			const holder = known.find((each) => holds(each.ranges, code));
			if (holder) wanted.add(holder.asset);
		}
	}
	const read = await Promise.allSettled([...wanted].map(piece));
	const fonts = read.filter((each) => each.status === 'fulfilled').map((each) => each.value);
	for (const each of read) {
		if (each.status === 'rejected') {
			console.error('Vellum: a piece of a face could not be read for a card', each.reason);
		}
	}
	return { fonts, whole: fonts.length === read.length };
}
