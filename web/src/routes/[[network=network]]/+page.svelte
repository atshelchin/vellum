<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Reader } from '#lib/book/reader.svelte.ts';
	import type { BookStage } from '#lib/book/Stage.ts';
	import { BRAND } from '#lib/brand.ts';
	import { netOf, otherNet } from '#lib/chain.ts';
	import BookCanvas from '#lib/components/BookCanvas.svelte';
	import BookNav from '#lib/components/BookNav.svelte';
	import Elsewhere from '#lib/components/Elsewhere.svelte';
	import ExternalLink from '#lib/components/ExternalLink.svelte';
	import Shelf from '#lib/components/Shelf.svelte';
	import Source from '#lib/components/Source.svelte';
	import { demoDiary } from '#lib/demo.ts';
	import { coin } from '#lib/format.ts';
	import { homePath } from '#lib/paths.ts';
	import { sound } from '#lib/sound.svelte.ts';
	import { FEE } from '#lib/vellum.ts';
	import { wallet } from '#lib/wallet.svelte.ts';

	let net = $derived(netOf(page.params.network));
	let other = $derived(otherNet(net));

	let reader = $state<Reader>();
	let stage = $state<BookStage>();
	let unavailable = $state(false);
	/** The book on the front page has been opened, and has the whole screen. */
	let reading = $state(false);
	let viewport = $state({ width: 1280, height: 800 });
	/** How tall the words are, which on a narrow screen is how much of it the book cannot have. */
	let copyHeight = $state(0);

	// On a wide screen the shut book stands to the right of the words. On a
	// narrow one it stands above them, in what room they leave it.
	let wide = $derived(viewport.width > 860);
	let insets = $derived(
		reading
			? { top: 64, bottom: wide ? 104 : 156 }
			: wide
				? { top: 72, bottom: 24 }
				: { top: 64, bottom: Math.min(copyHeight + 44, Math.round(viewport.height * 0.68)) }
	);

	onMount(() => {
		const { diary, entries } = demoDiary(Math.floor(Date.now() / 1000));
		reader = new Reader({
			diary,
			owner: false,
			// The diary on the front page is about the real thing, whichever site shows it.
			where: 'Ethereum',
			fetch: async (offset, limit) => entries.slice(offset, offset + limit),
			onCover: open
		});
	});

	async function open() {
		if (reading || !stage) return;
		reading = true;
		sound.open();
		await stage.open();
	}

	async function close() {
		if (!stage || !reader) return;
		await reader.goTo(-1);
		await stage.close();
		reading = false;
	}

	function onkeydown(event: KeyboardEvent) {
		if (!reading || !reader) return;
		if (event.key === 'ArrowRight' || event.key === 'PageDown') reader.step(1);
		else if (event.key === 'ArrowLeft' || event.key === 'PageUp') reader.step(-1);
		else if (event.key === 'Escape') void close();
		else return;
		event.preventDefault();
	}
</script>

<svelte:head>
	<title>{BRAND} — {net.practice ? 'the practice book' : 'a diary kept on Ethereum'}</title>
</svelte:head>

<svelte:window bind:innerWidth={viewport.width} bind:innerHeight={viewport.height} {onkeydown} />

