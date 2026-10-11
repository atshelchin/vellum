import serifItalic from '@fontsource-variable/cormorant-garamond/files/cormorant-garamond-latin-wght-italic.woff2?url';
import serifUpright from '@fontsource-variable/cormorant-garamond/files/cormorant-garamond-latin-wght-normal.woff2?url';
import { dateParts, plural, shortAddress } from '../format';
import { COVERS, type CoverStyle } from './covers';
import type { Face } from './faces';
import { PAGE_HEIGHT, PAGE_WIDTH, textWidth, type Measure, type Metrics } from './layout';

/**
 * Everything in the book that is drawn and not modelled: the pages, their
 * writing, the binding's leather and its gold. Each is painted on a canvas,
 * which the scene then wraps round its shapes.
 *
 * Every painter works in the same space, 1024 by 1454, whatever size its
 * canvas is. Nothing here is random from one run to the next: a page looks the
 * same every time it is opened.
 */

/**
 * The hand the diary is written in, and after it the faces a system may have
 * that write Chinese by hand, for the writing Caveat has no letters for.
 */
export const HAND =
	'"Caveat Variable", "Caveat", "Hannotate SC", "Kaiti SC", "STKaiti", "KaiTi", "Segoe Print", cursive';
/**
 * Cormorant, with figures that stand on the line. Its own are old-style, in
 * which a 1 is drawn as a small capital I: handsome in a sentence, and on a
 * page whose whole business is the date, the 11th reads as the Roman two.
 */
const LINING = 'Vellum Serif';
export const SERIF = `"${LINING}", "Cormorant Garamond Variable", "Cormorant Garamond", Georgia, serif`;
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

const PAPER = '#f4ecd9';
const INK = '#1b2540';
const SEPIA = '#6f4428';
const RULE = 'rgb(70 92 140 / 0.32)';
const MARGIN = 'rgb(184 68 58 / 0.4)';

export type Side = 'left' | 'right';

type Context = CanvasRenderingContext2D;

/** A small, fast generator of the same numbers every time, for the same seed. */
function random(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

/** A context on `canvas` that draws in the 1024 by 1454 space. */
function designSpace(canvas: HTMLCanvasElement): Context {
	const context = canvas.getContext('2d')!;
	context.setTransform(canvas.width / PAGE_WIDTH, 0, 0, canvas.height / PAGE_HEIGHT, 0, 0);
	return context;
}

/**
 * Waits for the faces the book is written in, and for whatever further pieces
 * of them `text` needs: a font arrives in parts, by script, and a canvas does
 * not wait for one that has not.
 */
let lining: Promise<unknown> | undefined;

/** The same font files the page already has, asked for their lining figures. */
function liningFigures(): Promise<unknown> {
	lining ??= Promise.allSettled(
		(
			[
				['normal', serifUpright],
				['italic', serifItalic]
			] as const
		).map(async ([style, url]) => {
			const face = new FontFace(LINING, `url(${url}) format("woff2")`, {
				style,
				weight: '300 700',
				featureSettings: '"lnum"',
				// Only the Latin the file holds; anything else falls through to the next family.
				unicodeRange:
					'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
			});
			document.fonts.add(await face.load());
		})
	);
	return lining;
}

/**
 * The faces of accounts, drawn and waiting. A page is painted in one go and
 * cannot wait for a picture, so a face is made ready before the page it is on.
 */
const faces = new Map<string, HTMLCanvasElement>();

/**
 * Draws an account's face ahead of the bookplate it goes on: the same face
 * Vela Wallet shows for it (`lib/identicon.ts`). Where it cannot be drawn the
 * plate goes without.
 */
export async function faceReady(address: string): Promise<void> {
	const whose = address.toLowerCase();
	if (faces.has(whose)) return;
	try {
		const { identiconSvg } = await import('../identicon');
		const picture = new Image();
		// A picture that does not say how large it is is drawn at no size at all.
		const sized = identiconSvg(whose).replace('<svg ', '<svg width="320" height="320" ');
		picture.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
		await picture.decode();
		const canvas = canvasOf(320, 320);
		const context = canvas.getContext('2d')!;
		context.drawImage(picture, 0, 0, 320, 320);
		// A browser that will not trust a picture it drew itself says so here,
		// and not later, when the whole page would be lost with it.
		context.getImageData(0, 0, 1, 1);
		faces.set(whose, canvas);
	} catch (error) {
		console.warn('Vellum: the face of an account could not be drawn', error);
	}
}

export async function fontsReady(text = ''): Promise<void> {
	await liningFigures();
	const sample = `Vellum 0123456789 ${text}`.slice(0, 4000);
	await Promise.allSettled([
		document.fonts.load(`500 40px ${HAND}`, sample),
		document.fonts.load(`500 40px ${SERIF}`, sample),
		document.fonts.load(`italic 500 40px ${SERIF}`, sample)
	]);
}

/**
 * Chinese, Japanese and Korean, which another face has to write. Their letters
 * fill the height of a line where the hand's fill a third of it, so at the same
 * size they stand half as tall again beside it. They are drawn smaller: not
 * all the way down to the hand's height, because a character with twenty
 * strokes in it needs more room to be read than a letter with two.
 */
const WIDE =
	/((?:\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}|[\u3000-\u303f\uff00-\uffef])+)/u;
