import { read } from '$app/server';
import hand from './VellumHand.ttf';
import italic from './VellumItalic.ttf';
import serif from './VellumSerif.ttf';

/**
 * The faces a card is set in.
 *
 * Three travel with the site: the hand, and the serif upright and italic. They
 * write Latin and nothing else. A diary may be in Chinese, and a face that
 * writes Chinese is a hundred times the size of one that does not, so those
 * letters are fetched: Google Fonts will cut a face down to exactly the
 * characters asked for, which comes to a few thousand bytes.
 */
let own: Promise<Uint8Array[]> | undefined;

export function ownFonts(): Promise<Uint8Array[]> {
	return (own ??= Promise.all(
		[hand, serif, italic].map(async (asset) => new Uint8Array(await read(asset).arrayBuffer()))
	));
}

/** A brush hand for what it can write, and a complete face behind it for what it cannot. */
export const WIDE_FAMILY = 'Ma Shan Zheng, Noto Serif SC';
const WIDE_QUERY = 'family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@500';

/**
 * Google answers a browser with the format that browser can read. Only a very
 * old one is sent plain TrueType, which is what the renderer wants.
 */
const OLD_BROWSER =
	'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1';

async function fetchWithin(url: string, ms: number, init?: RequestInit): Promise<Response> {
	const response = await fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
	if (!response.ok) throw new Error(`${response.status} from ${new URL(url).host}`);
	return response;
}

/**
 * The faces that write these characters, cut down to them. Empty if they could
 * not be had in time: a card is drawn either way, and whoever draws it is told
 * by the emptiness to leave those characters out.
 */
export async function wideFonts(characters: string): Promise<Uint8Array[]> {
	const wanted = [...new Set(characters)].sort().join('');
	if (wanted === '') return [];
	try {
		const css = await (
			await fetchWithin(
				`https://fonts.googleapis.com/css2?${WIDE_QUERY}&text=${encodeURIComponent(wanted)}`,
				2500,
				{ headers: { 'user-agent': OLD_BROWSER } }
			)
		).text();
		const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)].map(
			(match) => match[1]
		);
		if (urls.length === 0) return [];
		return await Promise.all(
			urls.map(async (url) => new Uint8Array(await (await fetchWithin(url, 2500)).arrayBuffer()))
		);
	} catch (error) {
		console.error('Vellum: the card will go without its Chinese', error);
		return [];
	}
}