{#if wallet.account}
	<Shelf />
{:else}
	<div class="page" class:reading>
		<div class="scene">
			{#if reader}
				<BookCanvas
					binding={{
						title: reader.diary.title,
						cover: reader.diary.cover,
						entries: reader.diary.entries
					}}
					{reader}
					{insets}
					shift={0.44}
					bind:stage
					bind:unavailable
				/>
			{/if}
		</div>

		<section class="hero" inert={reading}>
			<div class="copy" bind:clientHeight={copyHeight}>
				{#if net.practice}
					<p class="eyebrow">Practice book · {net.chain.name}</p>
					<h1>A diary that outlives its writer.</h1>
					<p class="lede">
						On Ethereum, that is what it is. Here you try it first: write a page, seal it on
						{net.chain.name} with free test USDC, and see how it works.
					</p>
				{:else}
					<p class="eyebrow">On {net.chain.name} · for Vela Wallet</p>
					<h1>A diary that outlives its writer.</h1>
					<p class="lede">
						Write a page and seal it on Ethereum. Nobody can change it afterwards, not even you.
						Turn back to it in fifty years.
					</p>
				{/if}
				<div class="actions">
					{#if net.vellum}
						<button class="button primary" onclick={() => (wallet.pickerOpen = true)}>
							Connect Vela Wallet
						</button>
					{:else if other.vellum}
						<!-- Not here yet, but there: the one thing worth pressing is the way across. -->
						<a class="button primary" href={homePath(other)}>
							Try it on {other.chain.name}
						</a>
					{/if}
					{#if !unavailable}
						<button class="button" onclick={open} disabled={!stage}>Leaf through one</button>
					{/if}
				</div>
				{#if !net.vellum}
					<p class="notice">
						{BRAND} is not on {net.chain.name} yet. It opens here soon{other.vellum
							? ', and the practice book is open now.'
							: '.'}
					</p>
				{/if}
				<ul class="facts">
					<li>
						<b>{coin(FEE)} {net.coin}</b> a page{#if net.faucet},
							<ExternalLink href={net.faucet}>free from the faucet</ExternalLink>{/if}
					</li>
					<li><b>As many</b> diaries and pages as you like</li>
					<li><b>Public</b>{net.practice ? ', like the real thing' : ', and permanent'}</li>
				</ul>
				<Elsewhere />
				<Source />
			</div>
		</section>

		{#if reading && reader}
			<div class="bar">
				<BookNav {reader} />
				<div class="ends">
					<button class="button glass" onclick={close}>Close the book</button>
					<button class="button primary" onclick={() => (wallet.pickerOpen = true)}>
						Keep your own
					</button>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.page {
		position: relative;
		min-height: 100svh;
		overflow: hidden;
	}

	.scene {
		position: fixed;
		inset: 0;
	}

	.hero {
		position: relative;
		z-index: 2;
		display: grid;
		align-content: center;
		width: min(560px, 46vw);
		min-height: 100svh;
		padding: calc(var(--header) + 24px) 0 48px var(--gutter);
		margin-left: clamp(0px, 4vw, 72px);
		/* The book is behind the words on a narrow screen: a press that misses them reaches it. */
		pointer-events: none;
		transition:
			opacity 0.5s ease,
			transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	.copy {
		display: grid;
		gap: 22px;
	}

	.copy > :global(*) {
		pointer-events: auto;
	}

	.reading .hero {
		opacity: 0;
		transform: translateX(-40px);
	}

	.reading .copy > :global(*) {
		pointer-events: none;
	}

	h1 {
		font-size: clamp(44px, 6.4vw, 92px);
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 0.98;
		text-wrap: balance;
	}

	.lede {
		max-width: 30em;
		font-size: clamp(17px, 1.5vw, 20px);
		color: var(--fg-muted);
		text-wrap: pretty;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 6px;
	}

	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 10px 26px;
		margin-top: 10px;
		padding-top: 22px;
		border-top: 1px solid var(--border);
		font-size: 14px;
		color: var(--fg-muted);
	}

	.facts b {
		color: var(--fg);
		font-weight: 600;
	}

	.facts :global(a) {
		color: var(--gold);
	}

	.bar {
		position: fixed;
		z-index: 3;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 var(--gutter) calc(20px + env(safe-area-inset-bottom));
		pointer-events: none;
		animation: arrive 0.6s 0.9s both;
	}

	.bar > :global(*) {
		pointer-events: auto;
	}

	.ends {
		display: flex;
		gap: 10px;
	}

	@keyframes arrive {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
	}

	@media (max-width: 860px) {
		.hero {
			align-content: end;
			width: auto;
			margin: 0;
			padding: 0 var(--gutter) calc(24px + env(safe-area-inset-bottom));
		}

		.copy {
			gap: 12px;
		}

		h1 {
			font-size: clamp(34px, 9.6vw, 56px);
		}

		.lede {
			font-size: 15px;
		}

		.actions {
			flex-wrap: nowrap;
			gap: 10px;
			margin-top: 2px;
		}

		.actions .button {
			flex: 1;
			min-height: 46px;
			padding: 0 10px;
			font-size: 14px;
		}

		.facts {
			gap: 4px 16px;
			margin-top: 4px;
			padding-top: 12px;
			font-size: 13px;
		}

		.bar {
			flex-direction: column-reverse;
			align-items: stretch;
			gap: 10px;
		}

		.ends {
			justify-content: center;
		}

		.ends .button {
			flex: 1;
			min-height: 44px;
			padding: 0 12px;
			font-size: 14px;
		}
	}
</style>
