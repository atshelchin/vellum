import { BRAND } from '#lib/brand.ts';
import { netOf } from '#lib/chain.ts';
import { plural, shortAddress } from '#lib/format.ts';
import { slugId, slugOpens } from '#lib/share.ts';
import { fetchDiary } from '#lib/vellum.ts';
import type { PageServerLoad } from './$types';

/**
 * What a link to this diary says about itself when it is shared: its title,
 * and who keeps it. Only for a link that really opens the diary, so that a
 * guessed number says nothing.
 *
 * The page reads the diary again in the browser, so a slow or missing answer
 * here only costs the link its own words.
 */
export const load: PageServerLoad = async ({ params }) => {
	const net = netOf(params.network);
	const id = slugId(params.slug);
	if (id === null || !net.vellum) return {};
	try {
		const diary = await Promise.race([
			fetchDiary(net, id),
			new Promise<never>((_, reject) => setTimeout(reject, 2500))
		]);
		if (!slugOpens(net, params.slug, diary)) return {};
		return {
			card: {
				title: `${diary.title} — a diary on ${BRAND}`,
				description: `${diary.entries === 0 ? 'Not a word yet' : plural(diary.entries, 'entry', 'entries')}, kept on ${net.chain.name} by ${shortAddress(diary.owner)}. Turn the pages.`
			}
		};
	} catch {
		return {};
	}
};
