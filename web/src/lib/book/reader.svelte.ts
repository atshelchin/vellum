import { SvelteMap } from 'svelte/reactivity';
import type { Diary, Entry } from '../vellum';
import { Pages, type Face, type Place, type Spread } from './faces';
import { DEFAULT_METRICS, type Metrics } from './layout';
import { createMeasure, fontsReady } from './paint';
import type { BookStage, Source } from './Stage';

/** How many entries are read from the chain at a time. */
const CHUNK = 8;

export interface ReaderOptions {
	diary: Diary;
	/** Whether the reader may write in this diary. */
	owner: boolean;
	/** The chain the diary is kept on, as its title page names it. */
	where: string;
	/** Reads entries `offset` to `offset + limit`, in the order they were written. */
	fetch: (offset: number, limit: number) => Promise<Entry[]>;
	/** Reads when every entry was written, in the order they were written. */
	fetchTimes?: () => Promise<number[]>;
	/**
	 * Set when what is being read is one entry of a diary, shared on its own:
	 * the number that entry has in the diary. `diary` then has that one entry
	 * and `fetch` reads it as its first.
	 */
	lone?: number;
	/** The blank page that asks to be written on was pressed. */
	onInvite?: () => void;
	/** The shut book was pressed. */
	onCover?: () => void;
	/** The desk beside the open book was pressed. */
	onOutside?: () => void;
}

/**
 * Someone reading a diary: where they are in it, and the entries read from the
 * chain so far. It is what the book asks for its next page.
 *
 * Entries are read a few at a time, around wherever the reader is, and kept:
 * an entry cannot change once it is written.
 *
 * It measures writing, so it can only be made in a browser.
 */
export class Reader implements Source {
	diary: Diary;
	/** Where the reader is, or is on the way to. */
	place = $state<Place>({ entry: -1, spread: 0 });
	/** How many chunks are being read from the chain right now. */
	loading = $state(0);
	failed = $state(false);
	/**
	 * When each entry was written, once somebody has asked: what the diary's
	 * calendar is drawn from. Nobody reading straight through needs it.
	 */
	times = $state.raw<number[]>();
	/** The dates were asked for and did not come. */
	timesFailed = $state(false);

	#options: ReaderOptions;
	#stage: BookStage | undefined;
	#pages: Pages;
	/** Watched, so that whatever shows the entry the reader is on shows it the moment it is read. */
	#entries = new SvelteMap<number, Entry>();
	// Only who is already reading what: nothing on the page depends on it.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#reading = new Map<number, Promise<void>>();
	#today = Math.floor(Date.now() / 1000);
	#timing: Promise<void> | undefined;

	constructor(options: ReaderOptions) {
		this.#options = options;
		this.diary = $state(options.diary);
		this.#pages = this.#set(DEFAULT_METRICS);
	}