const WIDE_SCALE = 0.82;

/**
 * Goes along a line a face at a time. `each` is given every run of it and how
 * far along the line the run begins. Returns how wide the line is.
 */
function handRuns(
	context: Context,
	text: string,
	size: number,
	each?: (run: string, x: number) => void
): number {
	let x = 0;
	// Split on a pattern that keeps what it matched: every other piece is a wide run.
	text.split(WIDE).forEach((run, index) => {
		if (run === '') return;
		context.font = `500 ${index % 2 === 1 ? Math.round(size * WIDE_SCALE) : size}px ${HAND}`;
		each?.(run, x);
		x += context.measureText(run).width;
	});
	return x;
}

/** How wide the hand writes a run of text, on a page set with `metrics`. */
export function createMeasure(metrics: Metrics): Measure {
	const context = canvasOf(1, 1).getContext('2d')!;
	return (text) => handRuns(context, text, metrics.fontSize);
}

/** Text with air between its letters, which a canvas cannot be relied on to do itself. */
function spaced(
	context: Context,
	text: string,
	x: number,
	y: number,
	gap: number,
	align: 'left' | 'center' | 'right' = 'center'
) {
	const letters = Array.from(text);
	const widths = letters.map((letter) => context.measureText(letter).width);
	const total = widths.reduce((sum, width) => sum + width, 0) + gap * (letters.length - 1);
	let at = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
	const before = context.textAlign;
	context.textAlign = 'left';
	letters.forEach((letter, index) => {
		context.fillText(letter, at, y);
		at += widths[index] + gap;
	});
	context.textAlign = before;
}

/** A row of three small diamonds: the mark that something ends here. */
function fleuron(context: Context, x: number, y: number, size: number) {
	for (const offset of [-1, 0, 1]) {
		const scale = offset === 0 ? 1 : 0.62;
		const cx = x + offset * size * 3.4;
		context.beginPath();
		context.moveTo(cx, y - size * scale);
		context.lineTo(cx + size * scale, y);
		context.lineTo(cx, y + size * scale);
		context.lineTo(cx - size * scale, y);
		context.closePath();
		context.fill();
	}
}

/** A thin line that swells to a diamond in the middle. */
function flourish(context: Context, x: number, y: number, half: number) {
	context.save();
	context.lineWidth = 2;
	context.beginPath();
	context.moveTo(x - half, y);
	context.lineTo(x - 22, y);
	context.moveTo(x + 22, y);
	context.lineTo(x + half, y);
	context.stroke();
	context.beginPath();
	context.moveTo(x, y - 9);
	context.lineTo(x + 12, y);
	context.lineTo(x, y + 9);
	context.lineTo(x - 12, y);
	context.closePath();
	context.fill();
	context.restore();
}

// ── Paper ─────────────────────────────────────────────────────────────────

let grain: HTMLCanvasElement | undefined;

/** A tile of speckle, laid over anything that should not look printed. */
function grainTile(): HTMLCanvasElement {
	if (grain) return grain;
	grain = canvasOf(256, 256);
	const context = grain.getContext('2d')!;
	const image = context.createImageData(256, 256);
	const next = random(7);
	for (let i = 0; i < image.data.length; i += 4) {
		const dark = next() < 0.5;
		image.data[i] = image.data[i + 1] = image.data[i + 2] = dark ? 60 : 255;
		image.data[i + 3] = next() * (dark ? 16 : 12);
	}
	context.putImageData(image, 0, 0);
	return grain;
}

const sheets = new Map<Side, HTMLCanvasElement>();

