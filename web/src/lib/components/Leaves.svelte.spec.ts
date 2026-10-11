import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Reader } from '#lib/book/reader.svelte.ts';
import type { Net } from '#lib/chain.ts';
import type { Diary, Entry } from '#lib/vellum.ts';
import Leaves from './Leaves.svelte';

const diary: Diary = {
	id: 7,
	owner: '0x12aE3968E5bd0c93386cC12fa6E776726D13af22',
	createdAt: 1_790_000_000,
	lastWrittenAt: 1_790_500_000,
	cover: 0,
	entries: 4,
	title: 'Field Notes',
	penName: 'Tallis'
};

/** As much of a network as the leaves say anything of. */
const net = { chain: { name: 'Arc Testnet' } } as unknown as Net;

/** Entries 0, 1 and 3 fit a screen. Entry 2 is several screens long. */
const texts = [
	'A short page.',
	'Another short one.',
	'A long line of it.\n'.repeat(140),
	'The last.'
];

/** As much of a reader as the leaves look at: where it is, and the entries, all of them read already. */
function reader(start = 0) {
	const entries: Entry[] = texts.map((text, index) => ({
		index,
		writtenAt: 1_790_000_000 + index * 86400,
		text
	}));
	const state = $state({ place: { entry: start, spread: 0 } });
	return {
		diary: { ...diary, entries: entries.length },
		get place() {
			return state.place;
		},
		lone: undefined,
		entryAt: (index: number) => entries[index],
		want: async () => {},
		settle(entry: number) {
			state.place = { entry, spread: 0 };
		},
		/** As the calendar does, or the slider: the reader is put somewhere, and the leaves are to follow. */
		put(entry: number) {
			state.place = { entry, spread: 0 };
		}
	};
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
/** Longer than a leaf takes to come up, and than a wheel has to be still to count as stopped. */
const SETTLED = 520;

function mount(start = 0) {
	const book = reader(start);
	const view = render(Leaves, { reader: book as unknown as Reader, net, diary });
	// The leaves fill whatever they are put in: a screen of a known size.
	view.container.style.cssText = 'position: relative; width: 420px; height: 600px;';
	const scroller = view.container.querySelector<HTMLElement>('.leaves')!;
	const leaf = (entry: number) => scroller.children[entry + 1] as HTMLElement;
	const wheel = (deltaY: number) =>
		scroller.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
	return {
		book,
		view,
		scroller,
		leaf,
		wheel,
		/** Whether a leaf is at rest at the top of the screen. */
		rests: (entry: number) => Math.abs(scroller.scrollTop - leaf(entry).offsetTop) <= 1,
		/** A mouse wheel turned by `clicks` notches, one after another. */
		async notches(clicks: number, direction = 1) {
			for (let click = 0; click < clicks; click++) {
				wheel(100 * direction);
				await sleep(35);
			}
		},
		/** Two fingers flicked across a trackpad: it gathers speed, and then coasts for a second. */
		async swipe(direction = 1) {
			for (const by of [2, 6, 15, 34, 58, 70]) {
				wheel(by * direction);
				await sleep(16);
			}
			for (let by = 62; by >= 1; by *= 0.9) {
				wheel(Math.round(by) * direction);
				await sleep(16);
			}
		}
	};
}

describe('Leaves.svelte', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('opens at the leaf the reader is on', async () => {
		const { rests, book } = mount(1);
		await sleep(80);
		expect(rests(1)).toBe(true);
		expect(book.place.entry).toBe(1);
	});

	describe('a mouse wheel', () => {
		it('brings up the next leaf for one notch, and the one before for a notch back', async () => {
			const { wheel, rests, book } = mount(0);
			await sleep(80);
			wheel(100);
			await sleep(SETTLED);
			expect(book.place.entry).toBe(1);
			expect(rests(1)).toBe(true);

			wheel(-100);
			await sleep(SETTLED);
			expect(book.place.entry).toBe(0);
			expect(rests(0)).toBe(true);
		});

		it('brings up one leaf, however many notches it is spun in one go', async () => {
			const { notches, rests, book } = mount(0);
			await sleep(80);
			await notches(7);
			await sleep(SETTLED);
			expect(book.place.entry).toBe(1);
			expect(rests(1)).toBe(true);
		});

		it('brings up another once it has been still', async () => {
			const { notches, book } = mount(-1);
			await sleep(80);
			await notches(2);
			await sleep(SETTLED);
			await notches(2);
			await sleep(SETTLED);
			expect(book.place.entry).toBe(1);
		});

		it('does not go past either end', async () => {
			const { wheel, rests, book } = mount(-1);
			await sleep(80);
			wheel(-100);
			await sleep(SETTLED);
			expect(book.place.entry).toBe(-1);
			expect(rests(-1)).toBe(true);
		});
	});

	describe('a trackpad', () => {
		it('brings up one leaf for one flick, coasting and all', async () => {
			const { swipe, rests, book } = mount(0);
			await sleep(80);
			await swipe();
			await sleep(SETTLED);
			expect(book.place.entry).toBe(1);
			expect(rests(1)).toBe(true);
		});

		it('brings up another for a second flick made while the first is still coasting', async () => {
			const { wheel, swipe, book } = mount(-1);
			await sleep(80);
			// Most of a flick: it is still sending when the fingers come down again.
			for (const by of [2, 6, 15, 34, 58, 70, 62, 55, 48, 41, 35, 30, 25, 21, 18, 15, 12, 10]) {
				wheel(by);
				await sleep(16);
			}
			await sleep(220);
			await swipe();
			await sleep(SETTLED);
			expect(book.place.entry).toBe(1);
		});
	});

	describe('an entry longer than the screen', () => {
		it('scrolls under the wheel, and stops at its end', async () => {
			const { notches, scroller, leaf, book } = mount(2);
			await sleep(120);
			const top = leaf(2).offsetTop;
			const bottom = top + leaf(2).offsetHeight - scroller.clientHeight;
			expect(bottom - top).toBeGreaterThan(1200);

			await notches(3);
			await sleep(300);
			expect(book.place.entry).toBe(2);
			expect(scroller.scrollTop).toBeGreaterThan(top + 250);
			expect(scroller.scrollTop).toBeLessThan(top + 320);

			// Spun hard enough to run far past the end: it goes to the end, and no further.
			await notches(90);
			await sleep(400);
			expect(book.place.entry).toBe(2);
			expect(Math.abs(scroller.scrollTop - bottom)).toBeLessThanOrEqual(1);
		});

		it('gives way to the next leaf for a turn of the wheel begun at its end', async () => {
			const { notches, wheel, scroller, leaf, rests, book } = mount(2);
			await sleep(120);
			await notches(90);
			await sleep(SETTLED);
			expect(book.place.entry).toBe(2);

			wheel(100);
			await sleep(SETTLED);
			expect(book.place.entry).toBe(3);
			expect(rests(3)).toBe(true);

			// And back: to the end of it, where the reading left off.
			wheel(-100);
			await sleep(SETTLED);
			expect(book.place.entry).toBe(2);
			const bottom = leaf(2).offsetTop + leaf(2).offsetHeight - scroller.clientHeight;
			expect(Math.abs(scroller.scrollTop - bottom)).toBeLessThanOrEqual(1);

			// From there the wheel goes on up it, like any page.
			wheel(-100);
			await sleep(SETTLED);
			expect(book.place.entry).toBe(2);
			expect(Math.abs(scroller.scrollTop - (bottom - 100))).toBeLessThanOrEqual(1);
		});
	});

	describe('the keyboard', () => {
		it('moves down a long entry a little at a time, and on to the next at its end', async () => {
			const { view, scroller, leaf, book } = mount(2);
			await sleep(120);
			const top = leaf(2).offsetTop;

			view.component.nudge(1, 'line');
			await sleep(450);
			expect(scroller.scrollTop - top).toBeCloseTo(96, 0);

			view.component.nudge(1, 'screen');
			await sleep(600);
			expect(scroller.scrollTop - top).toBeCloseTo(96 + 600 * 0.88, 0);
			expect(book.place.entry).toBe(2);

			// The key held down, repeating: to the end of the entry, however many
			// screens that is, and not past it.
			for (let press = 0; press < 40; press++) {
				view.component.nudge(1, 'screen', true);
				await sleep(20);
			}
			await sleep(400);
			expect(book.place.entry).toBe(2);

			// Pressed again, at the end: the next leaf.
			view.component.nudge(1, 'line');
			await sleep(SETTLED);
			expect(book.place.entry).toBe(3);
		});

		it('goes from leaf to leaf with the keys that turn a page, wherever on a leaf it is', async () => {
			const { view, rests, book } = mount(2);
			await sleep(120);
			view.component.nudge(1, 'screen');
			await sleep(350);

			view.component.turn(1);
			await sleep(SETTLED);
			expect(book.place.entry).toBe(3);
			expect(rests(3)).toBe(true);
		});

		it('comes back on an entry at its end, going up, and at its head with the key that turns back', async () => {
			const { view, scroller, leaf, rests, book } = mount(3);
			await sleep(120);
			const bottom = () => leaf(2).offsetTop + leaf(2).offsetHeight - scroller.clientHeight;

			// Up, from the top of the entry after a long one: the last lines of the long one.
			view.component.nudge(-1, 'line');
			await sleep(SETTLED);
			expect(book.place.entry).toBe(2);
			expect(Math.abs(scroller.scrollTop - bottom())).toBeLessThanOrEqual(1);

			// And up again from there moves along it.
			view.component.nudge(-1, 'line');
			await sleep(450);
			expect(Math.abs(scroller.scrollTop - (bottom() - 96))).toBeLessThanOrEqual(1);

			// The key that turns back a page goes to the head of the entry before.
			view.component.turn(1);
			await sleep(SETTLED);
			view.component.turn(-1);
			await sleep(SETTLED);
			expect(book.place.entry).toBe(2);
			expect(rests(2)).toBe(true);
		});

		it('does one thing at a time: a key held down turns one leaf, then the next', async () => {
			const { view, book } = mount(-1);
			await sleep(80);
			// Five presses while the first leaf is still coming up.
			for (let press = 0; press < 5; press++) view.component.turn(1);
			await sleep(SETTLED);
			expect(book.place.entry).toBe(0);
		});
	});

	it('follows the reader when something else moves them', async () => {
		const { rests, book } = mount(0);
		await sleep(80);
		book.put(3);
		await sleep(200);
		expect(rests(3)).toBe(true);
	});

	it('leaves a finger to the browser, and comes to rest on a leaf by itself there', async () => {
		const { scroller, wheel } = mount(0);
		await sleep(80);
		scroller.dispatchEvent(new Event('touchstart', { bubbles: true }));
		await sleep(30);
		expect(scroller.classList.contains('touch')).toBe(true);
		expect(getComputedStyle(scroller).scrollSnapType).toContain('mandatory');

		// A wheel takes it back.
		wheel(100);
		await sleep(30);
		expect(scroller.classList.contains('touch')).toBe(false);
	});
});