	#set(metrics: Metrics): Pages {
		const pages = new Pages(this.diary, {
			metrics,
			measure: createMeasure(metrics),
			owner: this.#options.owner,
			today: this.#today,
			where: this.#options.where,
			lone: this.#options.lone
		});
		pages.add([...this.#entries.values()]);
		return pages;
	}

	/** The number in the diary of the one entry being read, if one entry is all there is to read. */
	get lone(): number | undefined {
		return this.#options.lone;
	}

	/** The entry the reader is on, if they are on one and it has been read. */
	get entry(): Entry | undefined {
		return this.#entries.get(this.place.entry);
	}

	/** An entry by its place, if it has been read. */
	entryAt(index: number): Entry | undefined {
		return this.#entries.get(index);
	}

	get spread(): Spread {
		return this.#pages.at(this.place);
	}

	get atStart(): boolean {
		return this.place.entry < 0;
	}

	get atEnd(): boolean {
		return this.place.entry >= this.diary.entries;
	}

	/** Takes up the book: its pages are set for the screen it is on. */
	attach(stage: BookStage) {
		this.#stage = stage;
		stage.source = this;
		this.relayout(stage.metrics);
		void this.#around(this.place.entry);
	}

	detach() {
		this.#stage = undefined;
	}

	/** The writing changed size: every entry is set again, and the reader put back at the start of theirs. */
	relayout(metrics: Metrics) {
		this.#pages = this.#set(metrics);
		this.place = { entry: this.place.entry, spread: 0 };
		this.#stage?.show(this.spread);
	}

	neighbour(direction: 1 | -1): Spread | null {
		const next = this.#pages.step(this.place, direction);
		if (next === undefined) {
			// The entry that way has not been read yet. It will be in a moment.
			void this.#read(this.place.entry + direction);
			return null;
		}
		return next ? this.#pages.at(next) : null;
	}

	turned(direction: 1 | -1) {
		const next = this.#pages.step(this.place, direction);
		if (!next) return;
		this.place = next;
		void this.#around(next.entry);
	}

	tapped(target: Face | 'cover' | 'outside') {
		if (target === 'cover') this.#options.onCover?.();
		else if (target === 'outside') this.#options.onOutside?.();
		else if (target.kind === 'invite') this.#options.onInvite?.();
	}

	step(direction: 1 | -1): boolean {
		if (this.#stage) return this.#stage.step(direction);
		// No book could be drawn: the entries are still there to be read, one at a time.
		void this.goTo(this.place.entry + direction);
		return true;
	}

	/** Whether the reader may write here. It can change under them: a wallet connects, or leaves. */
	set owner(owner: boolean) {
		if (owner === this.#options.owner) return;
		this.#options.owner = owner;
		this.#pages = this.#set(this.#pages.metrics);
		// Only the last page reads differently for an owner.
		if (this.atEnd) this.#stage?.show(this.spread);
	}

	/**
	 * Asks for an entry to be read from the chain, if it has not been: for a
	 * view that shows more of the diary than the one place the reader is at.
	 */
	want(entry: number): Promise<void> {
		return this.#read(entry);
	}

	/**
	 * Says where the reader has got to, when it was not the book that took them
	 * there: a view that is scrolled moves by itself and reports where it is.
	 */
	settle(entry: number) {
		const target = Math.max(-1, Math.min(entry, this.diary.entries));
		if (target === this.place.entry) return;
		this.place = { entry: target, spread: 0 };
		this.#stage?.show(this.spread);
		void this.#around(target);
	}

	/** Leafs through to an entry, or to the title pages (-1), or to the last page. */
	async goTo(entry: number) {
		const target = Math.max(-1, Math.min(entry, this.diary.entries));
		if (target === this.place.entry && this.place.spread === 0) return;
		if (target >= 0 && target < this.diary.entries) await this.#read(target);
		const direction = target > this.place.entry ? 1 : -1;
		this.place = { entry: target, spread: 0 };
		this.#stage?.leafTo(this.spread, direction);
		void this.#around(target);
	}

	/** Reads the dates of every entry, once. Asking again while they are on their way waits for the same answer. */
	readTimes(): Promise<void> {
		const fetch = this.#options.fetchTimes;
		if (!fetch || this.times) return Promise.resolve();
		return (this.#timing ??= (async () => {
			this.timesFailed = false;
			try {
				const times = await fetch();
				// An entry sealed while the dates were being read is in neither answer for certain: what was seen wins.
				for (const entry of this.#entries.values()) times[entry.index] = entry.writtenAt;
				this.times = times;
			} catch (error) {
				console.error('Vellum: the dates could not be read', error);
				this.timesFailed = true;
			} finally {
				this.#timing = undefined;
			}
		})());
	}

	/** The diary changed on the chain: an entry was written. */
	async update(diary: Diary, written?: Entry) {
		this.diary = diary;
		this.#pages.diary = diary;
		if (written) {
			if (this.times) {
				const times = [...this.times];
				times[written.index] = written.writtenAt;
				this.times = times;
			}
			await fontsReady(written.text);
			this.#entries.set(written.index, written);
			this.#pages.add([written]);
		}
		this.#stage?.setBinding({ title: diary.title, cover: diary.cover, entries: diary.entries });
	}

	/** Reads the entries around one, so a turn either way has its page ready. */
	async #around(entry: number) {
		const count = this.diary.entries;
		const wanted = [entry, entry - 1, entry + 1, entry + 3].filter(
			(index) => index >= 0 && index < count
		);
		await Promise.all(wanted.map((index) => this.#read(index)));
	}

	#read(entry: number): Promise<void> {
		if (entry < 0 || entry >= this.diary.entries || this.#entries.has(entry))
			return Promise.resolve();
		const chunk = Math.floor(entry / CHUNK);
		const reading = this.#reading.get(chunk);
		if (reading) return reading;

		this.loading++;
		const read = (async () => {
			try {
				const entries = await this.#options.fetch(chunk * CHUNK, CHUNK);
				// A font comes in pieces, by script, and a canvas does not wait for one.
				await fontsReady(entries.map((each) => each.text).join(' '));
				for (const each of entries) this.#entries.set(each.index, each);
				this.#pages.add(entries);
				this.failed = false;
				// If the reader has been looking at pages still waiting for their words, here they are.
				if (entries.some((each) => each.index === this.place.entry)) {
					this.#stage?.show(this.spread);
				}
			} catch (error) {
				console.error('Vellum: entries could not be read', error);
				this.failed = true;
			} finally {
				this.loading--;
				this.#reading.delete(chunk);
			}
		})();
		this.#reading.set(chunk, read);
		return read;
	}
}