/** A bare page: its colour, its tooth, the years at its edges and the shadow where it is bound. */
function sheet(side: Side): HTMLCanvasElement {
	const known = sheets.get(side);
	if (known) return known;

	const canvas = canvasOf(PAGE_WIDTH, PAGE_HEIGHT);
	const context = canvas.getContext('2d')!;
	const next = random(side === 'left' ? 11 : 23);
	context.fillStyle = PAPER;
	context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

	// Uneven colour, as paper has: a few broad, faint clouds.
	for (let i = 0; i < 28; i++) {
		const x = next() * PAGE_WIDTH;
		const y = next() * PAGE_HEIGHT;
		const radius = 160 + next() * 320;
		const cloud = context.createRadialGradient(x, y, 0, x, y, radius);
		const warm = next() < 0.6;
		cloud.addColorStop(0, warm ? 'rgb(196 160 104 / 0.07)' : 'rgb(255 255 255 / 0.1)');
		cloud.addColorStop(1, 'rgb(196 160 104 / 0)');
		context.fillStyle = cloud;
		context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
	}

	context.fillStyle = context.createPattern(grainTile(), 'repeat')!;
	context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

	// Fibres.
	context.lineWidth = 1;
	for (let i = 0; i < 260; i++) {
		const x = next() * PAGE_WIDTH;
		const y = next() * PAGE_HEIGHT;
		const angle = next() * Math.PI;
		const length = 6 + next() * 16;
		context.strokeStyle = `rgb(120 90 50 / ${0.03 + next() * 0.05})`;
		context.beginPath();
		context.moveTo(x, y);
		context.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
		context.stroke();
	}

	// The three free edges have browned a little.
	const aged = 'rgb(150 104 52 / 0.16)';
	const clear = 'rgb(150 104 52 / 0)';
	const outer = side === 'left' ? 0 : PAGE_WIDTH;
	const inward = side === 'left' ? 1 : -1;
	let fade = context.createLinearGradient(outer, 0, outer + inward * 90, 0);
	fade.addColorStop(0, aged);
	fade.addColorStop(1, clear);
	context.fillStyle = fade;
	context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
	for (const [from, to] of [
		[0, 70],
		[PAGE_HEIGHT, PAGE_HEIGHT - 70]
	]) {
		fade = context.createLinearGradient(0, from, 0, to);
		fade.addColorStop(0, aged);
		fade.addColorStop(1, clear);
		context.fillStyle = fade;
		context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
	}

	// Where the page dives into the binding it is in its own shade.
	const bound = side === 'left' ? PAGE_WIDTH : 0;
	const gutter = context.createLinearGradient(bound, 0, bound - inward * 150, 0);
	gutter.addColorStop(0, 'rgb(58 40 22 / 0.42)');
	gutter.addColorStop(0.35, 'rgb(58 40 22 / 0.13)');
	gutter.addColorStop(1, 'rgb(58 40 22 / 0)');
	context.fillStyle = gutter;
	context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

	sheets.set(side, canvas);
	return canvas;
}

/** Where the writing sits on a page: it keeps clear of the binding, whichever side that is. */
function column(metrics: Metrics, side: Side): { left: number; right: number; centre: number } {
	const left = side === 'left' ? metrics.outer : metrics.inner;
	const right = left + textWidth(metrics);
	return { left, right, centre: (left + right) / 2 };
}

/** The ruled lines of rows `from` to the last, and the margin line down the side. */
function rules(context: Context, metrics: Metrics, side: Side, from = 0) {
	const { left, right } = column(metrics, side);
	context.strokeStyle = RULE;
	context.lineWidth = 2;
	for (let row = from; row < metrics.lines; row++) {
		const y = metrics.top + (row + 1) * metrics.lineHeight;
		context.beginPath();
		context.moveTo(left - 34, y);
		context.lineTo(right + 30, y);
		context.stroke();
	}
	context.strokeStyle = MARGIN;
	context.beginPath();
	context.moveTo(left - 22, metrics.top - 50);
	context.lineTo(left - 22, metrics.top + metrics.lines * metrics.lineHeight + 44);
	context.stroke();
}

/** The day an entry was written, set across the head of a page. */
function heading(context: Context, metrics: Metrics, side: Side, seconds: number) {
	const { left, right } = column(metrics, side);
	const date = dateParts(seconds);
	const rows = metrics.lines - metrics.firstLines;
	const base = metrics.top + (rows - 1) * metrics.lineHeight;

	context.fillStyle = SEPIA;
	context.textAlign = 'left';
	context.font = `600 ${Math.round(metrics.fontSize * 1.28)}px ${SERIF}`;
	context.fillText(date.day, left, base - 6);

	context.font = `600 ${Math.round(metrics.fontSize * 0.5)}px ${SERIF}`;
	context.fillStyle = 'rgb(111 68 40 / 0.78)';
	spaced(context, `${date.weekday.toUpperCase()}  ·  ${date.time}`, right, base - 8, 3, 'right');

	context.strokeStyle = 'rgb(111 68 40 / 0.5)';
	context.lineWidth = 2;
	context.beginPath();
	context.moveTo(left - 34, base + 22);
	context.lineTo(right + 30, base + 22);
	context.stroke();
	context.lineWidth = 1;
	context.beginPath();
	context.moveTo(left - 34, base + 29);
	context.lineTo(right + 30, base + 29);
	context.stroke();
}

function paintText(
	context: Context,
	face: Extract<Face, { kind: 'text' }>,
	metrics: Metrics,
	side: Side
) {
	const { left, centre } = column(metrics, side);
	const skipped = face.heading === undefined ? 0 : metrics.lines - metrics.firstLines;
	rules(context, metrics, side, skipped);
	if (face.heading !== undefined) heading(context, metrics, side, face.heading);

	// A hand does not keep to the line the way type does: each line sits a hair
	// off it, and leans a hair.
	const next = random(face.seed + 1);
	context.fillStyle = INK;
	context.textAlign = 'left';
	context.textBaseline = 'alphabetic';
	context.font = `500 ${metrics.fontSize}px ${HAND}`;
	face.lines.forEach((line, index) => {
		const lean = (next() - 0.5) * 0.007;
		const dx = (next() - 0.5) * 7;
		const dy = (next() - 0.5) * 4;
		if (line === '') return;
		const y = metrics.top + (skipped + index + 1) * metrics.lineHeight - metrics.lineHeight * 0.2;
		context.save();
		context.translate(left + dx, y + dy);
		context.rotate(lean);
		context.globalAlpha = 0.9 + next() * 0.1;
		handRuns(context, line, metrics.fontSize, (run, x) => context.fillText(run, x, 0));
		context.restore();
	});

	if (face.pages > 1) {
		context.fillStyle = 'rgb(111 68 40 / 0.62)';
		context.font = `italic 500 32px ${SERIF}`;
		context.textAlign = 'center';
		context.fillText(`${face.page} / ${face.pages}`, centre, PAGE_HEIGHT - 62);
	}
}

