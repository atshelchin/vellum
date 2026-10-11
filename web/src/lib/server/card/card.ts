import { Resvg } from '@cf-wasm/resvg';
import { COVERS } from '#lib/book/covers.ts';
import { wrap } from '#lib/book/layout.ts';
import { identiconSvg } from '#lib/identicon.ts';
import { fromTheRight, runsOf, SCRIPTS, type Script } from '#lib/scripts.ts';
import { SEAL_EDGE, SEAL_V } from '#lib/seal.ts';
import { ownFonts, scriptFonts } from './fonts.ts';
import widths from './widths.json';

/**
 * The picture a shared link unfolds into on X, in Telegram, in Discord.
 *
 * A link to a diary unfolds into the book: its leather, its title in gold, how
 * much is in it and its latest words. A link to one entry unfolds into the
 * page: the day, and what was written. Both say whose it is. A reader should
 * know what they are being handed before they open it.
 *
 * Whatever a card shows was read from the chain by whoever drew it, and is
 * shown only for a link that opens the diary: a card is the diary's first
 * page, not a way round its key.
 */
export type Card =
	| { kind: 'home' }
	| {
			kind: 'diary';
			title: string;
			cover: number;
			entries: number;
			/** Unix seconds. */
			since: number;
			owner: string;
			/** What it is signed with, or nothing. */
			penName: string;
			/** The chain it is kept on, by name. */
			where: string;
			practice: boolean;
			/** The latest entry, if there is one: a card of a diary says something of what is in it. */
			latest?: string;
	  }
	| {
			kind: 'entry';
			title: string;
			cover: number;
			/** Counted from one. */
			number: number;
			/** Unix seconds. */
			writtenAt: number;
			owner: string;
			penName: string;
			where: string;
			practice: boolean;
			text: string;
	  };

const WIDTH = 1200;
const HEIGHT = 630;

const PAPER = '#f4ecd9';
const INK = '#1b2540';
const SEPIA = '#6f4428';
const NIGHT = '#14100d';
const CREAM = '#f2eadb';
const MUTED = '#b9ab95';
const GOLD = '#d9b45a';

/** The faces that travel with the site: the one the entries are in, and the serif of the titles. */
type Face = 'text' | 'textItalic' | 'serif' | 'italic';
const FAMILY: Record<Face, string> = {
	text: 'Vellum Text',
	textItalic: 'Vellum Text Italic',
	serif: 'Vellum Serif',
	italic: 'Vellum Italic'
};
const LETTERS = widths as Record<Face, Record<string, number>>;

