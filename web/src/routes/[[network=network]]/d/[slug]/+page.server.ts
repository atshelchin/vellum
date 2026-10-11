import { BRAND } from '#lib/brand.ts';
import { netOf } from '#lib/chain.ts';
import { penNameOf, plural, shortAddress } from '#lib/format.ts';
import { slugNames, slugOpens } from '#lib/share.ts';
import { fetchDiary, fetchEntries } from '#lib/vellum.ts';
import type { PageServerLoad } from './$types';

const DAY = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'long',
	year: 'numeric',
	timeZone: 'UTC'
});

/** The start of an entry, short enough to sit under a link. */
function opening(text: string): string {
	const words = Array.from(text.replace(/\s+/g, ' ').trim());
	const kept = words.slice(0, 180).join('');
	return kept.length < words.length ? `${kept.trimEnd()}…` : kept;
}

/**
 * What a link says about itself when it is shared, and the picture it shows,
 * which is drawn at `card.png`. A link to a diary gives its title and who keeps
 * it. A link to one page of it gives the day, and how the page begins.
 *
 * Only for a link that really opens what it names, so that a guessed number
 * says nothing.
 *
 * The page reads the diary again in the browser, so a slow or missing answer
 * here only costs the link its own words.
 */
export const load: PageServerLoad = async ({ params, url }) => {
	const net = netOf(params.network);
	const named = slugNames(params.slug);
	if (!named || !net.vellum) return {};

	const read = async () => {
		const diary = await fetchDiary(net, named.id);
		if (!slugOpens(net, params.slug, diary)) return {};
		// The name it is signed with, and always the account: a name can be anyone's.
		const name = penNameOf(diary);
		const by = name ? `${name} (${shortAddress(diary.owner)})` : shortAddress(diary.owner);

		if (named.entry !== undefined) {
			const entry = (await fetchEntries(net, named.id, named.entry, 1)).entries[0];
			if (!entry) return {};
			return {
				card: {
					title: `${DAY.format(new Date(entry.writtenAt * 1000))} — ${diary.title}`,
					description: `${opening(entry.text)} — a page of a diary kept on ${net.chain.name} by ${by}.`,
					image: `${url.pathname}/card.png`
				}
			};
		}
		return {
			card: {
				title: `${diary.title} — a diary on ${BRAND}`,
				description: `${diary.entries === 0 ? 'Not a word yet' : plural(diary.entries, 'entry', 'entries')}, kept on ${net.chain.name} by ${by}. Turn the pages.`,
				// A diary's card changes as it is written in. Whoever keeps a copy of
				// it keeps it by its address, so the address changes with it.
				image: `${url.pathname}/card.png?pages=${diary.entries}`
			}
		};
	};

	try {
		return await Promise.race([
			read(),
			new Promise<never>((_, reject) => setTimeout(reject, 3000))
		]);
	} catch {
		return {};
	}
};
