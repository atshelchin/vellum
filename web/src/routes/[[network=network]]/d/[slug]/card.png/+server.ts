import { error } from '@sveltejs/kit';
import { netOf } from '#lib/chain.ts';
import { penNameOf } from '#lib/format.ts';
import { cardResponse, renderCard } from '#lib/server/card/card.ts';
import { slugNames, slugOpens } from '#lib/share.ts';
import { fetchDiary, fetchEntries, type Diary } from '#lib/vellum.ts';
import type { RequestHandler } from './$types';

/**
 * The card for a link: of the diary, for a link to a diary, and of the one
 * page, for a link to a page.
 *
 * It is drawn only for a link that opens what it names. A card shows what is
 * written, and a guessed number must not be shown anything.
 */
export const GET: RequestHandler = async ({ params }) => {
	const net = netOf(params.network);
	const named = slugNames(params.slug);
	let diary: Diary;
	try {
		if (!named || !net.vellum) throw new Error('not a link');
		diary = await fetchDiary(net, named.id);
		if (!slugOpens(net, params.slug, diary)) throw new Error('not its key');
	} catch {
		error(404, 'No such diary');
	}

	const about = {
		title: diary.title,
		cover: diary.cover,
		owner: diary.owner,
		penName: penNameOf(diary),
		where: net.chain.name,
		practice: net.practice
	};

	if (named.entry !== undefined) {
		const entry = (await fetchEntries(net, diary.id, named.entry, 1).catch(() => null))?.entries[0];
		if (!entry) error(404, 'No such page');
		// What is written is never unwritten, so neither is its card.
		return cardResponse(
			await renderCard({
				kind: 'entry',
				...about,
				number: named.entry + 1,
				writtenAt: entry.writtenAt,
				text: entry.text
			}),
			604800
		);
	}

	const latest =
		diary.entries > 0
			? (await fetchEntries(net, diary.id, diary.entries - 1, 1).catch(() => null))?.entries[0]
			: undefined;
	// A diary grows: its card is kept only as long as it takes to write another page.
	return cardResponse(
		await renderCard({
			kind: 'diary',
			...about,
			entries: diary.entries,
			since: diary.createdAt,
			latest: latest?.text
		}),
		600
	);
};