function escape(text: string): string {
	return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Text as a card can set it: one space where there was any run of them, and
 * nothing the faces at hand have no letter for. An emoji would print as an
 * empty box, and a box says less than its absence.
 */
function settable(text: string, face: Face): string {
	let kept = '';
	for (const run of runsOf(text)) {
		// A writing a card would get wrong is left off it: see `card` in `lib/scripts.ts`.
		if (run.script) kept += run.script.card === false ? ' ' : run.text;
		else {
			for (const char of run.text) if (char === '\n' || char in LETTERS[face]) kept += char;
		}
	}
	return kept
		.split('\n')
		.map((line) => line.replace(/\s+/g, ' ').trim())
		.join('\n')
		.trim();
}

/** How wide a run of text is, set in a face at a size. */
function measure(face: Face, size: number): (text: string) => number {
	return (text) => {
		let width = 0;
		for (const run of runsOf(text)) {
			if (run.script) {
				// A mark that sits on a letter takes no room of its own.
				const letters = Array.from(run.text).filter((char) => !/\p{M}/u.test(char)).length;
				width += letters * size * run.script.advance;
			} else {
				for (const char of run.text) width += (LETTERS[face][char] ?? 0.5) * size;
			}
		}
		return width;
	};
}

/**
 * A line as SVG: what the card's own face writes, in that face, and every
 * other writing in the face that the book uses for it (`lib/scripts.ts`).
 */
function spans(text: string): string {
	return runsOf(text)
		.map((run) =>
			run.script
				? `<tspan font-family="${run.script.family}">${escape(run.text)}</tspan>`
				: escape(run.text)
		)
		.join('');
}

interface Style {
	face: Face;
	size: number;
	fill: string;
	anchor?: 'start' | 'middle' | 'end';
	spacing?: number;
	opacity?: number;
}

function line(x: number, y: number, text: string, style: Style): string {
	return `<text x="${x}" y="${y}" font-family="${FAMILY[style.face]}" font-size="${style.size}" fill="${style.fill}"${
		style.anchor ? ` text-anchor="${style.anchor}"` : ''
	}${style.spacing ? ` letter-spacing="${style.spacing}"` : ''}${
		style.opacity ? ` opacity="${style.opacity}"` : ''
	} xml:space="preserve">${spans(text)}</text>`;
}

/** Cuts a line short enough to fit, and says that it was cut. */
function clip(text: string, width: number, fits: (text: string) => number): string {
	if (fits(text) <= width) return text;
	let kept = text;
	while (kept.length > 1 && fits(`${kept}…`) > width) kept = kept.slice(0, -1);
	return `${kept.trimEnd()}…`;
}

/** The first `count` lines of a text set to a width, the last of them ending in an ellipsis if there was more. */
function excerpt(text: string, width: number, count: number, fits: (text: string) => number) {
	// A card has room for a few lines: a blank one between paragraphs is a line lost.
	const lines = wrap(text.replace(/\n{2,}/g, '\n'), width, fits).filter((each) => each !== '');
	if (lines.length <= count) return lines;
	const kept = lines.slice(0, count);
	kept[count - 1] = clip(`${kept[count - 1]} …`.replace(/\s+…$/, '…'), width, fits);
	if (!kept[count - 1].endsWith('…')) kept[count - 1] += '…';
	return kept;
}

/** Sets a title in the largest of some sizes at which it fits on a few lines. */
function fit(text: string, face: Face, width: number, sizes: number[], maxLines: number) {
	let widowed: { size: number; lines: string[] } | undefined;
	for (const size of sizes) {
		const fits = measure(face, size);
		const lines = wrap(text, width, fits);
		if (lines.length > maxLines || lines.some((each) => fits(each) > width)) continue;
		// A last line of a word or a character is worth a size to be rid of, if a size does it.
		const widow = lines.length > 1 && fits(lines[lines.length - 1]) < width * 0.3;
		if (!widow) return widowed && widowed.lines.length <= lines.length ? widowed : { size, lines };
		widowed ??= { size, lines };
	}
	if (widowed) return widowed;
	const size = sizes[sizes.length - 1];
	return { size, lines: excerpt(text, width, maxLines, measure(face, size)) };
}

const DAY = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC'
});
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });

/** A card is read anywhere, so it gives the day as it was at Greenwich. */
const day = (seconds: number) => DAY.format(new Date(seconds * 1000));
const weekday = (seconds: number) => WEEKDAY.format(new Date(seconds * 1000));

const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/**
 * An account's face, `size` across, with its top left corner at (x, y): the
 * same picture its keeper sees in Vela Wallet, cut round as the wallet cuts
 * it. A name can be anyone's and a short address is easily imitated; the face
 * follows from every letter of the address.
 */
function portrait(address: string, x: number, y: number, size: number, edge: string): string {
	const drawing = identiconSvg(address)
		.replace(/^<svg[^>]*>/, '')
		.replace(/<\/svg>$/, '');
	const half = size / 2;
	return `<clipPath id="face"><circle cx="${x + half}" cy="${y + half}" r="${half}"/></clipPath>
		<g clip-path="url(#face)"><g transform="translate(${x} ${y}) scale(${size / 160})">${drawing}</g></g>
		<circle cx="${x + half}" cy="${y + half}" r="${half}" fill="none" stroke="${edge}" stroke-opacity="0.35" stroke-width="1.5"/>`;
}