/** Sealing wax, pressed with a V. */
function seal(context: Context, x: number, y: number, radius: number) {
	const next = random(97);
	context.save();
	context.translate(x, y);

	// The wax ran a little before it set, so its edge is not a circle.
	const edge = (scale: number) => {
		context.beginPath();
		const lobes = 44;
		for (let i = 0; i <= lobes; i++) {
			const angle = (i / lobes) * Math.PI * 2;
			const wobble = 1 + Math.sin(angle * 5 + 1.3) * 0.035 + Math.sin(angle * 9 + 0.4) * 0.025;
			const r = radius * scale * wobble;
			if (i === 0) context.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
			else context.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
		}
		context.closePath();
	};

	context.shadowColor = 'rgb(40 12 8 / 0.45)';
	context.shadowBlur = 16;
	context.shadowOffsetX = 5;
	context.shadowOffsetY = 8;
	edge(1);
	const wax = context.createRadialGradient(
		-radius * 0.35,
		-radius * 0.4,
		radius * 0.1,
		0,
		0,
		radius * 1.1
	);
	wax.addColorStop(0, '#d8463a');
	wax.addColorStop(0.55, '#a82a22');
	wax.addColorStop(1, '#6f1512');
	context.fillStyle = wax;
	context.fill();
	context.shadowColor = 'transparent';

	// The ring the die left, cut in on one side and raised on the other.
	context.lineWidth = radius * 0.07;
	context.strokeStyle = 'rgb(70 10 8 / 0.55)';
	context.beginPath();
	context.arc(0, 0, radius * 0.68, 0, Math.PI * 2);
	context.stroke();
	context.strokeStyle = 'rgb(255 170 150 / 0.32)';
	context.lineWidth = radius * 0.03;
	context.beginPath();
	context.arc(1.5, 2, radius * 0.68, 0, Math.PI * 2);
	context.stroke();

	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.font = `600 ${radius * 0.92}px ${SERIF}`;
	context.fillStyle = 'rgb(70 10 8 / 0.65)';
	context.fillText('V', -1, radius * 0.06 - 1);
	context.fillStyle = 'rgb(255 176 156 / 0.4)';
	context.fillText('V', 1.5, radius * 0.06 + 2);
	context.fillStyle = '#b53027';
	context.fillText('V', 0, radius * 0.06);

	// Light on the wax.
	const shine = context.createRadialGradient(
		-radius * 0.42,
		-radius * 0.5,
		0,
		-radius * 0.42,
		-radius * 0.5,
		radius * 0.5
	);
	shine.addColorStop(0, 'rgb(255 235 225 / 0.42)');
	shine.addColorStop(1, 'rgb(255 235 225 / 0)');
	edge(1);
	context.fillStyle = shine;
	context.fill();
	for (let i = 0; i < 5; i++) {
		context.fillStyle = `rgb(255 220 210 / ${0.1 + next() * 0.14})`;
		context.beginPath();
		context.arc(
			(next() - 0.5) * radius * 1.3,
			(next() - 0.5) * radius * 1.3,
			1 + next() * 2,
			0,
			Math.PI * 2
		);
		context.fill();
	}
	context.restore();
	context.textBaseline = 'alphabetic';
}

function paintDate(context: Context, face: Extract<Face, { kind: 'date' }>, side: Side) {
	const date = dateParts(face.writtenAt);
	// A touch away from the binding, where the eye puts the middle of a page.
	const centre = PAGE_WIDTH / 2 + (side === 'left' ? -14 : 14);
	context.textAlign = 'center';

	context.fillStyle = 'rgb(111 68 40 / 0.85)';
	context.font = `600 40px ${SERIF}`;
	spaced(context, date.weekday.toUpperCase(), centre, 392, 13);

	context.fillStyle = INK;
	context.font = `500 430px ${SERIF}`;
	context.fillText(date.number, centre, 772);

	context.fillStyle = SEPIA;
	context.font = `italic 500 84px ${SERIF}`;
	context.fillText(date.monthYear, centre, 892);

	context.fillStyle = context.strokeStyle = 'rgb(111 68 40 / 0.6)';
	flourish(context, centre, 962, 190);

	context.fillStyle = 'rgb(111 68 40 / 0.85)';
	context.font = `600 32px ${SERIF}`;
	spaced(context, `ENTRY ${face.number}  ·  ${date.time}`, centre, 1034, 7);

	seal(context, centre, 1208, 88);
}

