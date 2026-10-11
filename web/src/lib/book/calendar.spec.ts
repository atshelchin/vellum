import { describe, expect, it } from 'vitest';
import { dayKey, dayOf, daysWritten, monthDays, yearsOf } from './calendar';

/** Noon on a day, wherever the tests are run, so that the day is the same day there. */
const noon = (year: number, month: number, date: number) =>
	Math.floor(new Date(year, month, date, 12).getTime() / 1000);

describe('daysWritten', () => {
	it('files each entry under the day it was written, and remembers the first', () => {
		const days = daysWritten([
			noon(2026, 0, 3),
			noon(2026, 0, 3) + 600,
			noon(2026, 0, 9),
			noon(2026, 0, 3) + 1200
		]);
		expect(days.size).toBe(2);
		expect(days.get(dayKey({ year: 2026, month: 0, date: 3 }))).toEqual({ first: 0, count: 3 });
		expect(days.get(dayKey({ year: 2026, month: 0, date: 9 }))).toEqual({ first: 2, count: 1 });
	});

	it('has nothing for a diary with nothing in it', () => {
		expect(daysWritten([]).size).toBe(0);
	});
});

describe('monthDays', () => {
	it('starts a month on the weekday it starts on, in weeks that begin on Monday', () => {
		// 1 October 2026 is a Thursday.
		const october = monthDays(2026, 9);
		expect(october.slice(0, 4)).toEqual([null, null, null, 1]);
		expect(october.at(-1)).toBe(31);
		expect(october).toHaveLength(34);
	});

	it('leaves no blank before a month that starts on a Monday', () => {
		// 1 June 2026 is a Monday.
		expect(monthDays(2026, 5)[0]).toBe(1);
	});

	it('leaves six blanks before a month that starts on a Sunday', () => {
		// 1 February 2026 is a Sunday.
		expect(monthDays(2026, 1).slice(0, 7)).toEqual([null, null, null, null, null, null, 1]);
	});

	it('knows a leap year', () => {
		expect(monthDays(2028, 1).at(-1)).toBe(29);
		expect(monthDays(2026, 1).at(-1)).toBe(28);
	});
});

describe('yearsOf', () => {
	it('runs from the year a diary was opened to this one', () => {
		expect(yearsOf(noon(2024, 5, 1), [noon(2025, 2, 2)], noon(2026, 9, 11))).toEqual([
			2024, 2025, 2026
		]);
	});

	it('is this year alone for a diary opened this year', () => {
		expect(yearsOf(noon(2026, 9, 11), [], noon(2026, 9, 11))).toEqual([2026]);
	});

	it('reaches for an entry dated outside it', () => {
		expect(yearsOf(noon(2026, 0, 1), [noon(2027, 0, 1)], noon(2026, 9, 11))).toEqual([2026, 2027]);
	});
});

describe('dayOf', () => {
	it('gives the day as the reader has it', () => {
		expect(dayOf(noon(2026, 9, 11))).toEqual({ year: 2026, month: 9, date: 11 });
	});
});
