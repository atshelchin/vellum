import { describe, expect, it } from 'vitest';
import type { Diary, Entry } from '../vellum';
import { entryFaces, Pages, readable, type Place } from './faces';
import { metricsFor } from './layout';

const metrics = metricsFor(600);
/** Wide enough that a "word" is a line: the tests count lines, not letters. */
const measure = (text: string) => (text.includes(' ') ? Infinity : 1);
const lines = (count: number) => Array.from({ length: count }, (_, i) => `l${i}`).join(' ');

const diary = (entries: number): Diary => ({
	id: 7,
	owner: '0x12aE3968E5bd0c93386cC12fa6E776726D13af22',
	createdAt: 1_700_000_000,
	lastWrittenAt: 0,
	cover: 2,
	entries,
	title: 'Field Notes'
});

const entry = (index: number, lineCount = 3): Entry => ({
	index,
	writtenAt: 1_700_000_000 + index * 86400,
	text: lines(lineCount)
});

function pages(entries: Entry[], count = entries.length, owner = false) {
	const book = new Pages(diary(count), {
		metrics,
		measure,
		owner,
		today: 1_800_000_000,
		where: 'Ethereum'
	});
	book.add(entries);
	return book;
}

describe('an entry on pages', () => {
	it('begins with its date on the left and its words on the right', () => {
		const faces = entryFaces(entry(0), metrics, measure);
		expect(faces.map((face) => face.kind)).toEqual(['date', 'text']);
		expect(faces[1]).toMatchObject({ kind: 'text', page: 1, pages: 1 });
	});

	it('always fills whole spreads', () => {
		for (const count of [1, metrics.firstLines, metrics.firstLines + 1, 80, 200]) {
			expect(entryFaces(entry(0, count), metrics, measure).length % 2).toBe(0);
		}
	});

	it('runs on to as many pages as it needs, and loses nothing', () => {
		const count = metrics.firstLines + metrics.lines * 2 + 5;
		const faces = entryFaces(entry(0, count), metrics, measure);
		const text = faces.filter((face) => face.kind === 'text');
		expect(text).toHaveLength(4);
		expect(text.flatMap((face) => face.lines).join(' ')).toBe(lines(count));
		// Only the page that begins the entry carries its date.
		expect(text.map((face) => face.heading !== undefined)).toEqual([true, false, false, false]);
	});

	it('paints the same page the same way, and a different one differently', () => {
		const a = entryFaces(entry(3), metrics, measure);
		const b = entryFaces(entry(3), metrics, measure);
		const c = entryFaces(entry(4), metrics, measure);
		expect(a.map((face) => face.key)).toEqual(b.map((face) => face.key));
		expect(a[1].key).not.toBe(c[1].key);
	});
});

describe('turning through a diary', () => {
	const front: Place = { entry: -1, spread: 0 };

	it('goes from the title pages through every entry to the last page, and back', () => {
		const long = metrics.firstLines + metrics.lines + 1;
		const book = pages([entry(0), entry(1, long), entry(2)]);
		const forward: string[] = [];
		let place: Place | null | undefined = front;
		while (place) {
			forward.push(`${place.entry}.${place.spread}`);
			place = book.step(place, 1);
		}
		expect(forward).toEqual(['-1.0', '0.0', '1.0', '1.1', '2.0', '3.0']);

		const back: string[] = [];
		place = { entry: 3, spread: 0 };
		while (place) {
			back.push(`${place.entry}.${place.spread}`);
			place = book.step(place, -1);
		}
		expect(back).toEqual([...forward].reverse());
	});

	it('stops at both ends', () => {
		const book = pages([entry(0)]);
		expect(book.step(front, -1)).toBeNull();
		expect(book.step({ entry: 1, spread: 0 }, 1)).toBeNull();
	});

	it('says an entry is not read yet instead of guessing at it', () => {
		const book = pages([entry(0)], 5);
		// Forward into entry 1, which has not been read.
		expect(book.step({ entry: 0, spread: 0 }, 1)).toBeUndefined();
		// Back from entry 3 into entry 2: how many spreads it has is not known.
		expect(book.step({ entry: 3, spread: 0 }, -1)).toBeUndefined();
		expect(book.at({ entry: 2, spread: 0 }).left.kind).toBe('waiting');
	});

	it('goes straight from the title pages to the last page of an empty diary', () => {
		const book = pages([], 0);
		expect(book.step(front, 1)).toEqual({ entry: 0, spread: 0 });
		expect(book.at({ entry: 0, spread: 0 }).right.kind).toBe('end');
	});

	it('ends on a page to write on for its keeper, and a full stop for anyone else', () => {
		expect(pages([entry(0)], 1, true).at({ entry: 1, spread: 0 }).right.kind).toBe('invite');
		expect(pages([entry(0)], 1, false).at({ entry: 1, spread: 0 }).right.kind).toBe('end');
	});

	it('is further through the book the further it is turned', () => {
		const book = pages([entry(0), entry(1), entry(2)]);
		let place: Place | null | undefined = front;
		let before = -1;
		while (place) {
			const { progress } = book.at(place);
			expect(progress).toBeGreaterThan(before);
			expect(progress).toBeLessThanOrEqual(1);
			before = progress;
			place = book.step(place, 1);
		}
		expect(book.at(front).progress).toBe(0);
		expect(before).toBe(1);
	});

	it('names the chain on the title page', () => {
		expect(pages([]).at(front).right).toMatchObject({ kind: 'title', where: 'Ethereum' });
	});
});

describe('reading one page at a time', () => {
	it('stops on words and passes over the pages that are only furniture', () => {
		const faces = entryFaces(entry(0, metrics.firstLines + 1), metrics, measure);
		expect(faces.map((face) => `${face.kind}:${readable(face)}`)).toEqual([
			'date:false',
			'text:true',
			'text:true',
			'blank:false'
		]);
	});
});
