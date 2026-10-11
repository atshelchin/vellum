import { formatUnits, type Address } from 'viem';

export function shortAddress(address: Address): string {
	return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * A pen name as it is shown: on one line, with nothing in it that would take
 * the line over. What a diary is signed with is whatever its keeper typed.
 */
export function penNameOf(diary: { penName: string }): string {
	return (
		diary.penName
			// Marks that turn the writing round, or join or hide letters, have no place in a name.
			.replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

/** Who keeps a diary, in a few words: the name it is signed with, or failing that its account. */
export function keeperOf(diary: { owner: Address; penName: string }): string {
	return penNameOf(diary) || shortAddress(diary.owner);
}

/** An amount of the chain's coin, without trailing zeros: `0.001`. Rounds down. */
export function coin(amount: bigint, digits = 4): string {
	const [whole, fraction = ''] = formatUnits(amount, 18).split('.');
	const kept = fraction.slice(0, digits).replace(/0+$/, '');
	return kept ? `${whole}.${kept}` : whole;
}

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long' });
const MONTH_YEAR = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

/**
 * A moment as a diary writes it, in the reader's own time zone: the chain
 * keeps the instant, and the day it fell on depends on where it is read.
 */
export function dateParts(seconds: number) {
	const date = new Date(seconds * 1000);
	return {
		/** `12 October 2026` */
		day: DAY.format(date),
		/** `Monday` */
		weekday: WEEKDAY.format(date),
		/** `12` */
		number: String(date.getDate()),
		/** `October 2026` */
		monthYear: MONTH_YEAR.format(date),
		/** `14:32` */
		time: TIME.format(date)
	};
}

/** How long ago `seconds` was, in the fewest words that are still true. */
export function ago(seconds: number, now: number): string {
	const elapsed = Math.max(0, now - seconds);
	if (elapsed < 90) return 'just now';
	if (elapsed < 3600) return `${Math.round(elapsed / 60)} minutes ago`;
	if (elapsed < 2 * 3600) return 'an hour ago';
	if (elapsed < 86400) return `${Math.round(elapsed / 3600)} hours ago`;
	if (elapsed < 2 * 86400) return 'yesterday';
	if (elapsed < 60 * 86400) return `${Math.round(elapsed / 86400)} days ago`;
	return dateParts(seconds).day;
}

export function plural(count: number, one: string, many = `${one}s`): string {
	return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}
