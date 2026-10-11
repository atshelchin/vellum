<script lang="ts">
	import { page } from '$app/state';
	import { BRAND, VELA } from '#lib/brand.ts';
	import { netOf, otherNet, type Net } from '#lib/chain.ts';
	import { diaryPath, homePath, newDiaryPath } from '#lib/paths.ts';
	import { ago, plural } from '#lib/format.ts';
	import { diarySlug } from '#lib/share.ts';
	import { describeError, fetchDiariesOf, type Diary } from '#lib/vellum.ts';
	import { wallet } from '#lib/wallet.svelte.ts';
	import CoverThumb from './CoverThumb.svelte';
	import Elsewhere from './Elsewhere.svelte';
	import ExternalLink from './ExternalLink.svelte';

	const PAGE = 12;

	let net = $derived(netOf(page.params.network));
	let other = $derived(otherNet(net));

	let diaries = $state<Diary[]>([]);
	let total = $state<number | null>(null);
	let loading = $state(false);
	let failure = $state<string | null>(null);
	let now = Math.floor(Date.now() / 1000);

	// The shelf is the connected account's own, and only ever that: there is no
	// page on this site that lists anybody else's diaries.
	$effect(() => {
		const owner = wallet.account;
		const on = net;
		diaries = [];
		total = null;
		failure = null;
		if (owner && on.vellum) void more(on, owner, 0);
	});

	async function more(on: Net, owner: `0x${string}`, offset: number) {
		loading = true;
		// A shelf is one account's, on one network. An answer that arrives after
		// either has changed belongs to a shelf nobody is looking at.
		const current = () => wallet.account === owner && net === on;
		try {
			const read = await fetchDiariesOf(on, owner, offset, PAGE);
			if (!current()) return;
			diaries = offset === 0 ? read.diaries : [...diaries, ...read.diaries];
			total = read.total;
			failure = null;
		} catch (error) {
			if (current()) failure = describeError(on, error);
		} finally {
			loading = false;
		}
	}
</script>

<main>
	<div class="top">
		<div>
			<p class="eyebrow">Your shelf</p>
			<h1>Your diaries</h1>
		</div>
		{#if wallet.canWrite && net.vellum}
			<a class="button primary" href={newDiaryPath(net)}>Open a new diary</a>
		{/if}
	</div>

	{#if !net.vellum}
		<p class="notice">
			{BRAND} is not on {net.chain.name} yet.
			{#if other.vellum}<a href={homePath(other)}>Your shelf on {other.chain.name} →</a>{/if}
		</p>
	{:else if wallet.standing === 'not-vela'}
		<p class="notice">
			<strong>This is not a Vela account</strong>, so it cannot keep a diary. {BRAND} only supports
			<ExternalLink href={VELA}>Vela Wallet</ExternalLink>. You can still read any diary you have
			the link to.
		</p>
	{/if}

	{#if failure}
		<p class="error" role="alert">{failure}</p>
	{:else if total === null && net.vellum}
		<ul class="grid" aria-busy="true">
			{#each [0, 1, 2] as placeholder (placeholder)}
				<li class="ghost"></li>
			{/each}
		</ul>
	{:else if total === 0}
		<div class="empty">
			<p class="quiet">Nothing on the shelf yet.</p>
			{#if wallet.canWrite}
				<p>
					A diary is free to open. Choose its leather, stamp a title on it, and write the first page
					whenever you are ready.
				</p>
				<a class="button primary" href={newDiaryPath(net)}>Open your first diary</a>
			{/if}
		</div>
	{:else if total !== null}
		<ul class="grid">
			{#each diaries as diary (diary.id)}
				<li>
					<a href={diaryPath(net, diarySlug(net, diary))}>
						<CoverThumb title={diary.title} cover={diary.cover} />
						<span class="title">{diary.title}</span>
						<span class="meta">
							{diary.entries === 0 ? 'Not a word yet' : plural(diary.entries, 'entry', 'entries')}
							{#if diary.lastWrittenAt}· {ago(diary.lastWrittenAt, now)}{/if}
						</span>
					</a>
				</li>
			{/each}
		</ul>
		{#if diaries.length < total}
			<button
				class="button more"
				disabled={loading}
				onclick={() => wallet.account && more(net, wallet.account, diaries.length)}
			>
				{loading ? 'Reading…' : `Show more (${total - diaries.length} left)`}
			</button>
		{/if}
	{/if}

	<Elsewhere />
</main>

<style>
	main {
		display: grid;
		gap: 28px;
		width: min(1120px, 100%);
		margin: 0 auto;
		padding: calc(var(--header) + 36px) var(--gutter) 80px;
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: end;
		justify-content: space-between;
		gap: 16px;
	}

	h1 {
		margin-top: 6px;
		font-size: clamp(40px, 6vw, 68px);
		font-weight: 500;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
		gap: 44px 34px;
		padding-top: 8px;
	}

	li a {
		display: grid;
		gap: 4px;
		text-decoration: none;
	}

	li a:hover :global(.book),
	li a:focus-visible :global(.book) {
		transform: perspective(900px) rotateY(-16deg) translateY(-4px);
	}

	.title {
		margin-top: 14px;
		font-family: var(--serif);
		font-size: 22px;
		font-weight: 600;
		line-height: 1.15;
		overflow-wrap: anywhere;
	}

	.meta {
		font-size: 13px;
		color: var(--fg-muted);
	}

	.ghost {
		aspect-ratio: 352 / 500;
		border-radius: 3px 9px 9px 3px;
		background: linear-gradient(110deg, var(--bg-raised) 30%, #2a211a 50%, var(--bg-raised) 70%);
		background-size: 200% 100%;
		animation: sheen 1.4s linear infinite;
	}

	.empty {
		display: grid;
		justify-items: start;
		gap: 14px;
		max-width: 34em;
		padding: 28px;
		border: 1px dashed var(--border-strong);
		border-radius: 18px;
		color: var(--fg-muted);
	}

	.quiet {
		font-family: var(--serif);
		font-style: italic;
		font-size: 26px;
		color: var(--fg);
	}

	.more {
		justify-self: center;
	}

	@keyframes sheen {
		to {
			background-position: -200% 0;
		}
	}

	@media (max-width: 520px) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 32px 22px;
		}

		.title {
			font-size: 19px;
		}
	}
</style>
