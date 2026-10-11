/**
 * A diary by its dates: which days of which years have something written on
 * them, and where in the diary each of those days begins.
 *
 * A day is a day where the diary is being read. The chain keeps the instant,
 * and an entry written late at night in one place was written the next
 * morning in another.
 */

/** A day with writing on it. */
export interface Written {
	/** The first entry written that day, by its place in the diary. */
	first: number;
	/** How many were written that day. */
	count: number;
}

export interface Day {
	year: number;
	/** Counted from zero, as `Date` counts them. */
	month: number;
	date: number;
}

export function dayOf(seconds: number): Day {
	const moment = new Date(seconds * 1000);
	return { year: moment.getFullYear(), month: moment.getMonth(), date: moment.getDate() };
}

/** What a day is filed under. */
export function dayKey(day: Day): string {
	return `${day.year}-${day.month}-${day.date}`;
}

/** The days that have entries, from when each entry was written, in writing order. */
export function daysWritten(times: readonly number[]): Map<string, Written> {
	const days = new Map<string, Written>();
	times.forEach((seconds, index) => {
		const key = dayKey(dayOf(seconds));
		const day = days.get(key);
		if (day) day.count++;
		else days.set(key, { first: index, count: 1 });
	});
	return days;
}

/**
 * A month laid out in weeks that begin on Monday: a blank for each day of the
 * first week that belongs to the month before, then the days.
 */
export function monthDays(year: number, month: number): (number | null)[] {
	const blanks = (new Date(year, month, 1).getDay() + 6) % 7;
	const length = new Date(year, month + 1, 0).getDate();
	return [
		...Array.from({ length: blanks }, () => null),
		...Array.from({ length }, (_, index) => index + 1)
	];
}

/**
 * The years a diary has a calendar for: from the year it was opened, or the
 * year of its first entry if a clock somewhere says that came first, to this
 * one.
 */
export function yearsOf(openedAt: number, times: readonly number[], now: number): number[] {
	const from = Math.min(dayOf(openedAt).year, ...times.map((seconds) => dayOf(seconds).year));
	const to = Math.max(dayOf(now).year, ...times.map((seconds) => dayOf(seconds).year));
	return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}