/** Vellum's seal, `size` across, with its top left corner at (x, y). */
function seal(x: number, y: number, size: number): string {
	const scale = size / 64;
	return `<g transform="translate(${x} ${y}) scale(${scale})">
		<path d="${SEAL_EDGE}" fill="#3a0806" opacity="0.5" transform="translate(1.4 2.6)"/>
		<path d="${SEAL_EDGE}" fill="url(#wax)"/>
		<circle cx="32" cy="32" r="19.4" fill="none" stroke="#4d0b09" stroke-opacity="0.55" stroke-width="2.2"/>
		<circle cx="32.6" cy="32.8" r="19.4" fill="none" stroke="#ffb7a3" stroke-opacity="0.34" stroke-width="0.9"/>
		<path d="${SEAL_V}" fill="#ffb7a3" fill-opacity="0.36" transform="translate(0.7 0.9)"/>
		<path d="${SEAL_V}" fill="#560d0a" fill-opacity="0.78"/>
		<path d="${SEAL_EDGE}" fill="url(#shine)"/>
	</g>`;
}

/** The name, and its seal, in a corner: whose site this is. `x` is where the name ends. */
function signature(x: number, y: number, fill: string, practice: boolean): string {
	const name = line(x - 62, y + 12, 'Vellum', { face: 'serif', size: 38, fill, anchor: 'end' });
	const tag = practice
		? `<rect x="${x - 322}" y="${y - 17}" width="132" height="36" rx="18" fill="${GOLD}" fill-opacity="0.2"/>` +
			line(x - 256, y + 8, 'TESTNET', {
				face: 'serif',
				size: 20,
				fill: fill === CREAM ? GOLD : SEPIA,
				anchor: 'middle',
				spacing: 3
			})
		: '';
	return tag + name + seal(x - 52, y - 28, 56);
}

const DEFS = `<defs>
	<radialGradient id="wax" cx="36%" cy="30%" r="78%">
		<stop offset="0" stop-color="#e45d4f"/><stop offset="0.52" stop-color="#b22d24"/><stop offset="1" stop-color="#6f1512"/>
	</radialGradient>
	<radialGradient id="shine" cx="31%" cy="24%" r="36%">
		<stop offset="0" stop-color="#fff1e9" stop-opacity="0.55"/><stop offset="1" stop-color="#fff1e9" stop-opacity="0"/>
	</radialGradient>
	<radialGradient id="lamp" cx="26%" cy="14%" r="80%">
		<stop offset="0" stop-color="#d9a05a" stop-opacity="0.3"/><stop offset="0.6" stop-color="#d9a05a" stop-opacity="0"/>
	</radialGradient>
	<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
		<stop offset="0" stop-color="#f8e7a8"/><stop offset="0.45" stop-color="#d8ad4f"/><stop offset="0.75" stop-color="#b98a30"/><stop offset="1" stop-color="#efd58a"/>
	</linearGradient>
	<linearGradient id="gutter" x1="0" y1="0" x2="1" y2="0">
		<stop offset="0" stop-color="#3a2816" stop-opacity="0.32"/><stop offset="0.1" stop-color="#3a2816" stop-opacity="0"/>
	</linearGradient>
	<radialGradient id="worn" cx="50%" cy="44%" r="72%">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.1"/><stop offset="0.5" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity="0.42"/>
	</radialGradient>
</defs>`;

const night = `<rect width="${WIDTH}" height="${HEIGHT}" fill="${NIGHT}"/><rect width="${WIDTH}" height="${HEIGHT}" fill="url(#lamp)"/>`;

