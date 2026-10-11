import type { Diary, Entry } from '../vellum';
import { paginate, textWidth, wrap, type Measure, type Metrics } from './layout';

/**
 * One side of a leaf: everything the painter needs to draw it, and a key that
 * is the same whenever the drawing would be.
 */
export type Face = { key: string } & (
	| { kind: 'bookplate'; owner: string; since: number; cover: number }
	| { kind: 'title'; title: string; entries: number; where: string }
	/** The page that faces an entry: the day it was written, and its number. */
	| { kind: 'date'; number: number; writtenAt: number }
	| {
			kind: 'text';
			lines: string[];
			/** Set on the page that begins an entry: when it was written. */
			heading?: number;
			page: number;
			pages: number;
			/** What the hand that wrote it wavers by. The same entry always wavers the same way. */
			seed: number;
	  }
	| { kind: 'blank'; mark: boolean }
	/** The owner's next page, not yet written. */
	| { kind: 'invite'; today: number }
	/** Where a visitor's reading stops. */
	| { kind: 'end'; entries: number }
	| { kind: 'waiting' }
);

/** Two facing pages, and how far through the book they are, from 0 to 1. */
export interface Spread {
	key: string;
	left: Face;
	right: Face;
	progress: number;
}

/** Where a reader is: before the entries, in one, or past the last. */
export interface Place {
	/** -1 for the title pages, the entry's index, or the number of entries for the last page. */
	entry: number;
	/** Which of the entry's spreads. */
	spread: number;
}

/** Whether a face has something on it to stop and read, when pages are shown one at a time. */
export function readable(face: Face): boolean {
	return (
		face.kind === 'text' || face.kind === 'title' || face.kind === 'invite' || face.kind === 'end'
	);
}

export const BLANK: Face = { key: 'blank', kind: 'blank', mark: false };
export const WAITING: Face = { key: 'waiting', kind: 'waiting' };

/** The faces an entry takes up, always an even number: it begins on a left page and ends on a right. */
export function entryFaces(entry: Entry, metrics: Metrics, measure: Measure): Face[] {
	const pages = paginate(
		wrap(entry.text, textWidth(metrics), measure),
		metrics.firstLines,
		metrics.lines
	);
	const faces: Face[] = [
		{
			key: `date:${entry.index}:${entry.writtenAt}`,
			kind: 'date',
			number: entry.index + 1,
			writtenAt: entry.writtenAt
		},
		...pages.map((lines, page): Face => ({
			key: `text:${entry.index}:${entry.writtenAt}:${page}:${metrics.name}`,
			kind: 'text',
			lines,
			heading: page === 0 ? entry.writtenAt : undefined,
			page: page + 1,
			pages: pages.length,
			seed: entry.index * 131 + page
		}))
	];
	if (faces.length % 2 === 1) faces.push({ key: 'blank:mark', kind: 'blank', mark: true });
	return faces;
}

/**
 * A diary as a run of spreads. It holds the entries read so far, set on pages,
 * and answers where a place leads and what is on it.
 */
export class Pages {
	diary: Diary;
	#metrics: Metrics;
	#measure: Measure;
	#owner: boolean;
	#today: number;
	#where: string;
	#faces = new Map<number, Face[]>();

	constructor(
		diary: Diary,
		options: {
			metrics: Metrics;
			measure: Measure;
			owner: boolean;
			today: number;
			/** The chain the diary is kept on, as its title page names it. */
			where: string;
		}
	) {
		this.diary = diary;
		this.#metrics = options.metrics;
		this.#measure = options.measure;
		this.#owner = options.owner;
		this.#today = options.today;
		this.#where = options.where;
	}

	get metrics(): Metrics {
		return this.#metrics;
	}

	add(entries: Entry[]) {
		for (const entry of entries) {
			this.#faces.set(entry.index, entryFaces(entry, this.#metrics, this.#measure));
		}
	}

	has(entry: number): boolean {
		return this.#faces.has(entry);
	}

	/** How many spreads an entry takes, if it has been read. */
	spreadsOf(entry: number): number | undefined {
		const faces = this.#faces.get(entry);
		return faces ? faces.length / 2 : undefined;
	}

	/** The place a turn leads to: `null` at either end, `undefined` while the entry it leads into is still unread. */
	step(place: Place, direction: 1 | -1): Place | null | undefined {
		const count = this.diary.entries;
		if (direction === 1) {
			if (place.entry >= count) return null;
			if (place.entry >= 0) {
				const spreads = this.spreadsOf(place.entry);
				if (spreads === undefined) return undefined;
				if (place.spread + 1 < spreads) return { entry: place.entry, spread: place.spread + 1 };
			}
			const next = place.entry + 1;
			if (next < count && !this.has(next)) return undefined;
			return { entry: next, spread: 0 };
		}

		if (place.entry < 0) return null;
		if (place.entry < count && place.spread > 0) {
			return { entry: place.entry, spread: place.spread - 1 };
		}
		const previous = place.entry - 1;
		if (previous < 0) return { entry: -1, spread: 0 };
		const spreads = this.spreadsOf(previous);
		return spreads === undefined ? undefined : { entry: previous, spread: spreads - 1 };
	}

	/** What is on a place. An entry not read yet is shown as pages still waiting for their words. */
	at(place: Place): Spread {
		const { diary } = this;
		const count = diary.entries;

		if (place.entry < 0) {
			return {
				key: `front:${count}`,
				progress: 0,
				left: {
					key: `bookplate:${diary.owner}:${diary.createdAt}:${diary.cover}`,
					kind: 'bookplate',
					owner: diary.owner,
					since: diary.createdAt,
					cover: diary.cover
				},
				right: {
					key: `title:${diary.title}:${count}:${this.#where}`,
					kind: 'title',
					title: diary.title,
					entries: count,
					where: this.#where
				}
			};
		}

		if (place.entry >= count) {
			return {
				key: `end:${count}:${this.#owner}`,
				progress: 1,
				left: BLANK,
				right: this.#owner
					? {
							key: `invite:${this.#today}:${this.#metrics.name}`,
							kind: 'invite',
							today: this.#today
						}
					: { key: `end:${count}`, kind: 'end', entries: count }
			};
		}

		const faces = this.#faces.get(place.entry);
		const spreads = faces ? faces.length / 2 : 1;
		// The title pages are the first step of the way and the last page is the end of it.
		const progress = (place.entry + 1 + place.spread / spreads) / (count + 1);
		if (!faces) {
			return { key: `waiting:${place.entry}`, progress, left: WAITING, right: WAITING };
		}
		const left = faces[place.spread * 2];
		const right = faces[place.spread * 2 + 1];
		return { key: `${left.key}|${right.key}`, progress, left, right };
	}
}
