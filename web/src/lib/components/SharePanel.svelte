<script lang="ts">
	import { page } from '$app/state';
	import type { Net } from '#lib/chain.ts';
	import { dateParts } from '#lib/format.ts';
	import { diaryPath } from '#lib/paths.ts';
	import { copyText, diarySlug, pageSlug } from '#lib/share.ts';
	import type { Diary } from '#lib/vellum.ts';

	let {
		net,
		diary,
		entry,
		whole = true,
		open = $bindable(false)
	}: {
		net: Net;
		diary: Diary;
		/** The entry being read, if one is: its place in the diary, counted from zero, and when it was written, once that is known. */
		entry?: { index: number; writtenAt?: number };
		/** Whether the whole diary is this reader's to pass on. It is not, for someone who was handed one page. */
		whole?: boolean;
		open?: boolean;
	} = $props();

	let dialog: HTMLDialogElement;
	let chosen = $state<'page' | 'diary'>('diary');
	// Whoever was handed one page has one page to hand on, whatever else is asked for.
	let what = $derived(!whole ? 'page' : entry ? chosen : 'diary');
	let copied = $state(false);
	/** The picture has arrived. Until then its place is kept for it. */
	let drawn = $state(false);
	/** A phone has a sheet of its own for handing a link to another app. */
	let handing = $state(false);
	let forgetting: ReturnType<typeof setTimeout> | undefined;

	let path = $derived(
		entry && what === 'page'
			? diaryPath(net, pageSlug(net, diary, entry.index))
			: whole
				? diaryPath(net, diarySlug(net, diary))
				: // One page, and which is not known yet: the link they came by is the link to it.
					page.url.pathname
	);
	let link = $derived(new URL(path, page.url.origin).href);
	// The same address the link gives for its picture, so what is seen here is what will be seen there.
	let image = $derived(
		what === 'page' ? `${path}/card.png` : `${path}/card.png?pages=${diary.entries}`
	);
	let day = $derived(entry?.writtenAt === undefined ? '' : dateParts(entry.writtenAt).day);

	$effect(() => {
		if (open && !dialog.open) {
			// What is offered first is the least that could be meant: the page being read.
			chosen = entry ? 'page' : 'diary';
			copied = false;
			handing =
				typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;
			dialog.showModal();
			// Not the way out, which is what a dialog would pick: the one thing most come here to press.
			dialog.querySelector<HTMLElement>('.actions .primary')?.focus({ preventScroll: true });
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	$effect(() => {
		void image;
		drawn = false;
	});

	async function copy() {
		await copyText(link);
		copied = true;
		clearTimeout(forgetting);
		forgetting = setTimeout(() => (copied = false), 2200);
	}

	async function hand() {
		try {
			await navigator.share({
				title: what === 'page' && day ? `${day} — ${diary.title}` : diary.title,
				url: link
			});
		} catch {
			// Put away without choosing anyone. The link is still here to be copied.
		}
	}
</script>

<!--
	What is handed over is a link, and the picture is what the link looks like
	where it lands: the same one X, Telegram and Discord will draw. One page can
	be given without giving the book.
-->
<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	onclick={(event) => event.target === dialog && dialog.close()}
	aria-labelledby="share-title"
>
	<div class="sheet">
		<div class="top">
			<h2 id="share-title">Share</h2>
			<button type="button" class="round" onclick={() => dialog.close()} aria-label="Close">
				<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
		</div>

		{#if entry && whole}
			<div class="which" role="group" aria-label="What to share">
				<button type="button" aria-pressed={what === 'page'} onclick={() => (chosen = 'page')}>
					This page
				</button>
				<button type="button" aria-pressed={what === 'diary'} onclick={() => (chosen = 'diary')}>
					The whole diary
				</button>
			</div>
		{/if}

		<figure class:drawn>
			{#key image}
				<img
					src={image}
					width="1200"
					height="630"
					alt={what === 'page'
						? `The card for ${day ? `the page written on ${day}` : 'this page'}`
						: `The card for the diary “${diary.title}”`}
					onload={() => (drawn = true)}
				/>
			{/key}
		</figure>

		<p class="says" aria-live="polite">
			{#if what === 'page'}
				Opens {day ? `the page of ${day}` : 'this page'}, and nothing else. The rest of the diary
				stays shut.
			{:else}
				Opens the whole diary: every page in it, and every page written later.
			{/if}
		</p>

		<div class="actions">
			<button type="button" class="button primary" onclick={copy}>
				{copied ? 'Link copied' : 'Copy link'}
			</button>
			{#if handing}
				<button type="button" class="button" onclick={hand}>Send to…</button>
			{/if}
		</div>
	</div>
</dialog>

<style>
	dialog {
		width: min(520px, calc(100vw - 24px));
		max-height: calc(100dvh - 32px);
		padding: 0;
		border: 0;
		border-radius: 20px;
		background: none;
		color: var(--fg);
		overflow: visible;
	}

	dialog::backdrop {
		background: rgb(8 6 4 / 0.72);
		backdrop-filter: blur(10px);
	}

	.sheet {
		display: grid;
		gap: 14px;
		max-height: inherit;
		padding: 16px 18px 18px;
		border: 1px solid var(--border-strong);
		border-radius: inherit;
		background: var(--bg-raised);
		box-shadow: 0 40px 90px rgb(0 0 0 / 0.7);
		overflow-y: auto;
		animation: settle 0.28s cubic-bezier(0.2, 0.9, 0.3, 1);
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	h2 {
		font-size: 26px;
		font-weight: 500;
	}

	.round {
		display: grid;
		place-items: center;
		width: 36px;
		height: 36px;
		margin-right: -6px;
		border: 0;
		border-radius: 50%;
		background: none;
		color: var(--fg-muted);
		cursor: pointer;
		transition: background 0.15s;
	}

	.round:hover {
		background: rgb(255 240 215 / 0.1);
	}

	.round path {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
	}

	/* Two things that can be handed over, and which of them it is to be. */
	.which {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		padding: 4px;
		border-radius: 999px;
		background: var(--bg-sunken);
	}

	.which button {
		min-height: 40px;
		border: 0;
		border-radius: 999px;
		background: none;
		color: var(--fg-muted);
		font-size: 14px;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.18s,
			color 0.18s;
	}

	.which button[aria-pressed='true'] {
		background: rgb(255 240 215 / 0.12);
		color: var(--fg);
	}

	figure {
		position: relative;
		margin: 0;
		border-radius: 12px;
		aspect-ratio: 1200 / 630;
		background: var(--bg-sunken);
		box-shadow: 0 0 0 1px var(--border);
		overflow: hidden;
	}

	/* The card is drawn when it is asked for, which takes a moment. */
	figure:not(.drawn)::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			100deg,
			transparent 30%,
			rgb(255 240 215 / 0.06) 50%,
			transparent 70%
		);
		background-size: 220% 100%;
		animation: sweep 1.3s linear infinite;
	}

	img {
		display: block;
		width: 100%;
		height: 100%;
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	.drawn img {
		opacity: 1;
	}

	.says {
		min-height: 2.9em;
		color: var(--fg-muted);
		font-size: 14px;
		line-height: 1.45;
	}

	.actions {
		display: flex;
		gap: 10px;
	}

	.actions .button {
		flex: 1;
	}

	@keyframes settle {
		from {
			opacity: 0;
			transform: translateY(10px) scale(0.985);
		}
	}

	@keyframes sweep {
		from {
			background-position: 120% 0;
		}
		to {
			background-position: -100% 0;
		}
	}

	/* On a phone it comes up from the foot of the screen, under the thumb. */
	@media (max-width: 640px) {
		dialog {
			top: 0;
			left: 0;
			width: 100%;
			max-width: none;
			height: 100dvh;
			max-height: none;
			margin: 0;
			border-radius: 0;
		}

		dialog[open] {
			display: flex;
			flex-direction: column;
			justify-content: flex-end;
		}

		.sheet {
			max-height: 100%;
			padding: 12px 16px calc(16px + env(safe-area-inset-bottom));
			border-width: 1px 0 0;
			border-radius: 22px 22px 0 0;
			animation: rise 0.3s cubic-bezier(0.2, 0.9, 0.3, 1);
		}
	}

	@keyframes rise {
		from {
			transform: translateY(100%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet,
		figure::after {
			animation: none !important;
		}
	}
</style>
