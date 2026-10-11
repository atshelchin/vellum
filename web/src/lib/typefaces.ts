import { scriptsIn, type Script } from './scripts';

/**
 * The faces for writing the text face has no letters for (`lib/scripts.ts`),
 * brought into the page when there is such writing to show and not before.
 *
 * A face that writes Chinese is megabytes. It comes cut into a hundred or so
 * pieces, each a few hundred characters, and a browser fetches only the pieces
 * a text has characters in. But even the list of the pieces is large, so the
 * list itself is not fetched until some Chinese turns up. The same goes for
 * every other writing, large or small: whoever never reads Thai never fetches
 * a byte of it.
 */
const sheets: Record<Script['id'], () => Promise<unknown>> = {
	han: () => import('lxgw-wenkai-webfont/lxgwwenkai-regular.css'),
	hangul: () => import('@fontsource/gowun-batang/400.css'),
	thai: () => import('@fontsource/noto-serif-thai/400.css'),
	devanagari: () => import('@fontsource/noto-serif-devanagari/400.css'),
	arabic: () => import('@fontsource/noto-naskh-arabic/400.css'),
	hebrew: () => import('@fontsource/frank-ruhl-libre/400.css')
};

const asked = new Map<Script['id'], Promise<unknown>>();

/**
 * Makes the faces for whatever is in `text` known to the page. The letters
 * themselves come after, as a browser needs them: `document.fonts.load` waits
 * for those, for whoever has to draw before the browser would.
 */
export async function facesFor(text: string): Promise<void> {
	await Promise.all(
		scriptsIn(text).map((script) => {
			let sheet = asked.get(script.id);
			if (!sheet) {
				// If it cannot be had, the device's own faces are what is left, and
				// the next text to ask may have better luck.
				sheet = sheets[script.id]().catch(() => void asked.delete(script.id));
				asked.set(script.id, sheet);
			}
			return sheet;
		})
	);
}
