<script lang="ts">
	import { untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { isAddressEqual } from 'viem';
	import { page } from '$app/state';
	import { Reader } from '#lib/book/reader.svelte.ts';
	import type { BookStage } from '#lib/book/Stage.ts';
	import { BRAND } from '#lib/brand.ts';
	import { netOf } from '#lib/chain.ts';
	import BookCanvas from '#lib/components/BookCanvas.svelte';
	import BookNav from '#lib/components/BookNav.svelte';
	import Composer from '#lib/components/Composer.svelte';
	import DateIndex from '#lib/components/DateIndex.svelte';
	import Leaves from '#lib/components/Leaves.svelte';
	import Seal from '#lib/components/Seal.svelte';
	import SharePanel from '#lib/components/SharePanel.svelte';
	import { dateParts, penNameOf, plural, shortAddress } from '#lib/format.ts';
	import { immersion } from '#lib/immersion.svelte.ts';
	import { diaryPath, homePath } from '#lib/paths.ts';
	import { diarySlug, slugNames, slugOpens } from '#lib/share.ts';
	import { sound } from '#lib/sound.svelte.ts';
	import {
		fetchDiary,
		fetchEntries,
		fetchEntryTimes,
		type Diary,
		type Entry
	} from '#lib/vellum.ts';
	import { wallet } from '#lib/wallet.svelte.ts';
	import type { PageProps } from './$types';

	let { params }: PageProps = $props();

	// A diary is on one network, the one its link names.
	let net = $derived(netOf(params.network));

	let diary = $state<Diary>();
	/** Why there is no diary to show, once that is known. */
	let trouble = $state<'missing' | 'failed' | null>(null);
	let reader = $state<Reader>();
	let stage = $state<BookStage>();
	let unavailable = $state(false);
	let composing = $state(false);
	let sharing = $state(false);
	/** The diary's calendar is out. */
	let indexing = $state(false);
	let sealed = $state(false);
	/**
	 * Set when the link is to one page of the diary and not to the diary: that
	 * entry's place in it, counted from zero. It is then all there is to read.
	 */
	let lone = $state<number>();
	let viewport = $state({ width: 1280, height: 800 });

	/**
	 * How a diary is read once it is open. The book is what a diary looks like
	 * and how it is opened; but a book is read two pages at a time, turned by
	 * hand, and that is slower going than a thumb on a screen is used to. So by
	 * default it is read as leaves, one entry to a screen, one above another.
	 * Whoever would rather turn pages can have the book back.
	 */
	const REMEMBERED = 'vellum:reading';
	let reading = $state<'leaves' | 'book'>('leaves');
	/** The book has been opened: from here on the diary is being read, one way or the other. */
	let opened = $state(false);
	let leaves = $state<ReturnType<typeof Leaves>>();
	/** A browser that cannot draw the book has the leaves, which are only words. */
	let leafing = $derived(opened && (reading === 'leaves' || unavailable));

	$effect(() => {
		try {
			if (localStorage.getItem(REMEMBERED) === 'book') reading = 'book';
		} catch {
			// Nothing remembered here: leaves it is.
		}
	});

	async function readAs(way: 'leaves' | 'book') {
		// From the book to the leaves the same way as the first time: the page comes up.
		if (way === 'leaves' && stage?.isOpen) await bringUp(stage);
		reading = way;
		try {
			localStorage.setItem(REMEMBERED, way);
		} catch {
			// Not remembered, then.
		}
	}

	let owner = $derived(
		diary !== undefined && wallet.account !== null && isAddressEqual(diary.owner, wallet.account)
	);
	/** What the share sheet offers as "this page": the entry the book is open at, or the one page there is. */
	let shared = $derived.by(() => {
		if (!reader) return undefined;
		if (lone !== undefined) return { index: lone, writtenAt: reader.entryAt(0)?.writtenAt };
		return reader.entry && { index: reader.entry.index, writtenAt: reader.entry.writtenAt };
	});
	/**
	 * A book is read alone. Once it lies open and nobody is reaching for anything,
	 * everything else on the page steps back, and the book takes the room it
	 * leaves. It all comes back the moment it is reached for: a pointer at the top
	 * or foot of the screen, a press on the desk beside the book, the Tab key.
	 */
	let immersed = $state(false);
	/** The pointer has lain still long enough to be in the way of the reading. */
	let still = $state(false);
	/** The book lies open. Until it does there is nothing to be alone with. */
	let lying = $state(false);
	/** Something at the edge of the screen is being reached for, or used. */
	let held = false;
	let settling: ReturnType<typeof setTimeout> | undefined;
	let stilling: ReturnType<typeof setTimeout> | undefined;
	let fullscreen = $state(false);
	let canFill = $state(false);

	/** The room the book has when it has the screen to itself, which is the room its pages are set for. */
	const ALONE = { top: 18, bottom: 18 };
	let insets = $derived(immersed ? ALONE : { top: 64, bottom: viewport.width > 860 ? 104 : 156 });

	/** Brings the page back, and lets it go again after `rest` milliseconds unless something is holding it. */
	function reveal(rest = 2600) {
		immersed = false;
		clearTimeout(settling);
		settling = setTimeout(settle, rest);
	}

	/** Steps back, if this is a moment for it. */
	function settle() {
		clearTimeout(settling);
		if (!lying || held || composing || sharing || indexing || unavailable || wallet.pickerOpen)
			return;
		immersed = true;
	}

	function onpointermove(event: PointerEvent) {
		// A finger is not a pointer that comes to rest: it is handled where it lands.
		if (event.pointerType === 'touch') return;
		still = false;
		clearTimeout(stilling);
		stilling = setTimeout(() => (still = true), 2200);

		const edge = event.clientY < 84 || event.clientY > viewport.height - 124;
		if (edge) {
			held = true;
			reveal();
		} else if (held) {
			held = false;
			reveal(900);
		}
	}

	async function fill() {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else await document.documentElement.requestFullscreen();
		} catch {
			// The browser would rather not. The page is as full as it gets.
		}
	}

	$effect(() => {
		canFill = document.fullscreenEnabled === true;
		const changed = () => (fullscreen = document.fullscreenElement !== null);
		document.addEventListener('fullscreenchange', changed);
		return () => {
			document.removeEventListener('fullscreenchange', changed);
			clearTimeout(settling);
			clearTimeout(stilling);
		};
	});

	// The header belongs to the whole site, so it is told, and told again on leaving.
	$effect(() => {
		immersion.on = immersed;
		return () => {
			immersion.on = false;
		};
	});

	// And told when it is paper that lies under it, which it was not drawn for.
	$effect(() => {
		immersion.paper = leafing;
		return () => {
			immersion.paper = false;
		};
	});

	// Whatever takes the page over brings it back, and it steps away again afterwards.
	$effect(() => {
		if (composing || sharing || indexing || wallet.pickerOpen || unavailable) immersed = false;
		else if (untrack(() => lying)) untrack(() => reveal(1200));
	});

	// The diary this page is for is the one its address names. Should the address
	// come to name another while the page is open, that one is taken down instead.
	$effect(() => {
		const on = net;
		const slug = params.slug;
		let gone = false;
		diary = undefined;
		reader = undefined;
		lone = undefined;
		trouble = null;
		sharing = indexing = false;
		opened = lying = false;

		const named = slugNames(slug);
		if (!named || !on.vellum) {
			trouble = 'missing';
			return;
		}
		const { id, entry: only } = named;
		fetchDiary(on, id).then(
			(found) => {
				if (gone) return;
				// A number alone opens nothing: the link has to be the one the diary's keeper gave out.
				if (!slugOpens(on, slug, found) || (only !== undefined && only >= found.entries)) {
					trouble = 'missing';
					return;
				}
				diary = found;
				lone = only;
				reader = new Reader({
					where: on.chain.name,
					...(only === undefined
						? {
								diary: found,
								owner: untrack(() => owner),
								fetch: async (offset, limit) => (await fetchEntries(on, id, offset, limit)).entries,
								fetchTimes: () => fetchEntryTimes(on, id)
							}
						: {
								// One page of a diary is read as a book with that one entry in
								// it. Nobody writes in it, its keeper included: a page handed
								// out is for reading.
								diary: { ...found, entries: 1 },
								owner: false,
								lone: only + 1,
								fetch: async () =>
									(await fetchEntries(on, id, only, 1)).entries.map((entry) => ({
										...entry,
										index: 0
									}))
							}),
					onInvite: () => (composing = true),
					onCover: () => void open(),
					// Where there is no pointer to bring to the edge, a press beside the book does it.
					onOutside: () => (immersed ? reveal(5000) : settle())
				});
			},
			(error) => {
				if (gone) return;
				console.error(`${BRAND}: the diary could not be read`, error);
				trouble = /NoSuchDiary/.test(String(error)) ? 'missing' : 'failed';
			}
		);
		return () => {
			gone = true;
		};
	});

	$effect(() => {
		if (reader) reader.owner = owner && lone === undefined;
	});

	// The book opens by itself, a beat after it appears: long enough to see what
	// it is. Whenever there is a new book on the desk, it is that one that opens.
	$effect(() => {
		if (!stage) return;
		const timer = setTimeout(() => void open(), 700);
		return () => clearTimeout(timer);
	});

	/**
	 * Where a diary is opened at. A link to one page opens at that page. A link
	 * to a diary can ask for an entry to open at. Otherwise its keeper is taken
	 * to where they left off, and a visitor starts at the beginning.
	 */
	function firstPlace(of: Reader): number {
		const asked = Number(page.url.searchParams.get('entry'));
		const count = of.diary.entries;
		if (of.lone !== undefined) return 0;
		if (Number.isInteger(asked) && asked >= 1 && asked <= count) return asked - 1;
		if (untrack(() => owner) && count > 0 && !page.state.fresh) return count - 1;
		return -1;
	}

	/**
	 * Brings the page of the book that is to be read up to where a leaf will
	 * be: into the room a leaf leaves round its sheet, or, on a phone, where
	 * the sheet is the whole screen, until the page is the whole screen too.
	 */
	function bringUp(book: BookStage) {
		return viewport.width > 640
			? book.approach({ top: 22, bottom: 22 })
			: book.approach({ top: 0, bottom: 0 }, true);
	}

	async function open() {
		const book = stage;
		const diary = reader;
		if (!book || !diary || book.isOpen) return;
		const first = firstPlace(diary);
		// Read as leaves, the book opens at the page that will be read, so that
		// it is that page which comes up to the reader. Read as a book, it opens
		// at its title and is leafed through to the page, which is half of why
		// anyone would read it that way.
		if (reading === 'leaves') diary.settle(first);
		sound.open();
		await book.open();
		if (reading === 'leaves') {
			await bringUp(book);
			lying = true;
			opened = true;
			reveal(2400);
			return;
		}
		// Open, and left alone a moment later: long enough to see what there is to reach for.
		lying = true;
		reveal(2800);
		if (first !== -1) void diary.goTo(first);
		opened = true;
	}

	// No book can be drawn here, so there is none to open: the diary is simply read.
	$effect(() => {
		if (!unavailable || !reader || untrack(() => opened)) return;
		reader.settle(untrack(() => firstPlace(reader!)));
		lying = true;
		opened = true;
	});

	async function written(entry: Entry) {
		if (!reader || !diary) return;
		const fresh = await fetchDiary(net, diary.id).catch(() => ({
			...diary!,
			entries: Math.max(diary!.entries, entry.index + 1),
			lastWrittenAt: entry.writtenAt
		}));
		diary = fresh;
		await reader.update(fresh, entry);
		// The seal was pressed over the page as it was written. What is left is to
		// see it in the book: the leaves go over to it, and the lamp comes up a little.
		await reader.goTo(entry.index);
		sealed = true;
		setTimeout(() => (sealed = false), 5200);
	}

	function onkeydown(event: KeyboardEvent) {
		if (!reader || composing || sharing || indexing) return;
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.target instanceof HTMLInputElement) return;
		const key = event.key === ' ' ? (event.shiftKey ? 'PageUp' : 'PageDown') : event.key;
		const along = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0;
		const screen = key === 'PageDown' ? 1 : key === 'PageUp' ? -1 : 0;
		const across = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
		if (along || screen || across) {
			if (!leafing) reader.step((along || screen || across) as 1 | -1);
			// Up and down move along a leaf, and on to the next at its end. Left and
			// right go from leaf to leaf, as they turn the pages of the book.
			else if (across) leaves?.turn(across);
			else leaves?.nudge((along || screen) as 1 | -1, along ? 'line' : 'screen', event.repeat);
		}
		// For whoever knows it is there: the calendar, without reaching for anything.
		else if (key === 'i' || key === 'I') indexing = lone === undefined;
		else if (key === 'Home') void reader.goTo(-1);
		else if (key === 'End') void reader.goTo(reader.diary.entries);
		else return;
		event.preventDefault();
	}