/** Sets a title on as few lines as it needs, in the largest size that fits. */
function fitTitle(
	context: Context,
	title: string,
	font: (size: number) => string,
	width: number,
	largest: number,
	smallest: number,
	maxLines: number
): { size: number; lines: string[] } {
	for (let size = largest; ; size -= 6) {
		context.font = font(size);
		const lines: string[] = [];
		let line = '';
		for (const word of title.trim().split(/\s+/)) {
			const candidate = line ? `${line} ${word}` : word;
			if (line && context.measureText(candidate).width > width) {
				lines.push(line);
				line = word;
			} else {
				line = candidate;
			}
		}
		lines.push(line);
		const fits = lines.every((each) => context.measureText(each).width <= width);
		if ((fits && lines.length <= maxLines) || size <= smallest) return { size, lines };
	}
}

function paintTitle(context: Context, face: Extract<Face, { kind: 'title' }>, side: Side) {
	const centre = PAGE_WIDTH / 2 + (side === 'left' ? -14 : 14);
	context.textAlign = 'center';

	context.fillStyle = context.strokeStyle = 'rgb(111 68 40 / 0.6)';
	context.lineWidth = 2;
	context.strokeRect(centre - 372, 150, 744, PAGE_HEIGHT - 300);
	context.lineWidth = 1;
	context.strokeRect(centre - 358, 164, 716, PAGE_HEIGHT - 328);
	fleuron(context, centre, 318, 9);

	const { size, lines } = fitTitle(
		context,
		face.title,
		(px) => `italic 600 ${px}px ${SERIF}`,
		620,
		136,
		58,
		4
	);
	const leading = size * 1.08;
	const top = 640 - ((lines.length - 1) * leading) / 2;
	context.fillStyle = INK;
	lines.forEach((line, index) => context.fillText(line, centre, top + index * leading));

	const below = top + (lines.length - 1) * leading + 96;
	context.fillStyle = context.strokeStyle = 'rgb(111 68 40 / 0.6)';
	flourish(context, centre, below, 150);

	context.fillStyle = 'rgb(111 68 40 / 0.85)';
	context.font = `600 30px ${SERIF}`;
	spaced(context, `A DIARY KEPT ON ${face.where.toUpperCase()}`, centre, below + 82, 8);

	context.fillStyle = SEPIA;
	context.font = `italic 500 46px ${SERIF}`;
	context.fillText(
		face.lone !== undefined
			? `Entry ${face.lone}, shared on its own`
			: face.entries === 0
				? 'Not a word yet'
				: plural(face.entries, 'entry', 'entries'),
		centre,
		PAGE_HEIGHT - 232
	);
}

/** The paper pasted inside the front board, and the owner's plate on it. */
function paintBookplate(context: Context, face: Extract<Face, { kind: 'bookplate' }>) {
	const style = COVERS[face.cover % COVERS.length];
	context.fillStyle = style.endpaper;
	context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

	// A small repeat, the way endpapers are printed.
	context.fillStyle = style.endpaperMark;
	for (let row = 0; row * 46 < PAGE_HEIGHT + 46; row++) {
		for (let col = 0; col * 46 < PAGE_WIDTH + 46; col++) {
			const x = col * 46 + (row % 2) * 23;
			const y = row * 46;
			context.beginPath();
			context.moveTo(x, y - 5);
			context.lineTo(x + 5, y);
			context.lineTo(x, y + 5);
			context.lineTo(x - 5, y);
			context.closePath();
			context.fill();
		}
	}
	context.fillStyle = context.createPattern(grainTile(), 'repeat')!;
	context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
	const fold = context.createLinearGradient(PAGE_WIDTH, 0, PAGE_WIDTH - 130, 0);
	fold.addColorStop(0, 'rgb(20 12 6 / 0.5)');
	fold.addColorStop(1, 'rgb(20 12 6 / 0)');
	context.fillStyle = fold;
	context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

	const centre = PAGE_WIDTH / 2 - 10;
	const width = 580;
	const portrait = faces.get(face.owner.toLowerCase());
	// The plate is as tall as what is on it: a face, if one could be drawn, and a name, if it was signed.
	const height = 560 + (portrait ? 150 : 0) + (face.name ? 56 : 0);
	const top = (PAGE_HEIGHT - height) / 2 - 30;
	context.save();
	context.shadowColor = 'rgb(20 12 6 / 0.4)';
	context.shadowBlur = 22;
	context.shadowOffsetY = 8;
	context.fillStyle = PAPER;
	context.fillRect(centre - width / 2, top, width, height);
	context.restore();
	context.fillStyle = context.createPattern(grainTile(), 'repeat')!;
	context.fillRect(centre - width / 2, top, width, height);

	context.strokeStyle = 'rgb(111 68 40 / 0.7)';
	context.lineWidth = 3;
	context.strokeRect(centre - width / 2 + 24, top + 24, width - 48, height - 48);
	context.lineWidth = 1;
	context.strokeRect(centre - width / 2 + 36, top + 36, width - 72, height - 72);

	context.textAlign = 'center';
	context.fillStyle = SEPIA;
	context.font = `600 38px ${SERIF}`;
	spaced(context, 'EX LIBRIS', centre, top + 124, 14);
	context.fillStyle = context.strokeStyle = 'rgb(111 68 40 / 0.6)';
	flourish(context, centre, top + 172, 120);

	let y = top + 172;
	if (portrait) {
		// The account's face, as its wallet shows it. Whoever keeps this diary
		// knows it on sight, which cannot be said of a row of letters.
		const radius = 62;
		y += 40 + radius;
		context.save();
		context.beginPath();
		context.arc(centre, y, radius, 0, Math.PI * 2);
		context.clip();
		context.drawImage(portrait, centre - radius, y - radius, radius * 2, radius * 2);
		context.restore();
		context.strokeStyle = 'rgb(111 68 40 / 0.55)';
		context.lineWidth = 2;
		context.beginPath();
		context.arc(centre, y, radius + 5, 0, Math.PI * 2);
		context.stroke();
		y += radius + 10;
	}

	y += 86;
	context.fillStyle = SEPIA;
	context.font = `italic 500 42px ${SERIF}`;
	context.fillText('This diary is kept by', centre, y);

	const account = shortAddress(face.owner as `0x${string}`);
	if (face.name) {
		// Signed, in the hand the diary is written in, as large as the plate has
		// room for. The account stays under it: a name can be anyone's.
		let size = 100;
		while (size > 44 && handRuns(context, face.name, size) > width - 120) size -= 4;
		const start = centre - handRuns(context, face.name, size) / 2;
		y += 92;
		context.fillStyle = INK;
		context.textAlign = 'left';
		handRuns(context, face.name, size, (run, x) => context.fillText(run, start + x, y));
		context.textAlign = 'center';

		y += 54;
		context.fillStyle = 'rgb(111 68 40 / 0.85)';
		context.font = `500 27px ${MONO}`;
		context.fillText(account, centre, y);
	} else {
		y += 82;
		context.fillStyle = INK;
		context.font = `500 44px ${MONO}`;
		context.fillText(account, centre, y);
	}

	y += 76;
	context.fillStyle = SEPIA;
	context.font = `italic 500 38px ${SERIF}`;
	context.fillText(`since ${dateParts(face.since).day}`, centre, y);

	context.fillStyle = 'rgb(111 68 40 / 0.6)';
	fleuron(context, centre, y + 62, 8);
}