function home(): string {
	return (
		night +
		// A diary at the edge of the lamplight, most of it off the card.
		book('Diary', 0, 'translate(968 86) rotate(7 176 250)') +
		seal(96, 92, 112) +
		line(232, 172, 'Vellum', { face: 'serif', size: 84, fill: CREAM }) +
		line(96, 336, 'A diary that outlives', { face: 'serif', size: 92, fill: CREAM }) +
		line(96, 430, 'its writer.', { face: 'serif', size: 92, fill: 'url(#gold)' }) +
		line(98, 512, 'Written a page at a time on Ethereum, and kept there for good.', {
			face: 'italic',
			size: 36,
			fill: MUTED
		}) +
		line(98, 566, 'FOR VELA WALLET', { face: 'serif', size: 22, fill: GOLD, spacing: 5 })
	);
}

/** The book, shut: its leather, its gold, its title. `at` is the transform that puts it on the card. */
function book(title: string, cover: number, at = 'translate(104 60) rotate(-4 176 250)'): string {
	const style = COVERS[cover % COVERS.length];
	const foil = style.metal ? 'url(#gold)' : style.foil[0];
	const set = fit(title, 'serif', 236, [50, 44, 38, 32, 27], 4);
	const leading = set.size * 1.14;
	const first = 222 - ((set.lines.length - 1) * leading) / 2;
	return `<g transform="${at}">
		<rect x="10" y="16" width="352" height="498" rx="10" fill="#000" opacity="0.5"/>
		<rect x="12" y="7" width="352" height="486" rx="5" fill="#e6dcc3"/>
		<rect x="358" y="9" width="2" height="482" fill="#bfb293"/><rect x="361" y="9" width="1.5" height="482" fill="#cfc3a6"/>
		<rect width="352" height="500" rx="10" fill="${style.leather}"/>
		<rect width="352" height="500" rx="10" fill="url(#worn)"/>
		<rect x="18" width="5" height="500" fill="#000" opacity="0.28"/><rect x="23" width="2" height="500" fill="#fff" opacity="0.07"/>
		<rect x="38" y="24" width="290" height="452" fill="none" stroke="${foil}" stroke-width="3"/>
		<rect x="47" y="33" width="272" height="434" fill="none" stroke="${foil}" stroke-width="1"/>
		<path d="M168 ${first - set.size - 20}l8-8 8 8-8 8z" fill="${foil}"/>
		${set.lines.map((each, index) => line(184, first + index * leading, each, { face: 'serif', size: set.size, fill: foil, anchor: 'middle' })).join('')}
		<path d="M124 ${first + (set.lines.length - 1) * leading + 44}h46m28 0h46" stroke="${foil}" stroke-width="2"/>
		<path d="M176 ${first + (set.lines.length - 1) * leading + 44}l8-7 8 7-8 7z" fill="${foil}"/>
		${line(184, 440, 'VELLUM', { face: 'serif', size: 17, fill: foil, anchor: 'middle', spacing: 8 })}
	</g>`;
}

