<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import type { Reader } from '#lib/book/reader.svelte.ts';
	import type { Net } from '#lib/chain.ts';
	import { dateParts, penNameOf, plural, shortAddress } from '#lib/format.ts';
	import type { Diary } from '#lib/vellum.ts';
	import Face from './Face.svelte';
	import Seal from './Seal.svelte';

	let {
		reader,
		net,
		diary,
		owner = false,
		lone,
		onwrite,
		ontap
	}: {
		reader: Reader;
		net: Net;
		/** The diary itself, for what its first leaf says of it. */
		diary: Diary;
		/** Whether the reader may write in it: the last leaf then asks them to. */
		owner?: boolean;
		/** Set when one entry is all there is to read: its place in the diary, counted from zero. */
		lone?: number;
		onwrite?: () => void;
		/** A leaf was pressed, and not to do anything on it. */
		ontap?: () => void;
	} = $props();

	/** How many leaves either side of the reader have their words on them. */
	const NEAR = 2;
	/** How long a leaf takes to come up, in milliseconds. */
	const TURN = 380;
	/** How long a wheel has to be still before what it does next is a new movement of it. */
	const PAUSE = 180;
	/** How far past the end of a leaf a wheel has to be pushed to turn it. */
	const PUSH = 40;

	let scroller: HTMLElement;
	/** The leaf the reader is on: -1 for the first, the number of entries for the last. */
	let at = $state(untrack(() => reader.place.entry));
	let count = $derived(reader.diary.entries);
	let leaves = $derived(Array.from({ length: count + 2 }, (_, index) => index - 1));
	let name = $derived(penNameOf(diary));
	let today = dateParts(Math.floor(Date.now() / 1000));

	/**
	 * Whether the leaves are being moved by a finger on glass. A phone scrolls
	 * its own way and does it well, coming to rest on a leaf by itself, so there
	 * it is left to. A wheel, a trackpad and a keyboard are moved from here,
	 * because left to the browser a wheel moves a few lines and is pulled back,
	 * and a trackpad's coasting runs on through three leaves.
	 */
	let touch = $state(false);

	// How tall each entry's leaf turned out, once its words were on it. A leaf
	// far from the reader has its words taken off again, and keeps its room.
	// Not watched: it is read when a leaf is drawn, and a leaf is drawn again
	// when it matters.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const heights = new Map<number, number>();

	const leaf = (index: number) => scroller.children[index + 1] as HTMLElement;
	const clamp = (value: number, least: number, most: number) =>
		Math.max(least, Math.min(value, most));

	/** An entry as paragraphs: a line of its own is a paragraph, and an empty one is the air between two. */
	const paragraphs = (text: string) => text.replace(/\r\n?/g, '\n').split('\n');

	// The words of the leaves around the reader are fetched before they are scrolled to.
	$effect(() => {
		for (let index = at - NEAR; index <= at + NEAR; index++) void reader.want(index);
	});

	// Something else moved the reader: the calendar, the slider, a page just
	// sealed. The leaves go where the reader has been put.
	$effect(() => {
		const wanted = reader.place.entry;
		untrack(() => {
			if (wanted !== at) go(wanted, Math.abs(wanted - at) === 1);
		});
	});

	onMount(() => {
		touch = window.matchMedia('(pointer: coarse)').matches;
		where = aim = leaf(at).offsetTop;
		scroller.scrollTop = where;
		remember();
		return () => cancelAnimationFrame(frame);
	});

	// ── Where the leaves are, and moving them ─────────────────────────────────
	//
	// Everything that moves the leaves from here goes through one place: `aim`
	// is where they are meant to be, and one loop takes them there. Within a
	// leaf they follow it closely, as a page follows a wheel. From one leaf to
	// the next they are carried over in a fixed time, and nothing is listened
	// to until they have arrived.

	/** Where the leaves are, to a part of a pixel. */
	let where = 0;
	/** Where they are meant to be. */
	let aim = 0;
	/**
	 * The leaf being brought up, while one is: to its top, or to its `end` when
	 * the reader is going back up the diary and should come on the last of the
	 * entry before, not be dropped at the head of it.
	 */
	let carried: { from: number; to: number; end: boolean; began: number } | null = null;
	let frame = 0;
	let before = 0;

	function move(now: number) {
		frame = 0;
		const passed = Math.min(64, now - before);
		before = now;
		if (carried) {
			// Where it is going is asked for each time: a leaf may still be finding its height.
			const to = carried.end ? foot(carried.to) : leaf(carried.to).offsetTop;
			const done = Math.min(1, (now - carried.began) / TURN);
			where = carried.from + (to - carried.from) * (1 - (1 - done) ** 3);
			if (done >= 1) {
				where = aim = to;
				carried = null;
			}
		} else {
			const left = aim - where;
			where = Math.abs(left) < 0.5 ? aim : where + left * (1 - Math.exp(-passed / 55));
		}
		scroller.scrollTop = where;
		remember();
		if (carried || where !== aim) frame = requestAnimationFrame(move);
	}

	function wake() {
		if (frame) return;
		before = performance.now();
		frame = requestAnimationFrame(move);
	}

	/** How far down a leaf can be scrolled: to where its last line is at the foot of the screen. */
	function foot(index: number) {
		const here = leaf(index);
		return Math.max(here.offsetTop, here.offsetTop + here.offsetHeight - scroller.clientHeight);
	}

	/** The top and the bottom of how far the leaf the reader is on can be scrolled. */
	function span() {
		return { top: leaf(at).offsetTop, bottom: foot(at) };
	}

	/**
	 * Brings another leaf up, to its top or to its `end`. Nothing else is done
	 * until it is there.
	 */
	function carry(to: number, end = false) {
		const target = clamp(to, -1, count);
		if (target === at || carried) return;
		at = target;
		reader.settle(target);
		carried = { from: where, to: target, end, began: performance.now() };
		wake();
	}

	/** Goes to a leaf: -1 for the first, the number of entries for the last. */
	export function go(entry: number, smooth = false) {
		const to = clamp(entry, -1, count);
		if (touch) {
			// On glass the browser does the going, the way it does the scrolling.
			at = to;
			reader.settle(to);
			placing = true;
			void tick().then(() => {
				scroller.scrollTo({ top: leaf(to).offsetTop, behavior: smooth ? 'smooth' : 'instant' });
				setTimeout(() => (placing = false), smooth ? 520 : 60);
			});
			return;
		}
		if (smooth) return carry(to);
		carried = null;
		at = to;
		reader.settle(to);
		void tick().then(() => {
			where = aim = leaf(to).offsetTop;
			scroller.scrollTop = where;
			remember();
		});
	}

	/**
	 * Moves on by a little or by a screenful: down the leaf the reader is on
	 * while there is more of it, and to the next leaf once there is not. Going
	 * back up, the leaf before is come on at its end, so that the reading goes
	 * on from where it left off. A key that is being `held` down stops at the
	 * end of a leaf, as a wheel does: the next leaf is for whoever presses
	 * again.
	 */
	export function nudge(direction: 1 | -1, much: 'line' | 'screen', held = false) {
		if (carried) return;
		const { top, bottom } = span();
		const ended = direction > 0 ? aim >= bottom - 1 : aim <= top + 1;
		if (ended) return held ? undefined : carry(at + direction, direction < 0);
		const by = much === 'line' ? 96 : scroller.clientHeight * 0.88;
		aim = clamp(aim + direction * by, top, bottom);
		wake();
	}

	/** To the head of the next leaf or of the one before, wherever on this one the reader is. */
	export function turn(direction: 1 | -1) {
		carry(at + direction);
	}

	// ── A wheel, or two fingers on a trackpad ─────────────────────────────────
	//
	// Inside an entry longer than the screen it scrolls, and stops at the end.
	// One movement of it that begins at the end of a leaf, or on a leaf that
	// fits the screen, brings up the next leaf, and one only: what a trackpad
	// goes on sending as it coasts is the same movement running out.

	/** When the wheel last moved. */
	let wheeledAt = 0;
	/** Whether this movement of it began with the leaf at its top, and at its bottom. */
	let began = { top: false, bottom: false };
	/** How far this movement has pushed past the end of the leaf. */
	let pushed = 0;
	/** This movement has already turned a leaf, and has no more to do. */
	let spent = false;
	/** How hard the wheel was last going, and whether it has been slowing down. */
	let pace = 0;
	let slowing = 0;

	function wheeled(event: WheelEvent) {
		// Pinching to zoom is not scrolling.
		if (event.ctrlKey) return;
		event.preventDefault();
		touch = false;

		// Lines or screens, on the wheels that count in those, as pixels.
		const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? scroller.clientHeight : 1;
		const by = event.deltaY * unit;
		if (by === 0) return;

		// A new movement: the wheel was still, or was coasting to a stop and has been pushed again.
		const now = performance.now();
		const hard = Math.abs(by);
		const again = slowing >= 3 && hard > pace * 1.5 + 10;
		if (now - wheeledAt > PAUSE || again) {
			const { top, bottom } = span();
			began = { top: aim <= top + 1, bottom: aim >= bottom - 1 };
			pushed = 0;
			spent = false;
			slowing = 0;
		} else {
			slowing = hard < pace ? slowing + 1 : hard > pace ? 0 : slowing;
		}
		wheeledAt = now;
		pace = hard;
		if (carried || spent) return;

		const direction = by > 0 ? 1 : -1;
		const { top, bottom } = span();
		const ended = direction > 0 ? aim >= bottom - 1 : aim <= top + 1;
		if (!ended) {
			aim = clamp(aim + by, top, bottom);
			wake();
			return;
		}
		// At the end of the leaf. Only a movement that started here turns it: one
		// that arrived here on the way down an entry stops, as a page does.
		if (!(direction > 0 ? began.bottom : began.top)) return;
		pushed += by;
		if (Math.abs(pushed) < PUSH) return;
		spent = true;
		// Back up the diary, the entry before is come on at its end: the reading is continuous.
		carry(at + direction, direction < 0);
	}

	// ── A finger, and whatever else moves the leaves without asking ───────────

	/**
	 * Where the reader is, as a leaf and how far down it they are. Kept as the
	 * leaves move, so that when a leaf above changes height, as it does when
	 * its words arrive, the reader can be put back exactly where they were.
	 */
	let anchor = { index: untrack(() => at), offset: 0 };
	/** The browser is taking the leaves somewhere it was told to, and is not to be read as the reader's own scrolling. */
	let placing = false;

	function remember() {
		anchor = { index: at, offset: scroller.scrollTop - leaf(at).offsetTop };
	}

	/** Works out which leaf the reader is on from where they have scrolled to. */
	function locate() {
		const line = scroller.scrollTop + scroller.clientHeight * 0.4;
		let index = at;
		// From where they were: nobody gets far between two looks.
		for (;;) {
			const here = leaf(index);
			if (line < here.offsetTop && index > -1) index--;
			else if (line >= here.offsetTop + here.offsetHeight && index < count) index++;
			else break;
		}
		if (index !== at) {
			at = index;
			reader.settle(index);
		}
	}

	let looking = false;
	function scrolled() {
		// What the loop above does is known already.
		if (frame || looking) return;
		looking = true;
		requestAnimationFrame(() => {
			looking = false;
			if (frame) return;
			where = aim = scroller.scrollTop;
			if (!placing) locate();
			remember();
		});
	}

	function tapped(event: MouseEvent) {
		if ((event.target as Element).closest('button, a')) return;
		// Someone selecting what is written is not asking for anything.
		if (window.getSelection()?.toString()) return;
		ontap?.();
	}

	/**
	 * Keeps a leaf's height once its words are on it, and keeps the reader
	 * where they were when a leaf changes height above them.
	 */
	function measured(node: HTMLElement, index: number) {
		const section = node.parentElement!;
		const watcher = new ResizeObserver(() => {
			heights.set(index, section.offsetHeight);
			// A leaf being brought up is aimed at afresh every moment: it needs no putting back.
			if (carried || placing) return;
			const wanted = leaf(anchor.index).offsetTop + anchor.offset;
			const off = wanted - scroller.scrollTop;
			if (Math.abs(off) <= 1) return;
			where += off;
			aim += off;
			scroller.scrollTop = where;
		});
		watcher.observe(node);
		return { destroy: () => watcher.disconnect() };
	}