function paintInvite(
	context: Context,
	face: Extract<Face, { kind: 'invite' }>,
	metrics: Metrics,
	side: Side
) {
	const { left, centre } = column(metrics, side);
	const skipped = metrics.lines - metrics.firstLines;
	rules(context, metrics, side, skipped);
	heading(context, metrics, side, face.today);

	// Pencilled in, waiting to be inked.
	context.fillStyle = 'rgb(27 37 64 / 0.3)';
	context.textAlign = 'left';
	context.font = `500 ${metrics.fontSize}px ${HAND}`;
	context.fillText(
		'Dear diary,',
		left,
		metrics.top + (skipped + 1) * metrics.lineHeight - metrics.lineHeight * 0.2
	);

	const y = 800;
	context.save();
	context.strokeStyle = 'rgb(111 68 40 / 0.55)';
	context.lineWidth = 3;
	context.setLineDash([14, 12]);
	context.beginPath();
	context.roundRect(centre - 330, y - 150, 660, 300, 28);
	context.stroke();
	context.restore();

	context.textAlign = 'center';
	context.fillStyle = SEPIA;
	context.font = `italic 600 76px ${SERIF}`;
	context.fillText("Write today's page", centre, y + 4);
	context.fillStyle = 'rgb(111 68 40 / 0.8)';
	context.font = `600 30px ${SERIF}`;
	spaced(context, 'TAP HERE', centre, y + 76, 9);
}

function paintEnd(context: Context, face: Extract<Face, { kind: 'end' }>, side: Side) {
	const centre = PAGE_WIDTH / 2 + (side === 'left' ? -14 : 14);
	context.textAlign = 'center';
	context.fillStyle = 'rgb(111 68 40 / 0.6)';
	fleuron(context, centre, 596, 10);
	context.fillStyle = SEPIA;
	context.font = `italic 500 70px ${SERIF}`;
	context.fillText(face.lone ? 'The rest was' : 'The rest is not', centre, 716);
	context.fillText(face.lone ? 'not shared.' : 'written yet.', centre, 800);
	context.fillStyle = 'rgb(111 68 40 / 0.8)';
	context.font = `600 30px ${SERIF}`;
	spaced(
		context,
		face.lone
			? 'ONE PAGE OF A DIARY'
			: face.entries === 0
				? 'NOT A WORD SO FAR'
				: `${plural(face.entries, 'ENTRY', 'ENTRIES')} SO FAR`,
		centre,
		890,
		8
	);
}

/** Paints one side of a leaf. */
export function paintFace(canvas: HTMLCanvasElement, face: Face, metrics: Metrics, side: Side) {
	const context = designSpace(canvas);
	context.textBaseline = 'alphabetic';
	if (face.kind === 'bookplate') return paintBookplate(context, face);

	context.drawImage(sheet(side), 0, 0);
	switch (face.kind) {
		case 'text':
			return paintText(context, face, metrics, side);
		case 'date':
			return paintDate(context, face, side);
		case 'title':
			return paintTitle(context, face, side);
		case 'invite':
			return paintInvite(context, face, metrics, side);
		case 'end':
			return paintEnd(context, face, side);
		case 'waiting': {
			rules(context, metrics, side);
			context.fillStyle = 'rgb(111 68 40 / 0.45)';
			fleuron(context, column(metrics, side).centre, PAGE_HEIGHT * 0.42, 9);
			return;
		}
		case 'blank': {
			rules(context, metrics, side);
			if (face.mark) {
				context.fillStyle = 'rgb(111 68 40 / 0.5)';
				fleuron(context, column(metrics, side).centre, metrics.top + metrics.lineHeight * 2.5, 9);
			}
		}
	}
}

