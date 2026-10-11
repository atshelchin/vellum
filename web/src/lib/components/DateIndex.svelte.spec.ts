import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Reader } from '#lib/book/reader.svelte.ts';
import DateIndex from './DateIndex.svelte';

/** Noon on a day, wherever the tests are run, so that the day is the same day there. */
const noon = (year: number, month: number, date: number) =>
	Math.floor(new Date(year, month, date, 12).getTime() / 1000);

/** As much of a reader as the index looks at. */
function reader(openedAt: number, times: number[], at?: number) {
	return {
		diary: { createdAt: openedAt, entries: times.length },
		times,
		timesFailed: false,
		entry: at === undefined ? undefined : { index: at, writtenAt: times[at], text: '' },
		readTimes: async () => {}
	} as unknown as Reader;
}

const year = () => page.getByRole('heading', { level: 2 });
const before = () => page.getByRole('button', { name: /the year before/ });
const after = () => page.getByRole('button', { name: /the year after/ });

describe('DateIndex.svelte', () => {
	beforeEach(() => {
		// It is the spring of 2027.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2027, 2, 15, 12));
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	// Opened in 2025: two entries on one day that year, two days written on in 2026, nothing yet in 2027.
	const years = [noon(2025, 10, 3), noon(2025, 10, 3) + 600, noon(2026, 9, 11), noon(2026, 11, 24)];

	it('has a sheet for every year since the diary was opened, and names the way to each', async () => {
		render(DateIndex, { reader: reader(noon(2025, 5, 1), years), open: true, onpick: () => {} });

		// With the book open at no entry, it shows the year last written in, not this one.
		await expect.element(year()).toHaveTextContent('2026');
		await expect.element(page.getByText('2 entries on 2 days')).toBeInTheDocument();
		await expect.element(before()).toHaveTextContent('2025');
		await expect.element(after()).toHaveTextContent('2027');

		await before().click();
		await expect.element(year()).toHaveTextContent('2025');
		await expect.element(page.getByText('2 entries on 1 day')).toBeInTheDocument();
		// The diary was not open before 2025: there is no further back to go.
		await expect.element(before()).not.toBeInTheDocument();

		await after().click();
		await after().click();
		await expect.element(year()).toHaveTextContent('2027');
		await expect.element(page.getByText('Nothing written in 2027')).toBeInTheDocument();
		// And next year has not come.
		await expect.element(after()).not.toBeInTheDocument();
		await expect.element(before()).toHaveTextContent('2026');
	});

	it('opens at the year of the entry the book is open at', async () => {
		render(DateIndex, {
			reader: reader(noon(2025, 5, 1), years, 0),
			open: true,
			onpick: () => {}
		});
		await expect.element(year()).toHaveTextContent('2025');
		await expect
			.element(page.getByRole('button', { name: /3 November 2025: 2 entries/ }))
			.toHaveAttribute('aria-current', 'date');
	});

	it('offers no other year for a diary that has only had this one', async () => {
		render(DateIndex, {
			reader: reader(noon(2027, 0, 9), [noon(2027, 1, 2)]),
			open: true,
			onpick: () => {}
		});
		await expect.element(year()).toHaveTextContent('2027');
		await expect.element(before()).not.toBeInTheDocument();
		await expect.element(after()).not.toBeInTheDocument();
	});

	it('opens the book at the first entry of the day that is pressed', async () => {
		const picked: number[] = [];
		render(DateIndex, {
			reader: reader(noon(2025, 5, 1), years),
			open: true,
			onpick: (entry: number) => picked.push(entry)
		});
		await page.getByRole('button', { name: /24 December 2026: 1 entry/ }).click();
		expect(picked).toEqual([3]);

		// Two were written that day: the day leads to the first of them.
		const again = render(DateIndex, {
			reader: reader(noon(2025, 5, 1), years, 2),
			open: true,
			onpick: (entry: number) => picked.push(entry)
		});
		await before().click();
		await page.getByRole('button', { name: /3 November 2025: 2 entries/ }).click();
		expect(picked).toEqual([3, 0]);
		again.unmount();
	});
});
