<script lang="ts">
	import { untrack } from 'svelte';
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

	async function open() {
		const book = stage;
		const reading = reader;
		if (!book || !reading || book.isOpen) return;
		sound.open();
		await book.open();
		// Open, and left alone a moment later: long enough to see what there is to reach for.
		lying = true;
		reveal(2800);
		// A link to one page opens at that page. A link to a diary can ask for
		// an entry to open at. Otherwise its keeper is taken to where they left
		// off, and a visitor starts at the beginning.
		const asked = Number(page.url.searchParams.get('entry'));
		const count = reading.diary.entries;
		if (reading.lone !== undefined) void reading.goTo(0);
		else if (Number.isInteger(asked) && asked >= 1 && asked <= count) void reading.goTo(asked - 1);
		else if (untrack(() => owner) && count > 0 && !page.state.fresh) void reading.goTo(count - 1);
	}

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
		if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') reader.step(1);
		// For whoever knows it is there: the calendar, without reaching for anything.
		else if (event.key === 'i' || event.key === 'I') indexing = lone === undefined;
		else if (event.key === 'ArrowLeft' || event.key === 'PageUp') reader.step(-1);
		else if (event.key === 'Home') void reader.goTo(-1);
		else if (event.key === 'End') void reader.goTo(reader.diary.entries);
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
	<div class="reader" class:immersed class:still>
		<div class="scene">
			<BookCanvas
				binding={{ title: diary.title, cover: diary.cover, entries: diary.entries }}
				{reader}
				{insets}
				readingInsets={ALONE}
				bind:stage
				bind:unavailable
			/>
		</div>

		<!-- The pages as words, for whoever is not reading them as pictures. -->
		<article class:sr-only={!unavailable} class:plain={unavailable} aria-live="polite">
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
				{#if canFill}
					<button
						class="button glass small square"
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

	.scene {
		position: absolute;
		inset: 0;
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
		/* The book is under the bar: only its controls take a press. */
		pointer-events: none;
		transition:
			opacity 0.5s ease,
			transform 0.5s ease;
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

	.square {
		width: 44px;
		padding: 0;
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

	.small {
		min-height: 44px;
		padding: 0 16px;
		font-size: 14px;
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

	/* No book could be drawn: the same words, set as a page. */
	.plain {
		position: absolute;
		z-index: 2;
		inset: calc(var(--header) + 12px) var(--gutter) 150px;
		width: min(680px, calc(100% - var(--gutter) * 2));
		margin: 0 auto;
		padding: 32px;
		border-radius: 8px;
		background: var(--paper);
		color: var(--ink);
		overflow-y: auto;
	}

	.plain h1 {
		font-size: 34px;
	}

	.plain h2 {
		margin: 18px 0 10px;
		font-size: 22px;
		color: #6f4428;
	}

	.plain .text {
		font-family: var(--text);
		font-size: 19px;
		line-height: 1.75;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
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
