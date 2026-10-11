import type { Net } from './chain';
import { slugOf, type Linked } from './slug';

export { slugId } from './slug';

/** The link to a diary on one network: see `slug.ts` for what it is and is not. */
export function diarySlug(net: Net, diary: Linked): string {
	return slugOf(diary, net.chain.id, net.vellum ?? '0x0000000000000000000000000000000000000000');
}

/** Whether a slug is the link to this diary, on this network. */
export function slugOpens(net: Net, slug: string, diary: Linked): boolean {
	return slug === diarySlug(net, diary);
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
