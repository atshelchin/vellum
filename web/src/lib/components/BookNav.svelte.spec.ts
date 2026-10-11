import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Reader } from '#lib/book/reader.svelte.ts';
import BookNav from './BookNav.svelte';

/** As much of a reader as the bar looks at. */
function reader(place: number, entries: number, steps: number[] = []) {
	return {
		diary: { entries },
		place: { entry: place, spread: 0 },
		loading: 0,
		entry:
			place >= 0 && place < entries
				? { index: place, writtenAt: 1_791_688_678, text: '' }
				: undefined,
		atStart: place < 0,
		atEnd: place >= entries,
		step: (direction: number) => steps.push(direction),
		goTo: async () => {}
	} as unknown as Reader;
}

describe('BookNav.svelte', () => {
	it('says where the reader is', async () => {
		render(BookNav, { reader: reader(2, 5) });
		await expect.element(page.getByText('Entry 3 of 5')).toBeInTheDocument();
	});

	it('cannot go back from the title page, or on from the last', async () => {
		const first = render(BookNav, { reader: reader(-1, 5) });
		await expect.element(page.getByText('Title page')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Previous page' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Next page' })).toBeEnabled();
		first.unmount();

		render(BookNav, { reader: reader(5, 5) });
		await expect.element(page.getByText('The last page')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
	});

	it('turns the page it is asked to', async () => {
		const steps: number[] = [];
		render(BookNav, { reader: reader(1, 5, steps) });
		await page.getByRole('button', { name: 'Next page' }).click();
		await page.getByRole('button', { name: 'Previous page' }).click();
		expect(steps).toEqual([1, -1]);
	});

	it('offers a way to jump only when there is far to go', async () => {
		const short = render(BookNav, { reader: reader(0, 3) });
		await expect.element(page.getByRole('slider')).not.toBeInTheDocument();
		short.unmount();

		render(BookNav, { reader: reader(0, 40) });
		await expect.element(page.getByRole('slider', { name: 'Go to an entry' })).toBeInTheDocument();
	});
});