function diary(card: Extract<Card, { kind: 'diary' }>): string {
	const left = 536;
	const width = 590;
	const title = fit(card.title, 'serif', width, [78, 66, 56, 48, 40], 2);
	const leading = title.size * 1.08;
	const top = 196;
	let y = top;
	let out =
		night +
		book(card.title, card.cover) +
		line(
			left,
			114,
			card.practice
				? `A PRACTICE DIARY ON ${card.where.toUpperCase()}`
				: `A DIARY KEPT ON ${card.where.toUpperCase()}`,
			{ face: 'serif', size: 22, fill: GOLD, spacing: 4.5 }
		);

	out += title.lines
		.map((each, index) =>
			line(left, top + index * leading, each, { face: 'serif', size: title.size, fill: CREAM })
		)
		.join('');
	y += (title.lines.length - 1) * leading + 58;
	out += line(
		left,
		y,
		`${card.entries === 0 ? 'Not a word yet' : `${card.entries.toLocaleString('en-US')} ${card.entries === 1 ? 'entry' : 'entries'}`} · since ${day(card.since)}`,
		{ face: 'italic', size: 31, fill: MUTED }
	);

	// Something of what is in it: the latest words, in the face they are read in.
	if (card.latest) {
		const fits = measure('text', 32);
		const quoted = excerpt(card.latest, width - 26, 2, fits);
		if (quoted.length > 0) {
			y += 58;
			out += `<rect x="${left}" y="${y - 30}" width="3" height="${quoted.length * 50 - 6}" fill="${GOLD}" opacity="0.7"/>`;
			out += quoted
				.map((each, index) =>
					line(left + 24, y + 6 + index * 50, each, {
						face: 'text',
						size: 32,
						fill: CREAM,
						opacity: 0.92
					})
				)
				.join('');
		}
	}

	// Whose it is: the name it is signed with, and under it the account, which
	// is the part of that nobody else can sign with.
	if (card.penName) {
		out += portrait(card.owner, left, 524, 60, CREAM);
		out += line(left + 78, 551, clip(card.penName, 290, measure('serif', 32)), {
			face: 'serif',
			size: 32,
			fill: CREAM
		});
		out += line(left + 78, 578, short(card.owner), { face: 'serif', size: 21, fill: MUTED });
	} else {
		out += portrait(card.owner, left, 528, 56, CREAM);
		out += line(left + 74, 566, `kept by ${short(card.owner)}`, {
			face: 'serif',
			size: 28,
			fill: MUTED
		});
	}
	// Its first line already says it is a practice diary.
	out += signature(1140, 560, CREAM, false);
	return out;
}

function entry(card: Extract<Card, { kind: 'entry' }>): string {
	const style = COVERS[card.cover % COVERS.length];
	const left = 178;
	const right = 1112;
	const rows = [246, 308, 370, 432, 494];
	const fits = measure('text', 39);
	const body = excerpt(card.text, right - left, rows.length, fits);

	let out = night;
	// A page, with the edge of its binding showing down the left.
	out += `<rect x="40" y="30" width="1120" height="570" rx="8" fill="${style.leather}"/>`;
	out += `<rect x="40" y="30" width="1120" height="570" rx="8" fill="url(#worn)" opacity="0.6"/>`;
	out += `<rect x="62" y="30" width="1098" height="570" fill="${PAPER}"/>`;
	out += `<rect x="62" y="30" width="1098" height="570" fill="url(#gutter)"/>`;
	out += rows
		.map(
			(row) =>
				`<path d="M62 ${row}H1160" stroke="#465c8c" stroke-opacity="0.22" stroke-width="1.5"/>`
		)
		.join('');
	out += `<path d="M150 56V574" stroke="#b8443a" stroke-opacity="0.34" stroke-width="1.5"/>`;

	out += line(left, 132, day(card.writtenAt), { face: 'serif', size: 64, fill: SEPIA });
	out += line(right, 126, `${weekday(card.writtenAt).toUpperCase()}  ·  ENTRY ${card.number}`, {
		face: 'serif',
		size: 21,
		fill: SEPIA,
		anchor: 'end',
		spacing: 3.5,
		opacity: 0.8
	});
	out += `<path d="M150 164H1136" stroke="${SEPIA}" stroke-opacity="0.5" stroke-width="2"/><path d="M150 171H1136" stroke="${SEPIA}" stroke-opacity="0.5" stroke-width="1"/>`;

	out += body
		.map((each, index) =>
			fromTheRight(each)
				? // A line in a writing that runs from the right starts at the right.
					line(right, rows[index] - 17, each, { face: 'text', size: 39, fill: INK, anchor: 'end' })
				: line(left, rows[index] - 17, each, { face: 'text', size: 39, fill: INK })
		)
		.join('');

	// Whose page it is, and which of their books it is from.
	const who = short(card.owner);
	if (card.penName) {
		// Signed: the name, and under it the account and the book.
		out += portrait(card.owner, left, 524, 54, SEPIA);
		out += line(left + 68, 549, clip(card.penName, 500, measure('serif', 29)), {
			face: 'serif',
			size: 29,
			fill: SEPIA
		});
		const whoWidth = measure('serif', 20)(who);
		out += line(left + 68, 574, who, { face: 'serif', size: 20, fill: SEPIA, opacity: 0.8 });
		out += line(
			left + 68 + whoWidth + 10,
			574,
			clip(`· ${card.title}`, 760 - (left + 68 + whoWidth + 10), measure('italic', 21)),
			{ face: 'italic', size: 21, fill: SEPIA, opacity: 0.8 }
		);
	} else {
		out += portrait(card.owner, left, 526, 50, SEPIA);
		const whoWidth = measure('serif', 27)(who);
		out += line(left + 64, 561, who, { face: 'serif', size: 27, fill: SEPIA });
		out += line(
			left + 64 + whoWidth + 14,
			561,
			clip(`· ${card.title}`, 760 - (left + 64 + whoWidth + 14), measure('italic', 28)),
			{ face: 'italic', size: 28, fill: SEPIA, opacity: 0.85 }
		);
	}
	out += signature(1124, 554, SEPIA, card.practice);
	return out;
}