</script>

<svelte:head>
	<title>{diary ? `${diary.title} — ${BRAND}` : BRAND}</title>
	<!-- A diary is shown to whoever has its link, and to nobody who is only crawling. -->
	<meta name="robots" content="noindex" />
</svelte:head>

<svelte:window
	bind:innerWidth={viewport.width}
	bind:innerHeight={viewport.height}
	{onkeydown}
	{onpointermove}
/>

{#if trouble}
	<main class="trouble">
		<p class="eyebrow">{trouble === 'missing' ? 'Nothing here' : 'Not now'}</p>
		<h1>
			{trouble === 'missing' ? 'This link does not open a diary.' : 'The diary could not be read.'}
		</h1>
		<p>
			{#if !net.vellum}
				{BRAND} is not on {net.chain.name} yet.
			{:else if trouble === 'missing'}
				A diary opens only for the link its keeper gave out. Check that all of it was copied.
			{:else}
				{net.chain.name} did not answer. The diary is still there: try again in a moment.
			{/if}
		</p>
		<a class="button" href={homePath(net)}>Back to {BRAND}</a>
	</main>
{:else if diary && reader}
	<div class="reader" class:immersed class:still class:leafing>
		{#if leafing}
			<!--
				The leaves come in over the page the book has just brought up, where it
				stands; the book is taken away once they are there.
			-->
			<div class="pages" in:fade={{ duration: 380 }}>
				<Leaves
					bind:this={leaves}
					{reader}
					{net}
					{diary}
					owner={owner && lone === undefined}
					{lone}
					onwrite={() => (composing = true)}
					ontap={() => (immersed ? reveal(5000) : settle())}
				/>
			</div>
		{:else}
			<div class="scene" out:fade={{ delay: 380, duration: 80 }}>
				<BookCanvas
					binding={{ title: diary.title, cover: diary.cover, entries: diary.entries }}
					{reader}
					{insets}
					readingInsets={ALONE}
					open={opened}
					bind:stage
					bind:unavailable
				/>
			</div>

			<!-- The pages as words, for whoever is not reading them as pictures. -->
			<article class="sr-only" aria-live="polite">
				<h1>{diary.title}</h1>
				{#if reader.entry}
					<h2>
						{dateParts(reader.entry.writtenAt).weekday}, {dateParts(reader.entry.writtenAt).day}
					</h2>
					<p class="text">{reader.entry.text}</p>
				{:else if reader.atStart}
					<p>
						{lone === undefined ? 'A diary' : 'One page of a diary'} kept on {net.chain.name} by
						{#if penNameOf(diary)}{penNameOf(diary)} ({shortAddress(
								diary.owner
							)}){:else}{shortAddress(diary.owner)}{/if}
						since {dateParts(diary.createdAt).day}.
						{#if lone !== undefined}
							Entry {lone + 1}, shared on its own.
						{:else if diary.entries === 0}
							Not a word yet.
						{:else}
							{plural(diary.entries, 'entry', 'entries')}.
						{/if}
					</p>
				{:else if reader.atEnd}
					<p>
						{lone !== undefined
							? 'The rest was not shared.'
							: owner
								? 'The next page is blank.'
								: 'The rest is not written yet.'}
					</p>
				{/if}
			</article>
		{/if}

		<div
			class="bar"
			onfocusin={() => {
				held = true;
				reveal();
			}}
			onfocusout={() => {
				held = false;
				reveal(1500);
			}}
		>
			<div class="side">
				<button class="button glass small" onclick={() => (sharing = true)}>Share</button>
				{#if lone === undefined}
					<button
						class="button glass small square"
						onclick={() => (indexing = true)}
						aria-label="The diary by its dates"
						title="The diary by its dates (I)"
					>
						<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
							<path d="M5 6.5h14v13H5zM5 10.5h14M9 4v4M15 4v4" />
						</svg>
					</button>
				{/if}
				{#if opened && !unavailable}
					<button
						class="button glass small square"
						onclick={() => readAs(reading === 'leaves' ? 'book' : 'leaves')}
						aria-label={reading === 'leaves' ? 'Read it as a book' : 'Read it leaf by leaf'}
						title={reading === 'leaves' ? 'Read it as a book' : 'Read it leaf by leaf'}
					>
						<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
							{#if reading === 'leaves'}
								<path
									d="M12 6.5c-2-1.4-4.6-1.9-8-1.5v13c3.4-.4 6 .1 8 1.5m0-13c2-1.4 4.6-1.9 8-1.5v13c-3.4-.4-6 .1-8 1.5m0-13v13"
								/>
							{:else}
								<path d="M6 4.5h12v15H6zM9 9h6M9 12h6M9 15h4" />
							{/if}
						</svg>
					</button>
				{/if}
				{#if canFill}
					<button
						class="button glass small square fill"
						onclick={fill}
						aria-pressed={fullscreen}
						aria-label={fullscreen ? 'Leave full screen' : 'Fill the screen'}
						title={fullscreen ? 'Leave full screen' : 'Fill the screen'}
					>
						<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
							{#if fullscreen}
								<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
							{:else}
								<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
							{/if}
						</svg>
					</button>
				{/if}
			</div>
			<BookNav {reader} />
			<div class="side end">
				{#if owner && lone !== undefined}
					<!-- Its keeper has the whole of it, and is the only one shown the way there. -->
					<a class="button glass small" href={diaryPath(net, diarySlug(net, diary))}>
						The whole diary
					</a>
				{:else if owner}
					<button class="button primary" onclick={() => (composing = true)}>Write a page</button>
				{:else if sealed}
					<span></span>
				{/if}
			</div>
		</div>

		<!-- All that is left on the screen beside the book: a mark that there is more, for a finger to find. -->
		<button class="handle" onclick={() => reveal(5000)} aria-label="Show the controls" tabindex="-1"
		></button>

		{#if sealed}
			<!-- The lamp comes up over the page that was just sealed, and settles. -->
			<div class="flare" aria-hidden="true"></div>
			<p class="toast" role="status">
				<Seal size={22} />
				<span>
					Sealed on {net.chain.name}.
					{#if net.practice}
						Where a page is kept, it works just the same.
					{:else if net.keeping === 'for good'}
						It is there for good.
					{/if}
				</span>
			</p>
		{/if}
	</div>

	<SharePanel {net} {diary} entry={shared} whole={lone === undefined} bind:open={sharing} />
	{#if lone === undefined}
		<DateIndex {reader} bind:open={indexing} onpick={(entry) => void reader?.goTo(entry)} />
	{/if}
	{#if owner && lone === undefined}
		<Composer {diary} bind:open={composing} onwritten={written} />
	{/if}
{:else}
	<main class="trouble" aria-busy="true">
		<p class="waiting">Taking the diary down from the shelf…</p>
	</main>
{/if}

<style>
	.reader {
		position: relative;
		height: 100svh;
		overflow: hidden;
	}

	.scene,
	.pages {
		position: absolute;
		inset: 0;
	}

	.pages {
		z-index: 1;
	}

	/* The desk the leaves lie on, under the same lamp. */
	.pages {
		background:
			radial-gradient(70% 55% at 30% 0%, rgb(217 160 90 / 0.14), transparent 70%), var(--bg);
	}

	/* Paper is not darkened at its edges to be read by: that is for a book in a dark room. */
	.leafing::after {
		display: none;
	}

	/* The mark that there is more, on paper and not on the dark. */
	.leafing .handle::before {
		background: rgb(60 40 20 / 0.75);
	}

	/* What floats over a sheet is seen against paper: glass that paper shows through goes the colour of mud. */
	.leafing .bar :global(nav),
	.leafing .bar :global(.button.glass) {
		background: rgb(20 16 13 / 0.94);
	}

	/*
	 * Where the paper has the screen to itself, nothing floats over it. What
	 * there is to reach for is in a bar along the foot, of the same dark as the
	 * one the header makes along the top, and the two go away together.
	 */
	@media (max-width: 1100px) {
		.leafing .bar {
			padding-top: 10px;
			border-top-color: var(--border);
			background-color: var(--bg);
			pointer-events: auto;
		}

		.leafing.immersed .bar {
			transform: translateY(100%);
			pointer-events: none;
		}

		/* In a bar the pager needs no outline of its own. */
		.leafing .bar :global(nav) {
			padding: 0;
			border-color: transparent;
			background: none;
			backdrop-filter: none;
		}
	}

	/* The room goes dark around a book that is being read. */
	.reader::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
		background: radial-gradient(75% 75% at 50% 50%, transparent 55%, rgb(0 0 0 / 0.5));
		opacity: 0;
		pointer-events: none;
		transition: opacity 0.9s ease;
	}

	.immersed::after {
		opacity: 1;
	}

	/* A pointer at rest on the page is a thing lying on the page. */
	.immersed.still .scene :global(canvas) {
		cursor: none !important;
	}

	.bar {
		position: absolute;
		z-index: 3;
		left: 0;
		right: 0;
		bottom: 0;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 12px;
		padding: 0 var(--gutter) calc(22px + env(safe-area-inset-bottom));
		border-top: 1px solid transparent;
		/* The book is under the bar: only its controls take a press. */
		pointer-events: none;
		transition:
			opacity 0.5s ease,
			transform 0.5s ease,
			background-color 0.4s ease,
			border-color 0.4s ease;
	}

	.immersed .bar {
		opacity: 0;
		transform: translateY(14px);
	}

	.immersed .bar :global(nav),
	.immersed .bar :global(button) {
		pointer-events: none;
	}

	.handle {
		position: absolute;
		z-index: 3;
		left: 50%;
		bottom: env(safe-area-inset-bottom);
		width: 96px;
		height: 26px;
		padding: 0;
		border: 0;
		background: none;
		opacity: 0;
		pointer-events: none;
		transform: translateX(-50%);
		transition: opacity 0.6s ease 0.4s;
		cursor: pointer;
	}

	.handle::before {
		content: '';
		position: absolute;
		left: 50%;
		bottom: 9px;
		width: 38px;
		height: 4px;
		border-radius: 2px;
		background: rgb(255 240 215 / 0.9);
		transform: translateX(-50%);
	}

	.immersed .handle {
		opacity: 0.22;
		pointer-events: auto;
	}

	.side {
		gap: 8px;
	}

	.square path {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.bar :global(nav),
	.bar :global(button) {
		pointer-events: auto;
	}

	.side {
		display: flex;
	}

	.side.end {
		justify-content: flex-end;
	}

	/* On a phone the screen is as full as it gets, and the room is wanted. */
	@media (max-width: 520px) {
		.fill {
			display: none;
		}
	}

	.small {
		min-height: 44px;
		padding: 0 16px;
		font-size: 14px;
	}

	/* A button that is only a mark has no words to pad. */
	.square {
		width: 44px;
		padding: 0;
	}

	.flare {
		position: absolute;
		z-index: 1;
		inset: 0;
		background: radial-gradient(60% 55% at 50% 46%, rgb(255 206 120 / 0.34), transparent 70%);
		mix-blend-mode: screen;
		opacity: 0;
		pointer-events: none;
		animation: flare 2.6s ease-out 0.5s both;
	}

	@keyframes flare {
		22% {
			opacity: 1;
		}
		100% {
			opacity: 0;
		}
	}

	.toast {
		position: absolute;
		z-index: 4;
		top: calc(var(--header) + 12px);
		left: 50%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 18px 8px 10px;
		border: 1px solid rgb(217 180 90 / 0.5);
		border-radius: 999px;
		background: rgb(20 16 13 / 0.86);
		backdrop-filter: blur(14px);
		color: var(--gold-strong);
		font-size: 14px;
		font-weight: 600;
		white-space: nowrap;
		transform: translateX(-50%);
		animation: drop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2);
	}

	.trouble {
		display: grid;
		justify-items: start;
		align-content: center;
		gap: 16px;
		width: min(640px, 100%);
		min-height: 100svh;
		margin: 0 auto;
		padding: var(--header) var(--gutter) 40px;
		color: var(--fg-muted);
	}

	.trouble h1 {
		font-size: clamp(36px, 6vw, 60px);
		font-weight: 500;
		color: var(--fg);
	}

	.waiting {
		justify-self: center;
		font-family: var(--serif);
		font-style: italic;
		font-size: 24px;
		animation: breathe 1.6s ease-in-out infinite;
	}

	@keyframes drop {
		from {
			opacity: 0;
			transform: translate(-50%, -14px);
		}
	}

	@keyframes breathe {
		50% {
			opacity: 0.45;
		}
	}

	@media (max-width: 860px) {
		.bar {
			grid-template-columns: 1fr 1fr;
			gap: 10px;
			padding-bottom: calc(14px + env(safe-area-inset-bottom));
		}

		.bar :global(nav) {
			grid-column: 1 / -1;
			grid-row: 2;
		}

		.side :global(.button) {
			min-height: 44px;
			padding: 0 16px;
			font-size: 14px;
		}

		/* A button that is only a mark has no words to pad. */
		.side :global(.button.square) {
			padding: 0;
		}

		/* A screen too narrow for it on one line has it on two. */
		.toast {
			width: max-content;
			max-width: calc(100vw - 24px);
			border-radius: 22px;
			line-height: 1.35;
			white-space: normal;
		}
	}
</style>
