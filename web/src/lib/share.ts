import type { Net } from './chain';
import { pageSlugOf, slugNames, slugOf, type Linked } from './slug';

export { slugNames, type Named } from './slug';

const NOWHERE = '0x0000000000000000000000000000000000000000';

/** The link to a diary on one network: see `slug.ts` for what it is and is not. */
export function diarySlug(net: Net, diary: Linked): string {
	return slugOf(diary, net.chain.id, net.vellum ?? NOWHERE);
}

/** The link to one entry of a diary, by its place in the diary, counted from zero. It opens that entry alone. */
export function pageSlug(net: Net, diary: Linked, entry: number): string {
	return pageSlugOf(diary, entry, net.chain.id, net.vellum ?? NOWHERE);
}

/** Whether a slug is the link to this diary, or to the entry of it that it names, on this network. */
export function slugOpens(net: Net, slug: string, diary: Linked): boolean {
	const named = slugNames(slug);
	if (!named || named.id !== diary.id) return false;
	return (
		slug === (named.entry === undefined ? diarySlug(net, diary) : pageSlug(net, diary, named.entry))
	);
}

export async function copyText(text: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
	} catch {
		// Some in-app browsers have no clipboard API; the old way still works there.
		const field = document.createElement('textarea');
		field.value = text;
		field.style.position = 'fixed';
		field.style.opacity = '0';
		document.body.appendChild(field);
		field.select();
		document.execCommand('copy');
		field.remove();
	}
}