// ── The binding ───────────────────────────────────────────────────────────

/**
 * What the binding's art is drawn with. It is drawn twice, the same shapes
 * each time: once in colour, and once as the map that tells the light which
 * parts are leather and which are metal.
 */
interface Pens {
	base: string;
	/** Fills for the stamped parts, across a box from (x0, y0) to (x1, y1). */
	foil(context: Context, x0: number, y0: number, x1: number, y1: number): string | CanvasGradient;
	/** Whether to draw what only colour can show: shading, grain, the blind tooling. */
	colour: boolean;
}

function colourPens(style: CoverStyle): Pens {
	return {
		base: style.leather,
		colour: true,
		foil(context, x0, y0, x1, y1) {
			const gradient = context.createLinearGradient(x0, y0, x1, y1);
			style.foil.forEach((stop, index) =>
				gradient.addColorStop(index / (style.foil.length - 1), stop)
			);
			return gradient;
		}
	};
}

/** Green is how rough a surface is and blue is how much of a metal: leather is rough and not one. */
function materialPens(style: CoverStyle): Pens {
	const channel = (value: number) => Math.round(value * 255);
	return {
		base: `rgb(0 ${channel(style.roughness)} 0)`,
		colour: false,
		// Leaf this thin is not a mirror: some of its colour is its own, and the rest is the room's.
		foil: () =>
			style.metal ? `rgb(0 ${channel(0.34)} ${channel(0.72)})` : `rgb(0 ${channel(0.8)} 0)`
	};
}

function leather(context: Context, style: CoverStyle, pens: Pens) {
	context.fillStyle = pens.base;
	context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
	if (!pens.colour) return;

	const next = random(style.leather.length * 31 + style.name.length);
	// Hide is not one colour: darker where it was worked, lighter where it stretched.
	for (let i = 0; i < 46; i++) {
		const x = next() * PAGE_WIDTH;
		const y = next() * PAGE_HEIGHT;
		const radius = 90 + next() * 260;
		const cloud = context.createRadialGradient(x, y, 0, x, y, radius);
		const light = next() < 0.4;
		cloud.addColorStop(0, light ? 'rgb(255 255 255 / 0.05)' : 'rgb(0 0 0 / 0.1)');
		cloud.addColorStop(1, 'rgb(0 0 0 / 0)');
		context.fillStyle = cloud;
		context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
	}
	// Pores.
	for (let i = 0; i < 5200; i++) {
		context.fillStyle = next() < 0.7 ? 'rgb(0 0 0 / 0.13)' : 'rgb(255 255 255 / 0.05)';
		context.beginPath();
		context.arc(next() * PAGE_WIDTH, next() * PAGE_HEIGHT, 0.6 + next() * 1.5, 0, Math.PI * 2);
		context.fill();
	}
	// Burnished toward the edges, where hands hold it.
	const worn = context.createRadialGradient(
		PAGE_WIDTH * 0.5,
		PAGE_HEIGHT * 0.46,
		PAGE_WIDTH * 0.3,
		PAGE_WIDTH * 0.5,
		PAGE_HEIGHT * 0.5,
		PAGE_HEIGHT * 0.74
	);
	worn.addColorStop(0, 'rgb(255 255 255 / 0.05)');
	worn.addColorStop(0.5, 'rgb(0 0 0 / 0)');
	worn.addColorStop(1, 'rgb(0 0 0 / 0.42)');
	context.fillStyle = worn;
	context.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);
}

/** A line pressed into the leather without gold: a shadow one side, a lit edge the other. */
function blindRect(context: Context, pens: Pens, inset: number) {
	if (!pens.colour) return;
	context.lineWidth = 5;
	context.strokeStyle = 'rgb(0 0 0 / 0.38)';
	context.strokeRect(inset, inset, PAGE_WIDTH - inset * 2, PAGE_HEIGHT - inset * 2);
	context.lineWidth = 2;
	context.strokeStyle = 'rgb(255 255 255 / 0.11)';
	context.strokeRect(inset + 4, inset + 4, PAGE_WIDTH - inset * 2 - 8, PAGE_HEIGHT - inset * 2 - 8);
}

