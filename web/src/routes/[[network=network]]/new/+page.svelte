<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { COVERS } from '#lib/book/covers.ts';
	import { BRAND, VELA } from '#lib/brand.ts';
	import { netOf } from '#lib/chain.ts';
	import BookCanvas from '#lib/components/BookCanvas.svelte';
	import ExternalLink from '#lib/components/ExternalLink.svelte';
	import { coin } from '#lib/format.ts';
	import { diaryPath } from '#lib/paths.ts';
	import { diarySlug } from '#lib/share.ts';
	import { sound } from '#lib/sound.svelte.ts';
	import { byteLength, createDiary, describeError, FEE, MAX_TITLE_BYTES } from '#lib/vellum.ts';
	import { wallet } from '#lib/wallet.svelte.ts';

	let net = $derived(netOf(page.params.network));

	let title = $state('');
	let cover = $state(0);
	let busy = $state(false);
	/** The wallet has sent it; what is left is to read it back from the chain. */
	let sent = $state(false);
	/** The diary is on the chain; the page is about to open it. */
	let opened = $state(false);
	let failure = $state<string | null>(null);
	let viewport = $state({ width: 1280, height: 800 });

	let wide = $derived(viewport.width > 860);
	let insets = $derived(
		wide ? { top: 72, bottom: 24 } : { top: 64, bottom: Math.round(viewport.height * 0.6) }
	);

	// The boards are painted again each time the title changes, which is too
	// much to do on every key. The book follows a moment behind the typing.
	let shown = $state({ title: 'My Diary', cover: 0, entries: 0 });
	$effect(() => {
		const next = { title: title.trim() || 'My Diary', cover, entries: 0 };
		const timer = setTimeout(() => (shown = next), next.cover === shown.cover ? 220 : 0);
		return () => clearTimeout(timer);
	});

	let bytes = $derived(byteLength(title.trim()));
	let problem = $derived.by(() => {
		if (bytes === 0) return 'Give it a title.';
		if (bytes > MAX_TITLE_BYTES) return 'That title is too long to stamp on a cover.';
		return null;
	});

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || problem) return;
		busy = true;
		sent = false;
		failure = null;
		try {
			const diary = await createDiary(
				net,
				{ title: title.trim(), cover },
				{ onSent: () => (sent = true) }
			);
			// A beat to see that it worked, before the page changes under it.
			opened = true;
			sound.seal();
			void wallet.refresh();
			await new Promise((done) => setTimeout(done, 900));
			await goto(diaryPath(net, diarySlug(net, diary)), { state: { fresh: true } });
		} catch (error) {
			failure = describeError(net, error);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Open a diary — {BRAND}</title>
</svelte:head>

<svelte:window bind:innerWidth={viewport.width} bind:innerHeight={viewport.height} />

<div class="page">
	<div class="scene">
		<BookCanvas binding={shown} {insets} shift={-0.36} />
	</div>

	<form class="panel" onsubmit={submit}>
		<div class="title">
			<p class="eyebrow">New diary</p>
			<h1>Open a diary</h1>
			<p class="quiet">
				Opening one is free: you pay only the gas. Each page you write in it afterwards costs
				{coin(FEE)}
				{net.coin}.
			</p>
		</div>

		<label>
			<span>Title <small>stamped on the cover, for good</small></span>
			<div class="field">
				<input
					bind:value={title}
					placeholder="My Diary"
					autocomplete="off"
					maxlength="64"
					disabled={busy}
				/>
			</div>
		</label>

		<fieldset disabled={busy}>
			<legend>Binding</legend>
			<div class="swatches">
				{#each COVERS as style, index (style.name)}
					<label class="swatch" class:on={cover === index} title={style.name}>
						<input type="radio" bind:group={cover} value={index} />
						<i style:background={style.leather} style:--foil={style.foil[1]}></i>
						<b>{style.name}</b>
					</label>
				{/each}
			</div>
		</fieldset>

		{#if !net.vellum}
			<p class="notice">{BRAND} is not on {net.chain.name} yet.</p>
		{:else if !wallet.account}
			<button
				type="button"
				class="button primary wide big"
				onclick={() => (wallet.pickerOpen = true)}
			>
				Connect Vela Wallet
			</button>
		{:else if wallet.standing === 'not-vela'}
			<p class="notice">
				This is not a Vela account, so it cannot keep a diary. {BRAND} only supports
				<ExternalLink href={VELA}>Vela Wallet</ExternalLink>.
			</p>
		{:else}
			<button
				class="button primary wide big"
				disabled={busy || problem !== null || wallet.standing === 'checking'}
			>
				{#if opened}
					Opened. Taking it down from the shelf…
				{:else if sent}
					Confirmed in your wallet. Reading it back from {net.chain.name}…
				{:else if busy}
					Confirm in Vela, then give {net.chain.name} {net.wait}
				{:else}
					Open this diary
				{/if}
			</button>
			{#if busy}
				<p class="hint">Keep this page open until it is done.</p>
			{:else if problem && bytes > 0}
				<p class="hint">{problem}</p>
			{:else if wallet.balance === 0n && net.faucet}
				<p class="hint">
					This account has no {net.coin} for gas yet.
					<ExternalLink href={net.faucet}>Get some free from the faucet</ExternalLink>
				</p>
			{:else if wallet.standing === 'new-vela'}
				<p class="hint">
					This is your account's first transaction on {net.chain.name}, so it also sets the account
					up and costs more gas than the next one will.
				</p>
			{/if}
			<p class="accept">
				A diary is public on {net.chain.name} and cannot be renamed, rebound or removed.
			</p>
		{/if}
		{#if failure}
			<p class="error" role="alert">{failure}</p>
		{/if}
	</form>
</div>

<style>
	.page {
		display: grid;
		grid-template-columns: minmax(0, 1fr) min(460px, 44vw);
		min-height: 100svh;
	}

	.scene {
		position: fixed;
		inset: 0;
		pointer-events: none;
	}

	.panel {
		position: relative;
		z-index: 2;
		grid-column: 2;
		display: grid;
		align-content: center;
		gap: 22px;
		padding: calc(var(--header) + 16px) var(--gutter) 40px 12px;
	}

	.title {
		display: grid;
		gap: 8px;
	}

	h1 {
		font-size: clamp(38px, 4.6vw, 60px);
		font-weight: 500;
	}

	.quiet,
	.hint {
		font-size: 14px;
		color: var(--fg-muted);
	}

	.hint {
		text-align: center;
	}

	.hint :global(a) {
		color: var(--gold);
		font-weight: 600;
	}

	label,
	fieldset {
		display: grid;
		gap: 8px;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: 0;
	}

	label > span,
	legend {
		padding: 0;
		font-size: 14px;
		font-weight: 600;
	}

	legend {
		margin-bottom: 8px;
	}

	small {
		margin-left: 6px;
		font-weight: 400;
		color: var(--fg-subtle);
	}

	.field {
		padding: 0 16px;
		border: 1px solid var(--border-strong);
		border-radius: 14px;
		background: rgb(20 16 13 / 0.7);
		backdrop-filter: blur(10px);
	}

	.field:focus-within {
		border-color: var(--gold);
	}

	.field input {
		width: 100%;
		height: 56px;
		border: 0;
		outline: 0;
		background: none;
		font-family: var(--serif);
		font-size: 24px;
		font-weight: 600;
	}

	.swatches {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 10px;
	}

	.swatch {
		display: grid;
		justify-items: center;
		gap: 6px;
		padding: 10px 4px 8px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: rgb(20 16 13 / 0.6);
		font-size: 12px;
		cursor: pointer;
		transition: border-color 0.15s;
	}

	.swatch input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.swatch i {
		width: 38px;
		height: 52px;
		border-radius: 2px 5px 5px 2px;
		box-shadow:
			inset 0 0 0 3px rgb(0 0 0 / 0.14),
			inset 0 0 0 4px var(--foil),
			inset 6px 0 6px -4px rgb(0 0 0 / 0.5),
			0 6px 10px -6px rgb(0 0 0 / 0.8);
	}

	.swatch b {
		font-weight: 500;
		color: var(--fg-muted);
	}

	.swatch.on {
		border-color: var(--gold);
		background: var(--gold-soft);
	}

	.swatch.on b {
		color: var(--gold-strong);
	}

	.swatch:has(:focus-visible) {
		outline: 2px solid var(--gold);
		outline-offset: 2px;
	}

	.big {
		min-height: 58px;
		font-size: 17px;
		white-space: normal;
		text-align: center;
	}

	.accept {
		font-size: 12px;
		text-align: center;
		color: var(--fg-subtle);
	}

	@media (max-width: 860px) {
		.page {
			grid-template-columns: minmax(0, 1fr);
		}

		.panel {
			grid-column: 1;
			align-content: end;
			gap: 16px;
			padding: 42svh var(--gutter) calc(28px + env(safe-area-inset-bottom));
		}

		.swatch {
			padding: 8px 2px 6px;
		}

		.swatch i {
			width: 30px;
			height: 40px;
		}
	}
</style>
