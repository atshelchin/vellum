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
	import { dateParts, plural, shortAddress } from '#lib/format.ts';
	import { homePath } from '#lib/paths.ts';
	import { copyText, slugId, slugOpens } from '#lib/share.ts';
	import { sound } from '#lib/sound.svelte.ts';
	import { fetchDiary, fetchEntries, type Diary, type Entry } from '#lib/vellum.ts';
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
	let copied = $state(false);
	let sealed = $state(false);
	let viewport = $state({ width: 1280, height: 800 });

	let owner = $derived(
		diary !== undefined && wallet.account !== null && isAddressEqual(diary.owner, wallet.account)
	);
	let insets = $derived({ top: 64, bottom: viewport.width > 860 ? 104 : 156 });

	// The diary this page is for is the one its address names. Should the address
	// come to name another while the page is open, that one is taken down instead.
	$effect(() => {
		const on = net;
		const slug = params.slug;
		let gone = false;
		diary = undefined;
		reader = undefined;
		trouble = null;

		const id = slugId(slug);
		if (id === null || !on.vellum) {
			trouble = 'missing';
			return;
		}
		fetchDiary(on, id).then(
			(found) => {
				if (gone) return;
				// A number alone opens nothing: the link has to be the one the diary's keeper gave out.
				if (!slugOpens(on, slug, found)) {
					trouble = 'missing';
					return;
				}
				diary = found;
				reader = new Reader({
					diary: found,
					owner: untrack(() => owner),
					where: on.chain.name,
					fetch: async (offset, limit) => (await fetchEntries(on, id, offset, limit)).entries,
					onInvite: () => (composing = true),
					onCover: () => void open()
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
		if (reader) reader.owner = owner;
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
		// A link can point at one entry. Otherwise its keeper is taken to where
		// they left off, and a visitor starts at the beginning.
		const asked = Number(page.url.searchParams.get('entry'));
		const count = reading.diary.entries;
		if (Number.isInteger(asked) && asked >= 1 && asked <= count) void reading.goTo(asked - 1);
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
		await reader.goTo(entry.index);
		setTimeout(() => sound.seal(), 900);
		sealed = true;
		setTimeout(() => (sealed = false), 5000);
	}

	async function share() {
		const place = reader?.place.entry ?? -1;
		const link = new URL(page.url.pathname, page.url.origin);
		if (diary && place >= 0 && place < diary.entries)
			link.searchParams.set('entry', String(place + 1));
		await copyText(link.href);
		copied = true;
		setTimeout(() => (copied = false), 2200);
	}

	function onkeydown(event: KeyboardEvent) {
		if (!reader || composing || event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.target instanceof HTMLInputElement) return;
		if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') reader.step(1);
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

<svelte:window bind:innerWidth={viewport.width} bind:innerHeight={viewport.height} {onkeydown} />

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
	<div class="reader">
		<div class="scene">
			<BookCanvas
				binding={{ title: diary.title, cover: diary.cover, entries: diary.entries }}
				{reader}
				{insets}
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
					A diary kept on {net.chain.name} by {shortAddress(diary.owner)} since {dateParts(
						diary.createdAt
					).day}. {diary.entries === 0
						? 'Not a word yet.'
						: plural(diary.entries, 'entry', 'entries') + '.'}
				</p>
			{:else if reader.atEnd}
				<p>{owner ? 'The next page is blank.' : 'The rest is not written yet.'}</p>
			{/if}
		</article>

		<div class="bar">
			<div class="side">
				<button class="button glass small" onclick={share}>
					{copied ? 'Link copied' : 'Copy link'}
				</button>
			</div>
			<BookNav {reader} />
			<div class="side end">
				{#if owner}
					<button class="button primary" onclick={() => (composing = true)}>Write a page</button>
				{:else if sealed}
					<span></span>
				{/if}
			</div>
		</div>

		{#if sealed}
			<p class="toast" role="status">
				Sealed on {net.chain.name}. {net.practice
					? 'On Ethereum it works just the same.'
					: 'It is there for good.'}
			</p>
		{/if}
	</div>

	{#if owner}
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

	.toast {
		position: absolute;
		z-index: 4;
		top: calc(var(--header) + 12px);
		left: 50%;
		padding: 10px 18px;
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
		font-family: var(--hand);
		font-size: 26px;
		line-height: 1.4;
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
	}
</style>