function coverArt(context: Context, style: CoverStyle, pens: Pens, title: string | null) {
	leather(context, style, pens);
	blindRect(context, pens, 52);

	const foil = pens.foil(context, 0, 0, PAGE_WIDTH, PAGE_HEIGHT);
	context.fillStyle = context.strokeStyle = foil;
	context.textAlign = 'center';
	context.textBaseline = 'alphabetic';
	const centre = PAGE_WIDTH / 2;

	if (title === null) {
		// The back board: only a small stamp, pressed in blind.
		if (pens.colour) {
			context.strokeStyle = 'rgb(0 0 0 / 0.3)';
			context.fillStyle = 'rgb(0 0 0 / 0.3)';
			context.lineWidth = 4;
			context.beginPath();
			context.arc(centre, PAGE_HEIGHT / 2, 62, 0, Math.PI * 2);
			context.stroke();
			context.font = `600 84px ${SERIF}`;
			context.fillText('V', centre, PAGE_HEIGHT / 2 + 28);
		}
		return;
	}

	// A gold fillet, with a turned corner.
	const inset = 96;
	context.lineWidth = 4;
	context.strokeRect(inset, inset, PAGE_WIDTH - inset * 2, PAGE_HEIGHT - inset * 2);
	context.lineWidth = 1.5;
	context.strokeRect(
		inset + 14,
		inset + 14,
		PAGE_WIDTH - inset * 2 - 28,
		PAGE_HEIGHT - inset * 2 - 28
	);
	for (const [x, y, sx, sy] of [
		[inset + 14, inset + 14, 1, 1],
		[PAGE_WIDTH - inset - 14, inset + 14, -1, 1],
		[inset + 14, PAGE_HEIGHT - inset - 14, 1, -1],
		[PAGE_WIDTH - inset - 14, PAGE_HEIGHT - inset - 14, -1, -1]
	]) {
		context.save();
		context.translate(x, y);
		context.scale(sx, sy);
		context.lineWidth = 3;
		context.beginPath();
		context.arc(0, 0, 58, 0, Math.PI / 2);
		context.stroke();
		context.beginPath();
		context.arc(0, 0, 34, 0, Math.PI / 2);
		context.stroke();
		context.beginPath();
		context.moveTo(18, 18);
		context.lineTo(27, 18);
		context.lineTo(18, 27);
		context.closePath();
		context.fill();
		context.restore();
	}

	const { size, lines } = fitTitle(context, title, (px) => `600 ${px}px ${SERIF}`, 640, 128, 54, 4);
	const leading = size * 1.1;
	const middle = PAGE_HEIGHT * 0.4;
	const top = middle - ((lines.length - 1) * leading) / 2;

	fleuron(context, centre, top - size - 54, 10);
	context.font = `600 ${size}px ${SERIF}`;
	lines.forEach((line, index) => {
		const y = top + index * leading;
		if (pens.colour) {
			// Stamped: the gold sits a little below the leather's surface.
			context.fillStyle = 'rgb(0 0 0 / 0.35)';
			context.fillText(line, centre + 2, y + 3);
			context.fillStyle = foil;
		}
		context.fillText(line, centre, y);
	});
	flourish(context, centre, top + (lines.length - 1) * leading + 78, 170);

	context.font = `600 34px ${SERIF}`;
	spaced(context, 'VELLUM', centre, PAGE_HEIGHT - 190, 18);
}

/** The outside of a board in colour: the front one, with its title, or the back. */
export function paintCover(canvas: HTMLCanvasElement, cover: number, title: string | null) {
	const style = COVERS[cover % COVERS.length];
	coverArt(designSpace(canvas), style, colourPens(style), title);
}

/** The same board as the light reads it: where it is leather and where it is gold. */
export function paintCoverMaterial(canvas: HTMLCanvasElement, cover: number, title: string | null) {
	const style = COVERS[cover % COVERS.length];
	coverArt(designSpace(canvas), style, materialPens(style), title);
}

/** The pebbled surface of leather, as heights: a tile that repeats. */
export function paintLeatherBump(canvas: HTMLCanvasElement) {
	const context = canvas.getContext('2d')!;
	const { width, height } = canvas;
	const next = random(5);
	context.fillStyle = 'rgb(128 128 128)';
	context.fillRect(0, 0, width, height);
	for (let i = 0; i < 2600; i++) {
		const x = next() * width;
		const y = next() * height;
		const radius = 3 + next() * 7;
		const tone = next() < 0.5 ? 255 : 0;
		// Drawn again a tile away on each side, so the tile meets itself.
		for (const dx of [-width, 0, width]) {
			for (const dy of [-height, 0, height]) {
				if (x + dx < -radius || x + dx > width + radius) continue;
				if (y + dy < -radius || y + dy > height + radius) continue;
				const pebble = context.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, radius);
				pebble.addColorStop(0, `rgb(${tone} ${tone} ${tone} / 0.34)`);
				pebble.addColorStop(1, `rgb(${tone} ${tone} ${tone} / 0)`);
				context.fillStyle = pebble;
				context.fillRect(x + dx - radius, y + dy - radius, radius * 2, radius * 2);
			}
		}
	}
}

/** The edge of a block of pages: a great many thin lines. */
export function paintPageEdges(canvas: HTMLCanvasElement) {
	const context = canvas.getContext('2d')!;
	const { width, height } = canvas;
	const next = random(3);
	context.fillStyle = '#eadfc6';
	context.fillRect(0, 0, width, height);
	for (let y = 0; y < height; y++) {
		const tone = next();
		context.fillStyle =
			tone < 0.3
				? `rgb(120 96 60 / ${0.1 + next() * 0.22})`
				: `rgb(255 250 235 / ${next() * 0.35})`;
		context.fillRect(0, y, width, 1);
	}
}