</script>

<!--
	The diary as it is read: a leaf to an entry, one above another. A leaf fills
	the screen, and a swipe or a turn of the wheel brings the next one to rest
	there; an entry longer than the screen scrolls like any page until it ends.
	The book is how a diary is opened and what it looks like shut. This is how it
	is read.
-->
<div
	class="leaves"
	class:touch
	bind:this={scroller}
	onscroll={scrolled}
	onwheel={wheeled}
	ontouchstart={() => (touch = true)}
	onclick={tapped}
	role="presentation"
>
	{#each leaves as index (index)}
		{#if index < 0}
			<section class="leaf" aria-label="Title page">
				<div class="sheet front">
					<p class="eyebrow">
						{lone === undefined ? 'A diary' : 'One page of a diary'} kept on {net.chain.name}
					</p>
					<h1 dir="auto">{diary.title}</h1>
					<div class="keeper">
						<Face address={diary.owner} size={52} />
						<div>
							{#if name}<p class="name" dir="auto">{name}</p>{/if}
							<p class="account mono" class:alone={!name}>{shortAddress(diary.owner)}</p>
						</div>
					</div>
					<p class="since">
						since {dateParts(diary.createdAt).day} ·
						{#if lone !== undefined}
							entry {lone + 1}, shared on its own
						{:else if diary.entries === 0}
							not a word yet
						{:else}
							{plural(diary.entries, 'entry', 'entries')}
						{/if}
					</p>
					<p class="onward" aria-hidden="true">
						<svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 9l6 6 6-6" /></svg>
					</p>
				</div>
			</section>
		{:else if index >= count}
			<section class="leaf" aria-label="The last page">
				{#if owner && lone === undefined}
					<div class="sheet back">
						<p class="when">{today.day}</p>
						<button class="invite" onclick={onwrite}>
							<span>Write today’s page</span>
							<small>{today.weekday}</small>
						</button>
					</div>
				{:else}
					<div class="sheet back">
						<p class="closing">
							{lone !== undefined ? 'The rest was not shared.' : 'The rest is not written yet.'}
						</p>
						<p class="eyebrow">
							{#if lone !== undefined}
								One page of a diary
							{:else if count === 0}
								Not a word so far
							{:else}
								{plural(count, 'entry', 'entries')} so far
							{/if}
						</p>
					</div>
				{/if}
			</section>
		{:else}
			{@const entry = Math.abs(index - at) <= NEAR ? reader.entryAt(index) : undefined}
			<section
				class="leaf"
				style:height={entry || !heights.has(index) ? undefined : `${heights.get(index)}px`}
				aria-label="Entry {reader.lone ?? index + 1}"
			>
				{#if entry}
					{@const when = dateParts(entry.writtenAt)}
					<article class="sheet" use:measured={index}>
						<header>
							<p class="eyebrow">{when.weekday}</p>
							<h2>{when.day}</h2>
						</header>
						<div class="text">
							{#each paragraphs(entry.text) as paragraph, line (line)}
								{#if paragraph.trim() === ''}
									<p class="air"></p>
								{:else}
									<p dir="auto">{paragraph}</p>
								{/if}
							{/each}
						</div>
						<footer>
							<Seal size={46} />
							<p>Entry {reader.lone ?? index + 1} · {when.time}</p>
						</footer>
					</article>
				{:else}
					<div class="sheet waiting" aria-busy="true"></div>
				{/if}
			</section>
		{/if}
	{/each}
</div>

<style>
	.leaves {
		position: absolute;
		inset: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: none;
		-webkit-overflow-scrolling: touch;
	}

	.leaves::-webkit-scrollbar {
		display: none;
	}

	/*
	 * Under a finger a leaf comes to rest at the top of the screen by itself,
	 * and the next one waits to be asked for. A wheel is seen to from the
	 * script: the two would pull against each other.
	 */
	.leaves.touch {
		scroll-snap-type: y mandatory;
	}

	.leaf {
		display: flex;
		justify-content: center;
		min-height: 100%;
		padding: 22px 20px;
		scroll-snap-align: start;
		scroll-snap-stop: always;
	}

	/* A sheet of the same paper the book is made of. */
	.sheet {
		display: flex;
		flex-direction: column;
		width: min(720px, 100%);
		padding: clamp(40px, 7vh, 72px) clamp(28px, 6vw, 72px) 40px;
		border-radius: 5px;
		background:
			linear-gradient(90deg, rgb(58 40 22 / 0.13), transparent 7%),
			radial-gradient(120% 80% at 100% 100%, rgb(150 104 52 / 0.14), transparent 60%), var(--paper);
		box-shadow:
			0 30px 70px rgb(0 0 0 / 0.55),
			0 0 0 1px rgb(120 90 50 / 0.3);
		color: var(--ink);
	}

	header {
		padding-bottom: 18px;
		border-bottom: 3px double rgb(111 68 40 / 0.45);
	}

	.eyebrow {
		color: rgb(111 68 40 / 0.85);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	h2 {
		margin-top: 4px;
		color: #6f4428;
		font-size: clamp(32px, 5vw, 44px);
		font-weight: 600;
		line-height: 1.1;
	}

	/*
	 * Set to be read at length: a size that needs no leaning in, lines far
	 * enough apart to find the next one, and no wider than the eye will follow.
	 */
	.text {
		flex: 1;
		padding: 26px 0 34px;
		font-family: var(--text);
		font-size: 19px;
		line-height: 1.85;
		overflow-wrap: anywhere;
	}

	.text p {
		margin: 0;
		white-space: pre-wrap;
	}

	.air {
		height: 0.9em;
	}

	footer {
		display: flex;
		align-items: center;
		gap: 12px;
		color: rgb(111 68 40 / 0.8);
		font-family: var(--serif);
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	/* A leaf whose words have not come yet: the sheet is there, and faintly ruled. */
	.waiting {
		min-height: 60%;
		background-image:
			repeating-linear-gradient(transparent 0 37px, rgb(70 92 140 / 0.13) 37px 38px),
			linear-gradient(var(--paper), var(--paper));
		animation: breathe 1.6s ease-in-out infinite;
	}

	/* The first leaf: what the diary is called and whose it is, as on a title page. */
	.front,
	.back {
		align-items: center;
		justify-content: center;
		gap: 18px;
		text-align: center;
	}

	.front {
		outline: 1px solid rgb(111 68 40 / 0.4);
		outline-offset: -18px;
	}

	/* A title in a writing its face has no bold for is left as it is: a browser's own thickening smudges it. */
	h1,
	h2 {
		font-synthesis: none;
	}

	h1 {
		max-width: 100%;
		color: var(--ink);
		font-size: clamp(40px, 8vw, 76px);
		font-style: italic;
		font-weight: 600;
		line-height: 1.08;
		overflow-wrap: anywhere;
	}

	.keeper {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 10px;
		text-align: left;
	}

	.name {
		font-family: var(--text);
		font-size: 21px;
		font-style: italic;
		line-height: 1.2;
	}

	.account {
		color: rgb(111 68 40 / 0.85);
		font-size: 13px;
	}

	.account.alone {
		color: var(--ink);
		font-size: 17px;
	}

	.since {
		color: #6f4428;
		font-family: var(--serif);
		font-size: 21px;
		font-style: italic;
	}

	.onward {
		margin-top: 12px;
		color: rgb(111 68 40 / 0.55);
		animation: nod 2.2s ease-in-out infinite;
	}

	.onward path {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.closing,
	.when {
		color: #6f4428;
		font-family: var(--serif);
		font-size: clamp(30px, 5vw, 40px);
		font-style: italic;
		font-weight: 500;
	}

	/* The next page, not yet written: pencilled round, waiting to be inked. */
	.invite {
		display: grid;
		gap: 6px;
		width: min(440px, 100%);
		padding: 38px 24px;
		border: 2px dashed rgb(111 68 40 / 0.55);
		border-radius: 16px;
		background: none;
		color: #6f4428;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s;
	}

	.invite:hover {
		border-color: #6f4428;
		background: rgb(111 68 40 / 0.06);
	}

	.invite span {
		font-family: var(--serif);
		font-size: 30px;
		font-style: italic;
		font-weight: 600;
	}

	.invite small {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	@keyframes breathe {
		50% {
			opacity: 0.6;
		}
	}

	@keyframes nod {
		50% {
			transform: translateY(6px);
		}
	}

	/*
	 * A phone: the sheet is the screen. It is lit evenly, edge to edge: with no
	 * dark round it and no other page beside it, a shadow down one side or in a
	 * corner is only a patch where the light is missing.
	 */
	@media (max-width: 640px) {
		.leaf {
			padding: 0;
		}

		.sheet {
			width: 100%;
			padding: calc(34px + env(safe-area-inset-top)) 22px calc(30px + env(safe-area-inset-bottom));
			border-radius: 0;
			background: var(--paper);
			box-shadow: 0 1px 0 rgb(120 90 50 / 0.35);
		}

		.text {
			padding: 20px 0 28px;
			font-size: 18px;
			line-height: 1.8;
		}

		.front {
			outline-offset: -12px;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.waiting,
		.onward {
			animation: none;
		}
	}
</style>