/**
 * Every character a card draws in a face other than its own, by the writing
 * it is: read back off the finished drawing, so that no more of a face is
 * fetched than is on the card.
 */
function otherWriting(svg: string): Map<Script['id'], Set<string>> {
	const written = new Map<Script['id'], Set<string>>();
	for (const [, family, text] of svg.matchAll(
		/<tspan font-family="([^"]+)"[^>]*>([^<]*)<\/tspan>/g
	)) {
		const script = SCRIPTS.find((each) => each.family === family);
		if (!script) continue;
		const characters = written.get(script.id) ?? new Set<string>();
		// Undoing `escape`, which wrote the five characters XML keeps for itself as numbers.
		const plain = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
		for (const character of plain) characters.add(character);
		written.set(script.id, characters);
	}
	return written;
}

export interface Drawn {
	png: Uint8Array;
	/** False if something written could not be shown because its letters could not be had. */
	whole: boolean;
}

export async function renderCard(card: Card): Promise<Drawn> {
	// What cannot be set is left out before anything is measured.
	let drawn = card;
	if (card.kind === 'diary') {
		drawn = {
			...card,
			title: settable(card.title, 'serif') || 'A diary',
			penName: settable(card.penName, 'serif'),
			// No more than a card could ever show: an entry can be twenty thousand characters long.
			latest: card.latest ? settable(card.latest.slice(0, 600), 'text') : undefined
		};
	} else if (card.kind === 'entry') {
		drawn = {
			...card,
			title: settable(card.title, 'italic') || 'a diary',
			penName: settable(card.penName, 'serif'),
			text: settable(card.text.slice(0, 600), 'text')
		};
	}

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" font-family="Vellum Serif">${DEFS}${
		drawn.kind === 'home' ? home() : drawn.kind === 'diary' ? diary(drawn) : entry(drawn)
	}</svg>`;

	const [own, other] = await Promise.all([ownFonts(), scriptFonts(otherWriting(svg))]);
	const resvg = await Resvg.async(svg, {
		font: {
			fontBuffers: [...own, ...other.fonts],
			loadSystemFonts: false,
			defaultFontFamily: 'Vellum Serif'
		}
	});
	return { png: resvg.render().asPng(), whole: other.whole };
}

/** A card that came out short of its letters is kept only a minute, so that the next asking can do better. */
export function cardResponse(drawn: Drawn, maxAge: number): Response {
	return new Response(drawn.png as BodyInit, {
		headers: {
			'content-type': 'image/png',
			'cache-control': `public, max-age=${drawn.whole ? maxAge : 60}`
		}
	});
}
