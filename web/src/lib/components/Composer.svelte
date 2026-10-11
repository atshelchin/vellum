<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { BRAND } from '#lib/brand.ts';
	import { netOf } from '#lib/chain.ts';
	import { coin, dateParts } from '#lib/format.ts';
	import {
		byteLength,
		describeError,
		FEE,
		MAX_ENTRY_BYTES,
		Outcome,
		writeEntry,
		type Diary,
		type Entry
	} from '#lib/vellum.ts';
	import { wallet } from '#lib/wallet.svelte.ts';
	import ExternalLink from './ExternalLink.svelte';
	import Sealing from './Sealing.svelte';

	let {
		diary,
		open = $bindable(false),
		onwritten
	}: {
		diary: Diary;
		open?: boolean;
		/** The entry is on the chain. */
		onwritten: (entry: Entry) => void;
	} = $props();

	let net = $derived(netOf(page.params.network));

	let dialog: HTMLDialogElement;
	let field = $state<HTMLTextAreaElement>();
	let text = $state('');
	let busy = $state(false);
	/** The wallet has sent it; what is left is to read it back from the chain. */
	let sent = $state(false);
	let failure = $state<string | null>(null);
	/** The last attempt may yet land: sending again could pay for the same page twice. */
	let unsettled = $state(false);
	/**
	 * The sealing, while there is one: wax poured, the wallet's answer in, and
	 * at last the seal, which is pressed only into a page that is on the chain.
	 */
	let phase = $state<'wax' | 'sent' | 'sealed' | null>(null);
	/** The page that was sealed, as the chain has it. */
	let sealed = $state<Entry>();
	/** The die has just met the wax: the page feels it. */
	let struck = $state(false);
	/** The sealed page is being put away into the book. */
	let leaving = $state(false);
	/** The two words at the foot of the page have been pressed, and are said in full. */
	let explained = $state(false);
	/** On a phone: the page has been pulled up to fill the screen. */
	let expanded = $state(false);
	/** On a phone: the keyboard is up and there is room for the writing and little else. */
	let cramped = $state(false);

	// What is half written is kept in this browser until it is sealed, so a
	// closed tab or a refused transaction costs nothing.
	let draftKey = $derived(`vellum:draft:${net.chain.id}:${diary.id}`);
	let today = dateParts(Math.floor(Date.now() / 1000));

	let bytes = $derived(byteLength(text.trim()));
	let short = $derived(wallet.balance !== null && wallet.balance < FEE);
	let problem = $derived.by(() => {
		if (bytes === 0) return 'Write something first.';
		if (bytes > MAX_ENTRY_BYTES) return 'That is more than one entry can hold. Split it in two.';
		if (short) {
			return `This account holds ${coin(wallet.balance!)} ${net.coin}. A page costs ${coin(FEE)} ${net.coin}, and gas.`;
		}
		return null;
	});
	// How much has been written matters to nobody until the page is nearly full.
	let nearly = $derived(bytes > MAX_ENTRY_BYTES * 0.8);

	$effect(() => {
		if (open && !dialog.open) {
			try {
				text = localStorage.getItem(draftKey) ?? text;
			} catch {
				// No storage here: the page starts blank.
			}
			explained = false;
			dialog.showModal();
			// Asked for here, while the press that opened the page still counts as
			// one: a phone will not raise its keyboard for a page that asks later.
			field?.focus({ preventScroll: true });
			void tick().then(fit);
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	// On a phone the keyboard takes half the screen and the browser does not say
	// so in any unit CSS has: a media query still sees the whole screen. So the
	// page is fitted to what can actually be seen, measured, and what to leave
	// out when there is little of it is decided from the same measurement.
	$effect(() => {
		const viewport = window.visualViewport;
		if (!open || !viewport) return;
		const measure = () => {
			dialog.style.setProperty('--visible', `${viewport.height}px`);
			dialog.style.setProperty('--offset', `${viewport.offsetTop}px`);
			cramped = viewport.height < 460;
			fit();
		};
		measure();
		viewport.addEventListener('resize', measure);
		viewport.addEventListener('scroll', measure);
		return () => {
			viewport.removeEventListener('resize', measure);
			viewport.removeEventListener('scroll', measure);
		};
	});

	// The book behind must stay where it is while a page is being written over it.
	$effect(() => {
		if (!open) return;
		const root = document.documentElement;
		const before = root.style.overflow;
		root.style.overflow = 'hidden';
		return () => {
			root.style.overflow = before;
		};
	});

	/**
	 * Tells the page how tall its writing is, so that it can be exactly as tall
	 * as what is written on it until it runs out of screen.
	 */
	function fit() {
		if (!field) return;
		const scrolled = field.scrollTop;
		field.style.height = 'auto';
		const content = field.scrollHeight;
		field.style.height = '';
		field.style.setProperty('--content', `${content}px`);
		field.scrollTop = scrolled;
	}

	function keep() {
		try {
			if (text.trim()) localStorage.setItem(draftKey, text);
			else localStorage.removeItem(draftKey);
		} catch {
			// Not kept, then.
		}
	}

	function dismiss() {
		if (!busy) dialog.close();
	}

	/** Resolves once the page can be seen: at once, if it can be now. */
	function seen(): Promise<void> {
		if (!document.hidden) return Promise.resolve();
		return new Promise((done) => {
			const look = () => {
				if (document.hidden) return;
				document.removeEventListener('visibilitychange', look);
				done();
			};
			document.addEventListener('visibilitychange', look);
		});
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || problem) return;
		busy = true;
		sent = false;
		failure = null;
		unsettled = false;
		struck = false;
		keep();
		// The wax is poured the moment the seal is asked for. What is being
		// waited for, from here, is the wallet and then the chain.
		phase = 'wax';
		try {
			const entry = await writeEntry(net, diary.id, text.trim(), {
				onSent: () => {
					sent = true;
					phase = 'sent';
				}
			});
			// It is on the chain: nothing is left to lose, so nothing is kept. The
			// words stay on the page until it is put away.
			try {
				localStorage.removeItem(draftKey);
			} catch {
				// There was nowhere to keep it in the first place.
			}
			void wallet.refresh();
			// A seal pressed while nobody is looking is a seal nobody saw pressed.
			await seen();
			sealed = entry;
			phase = 'sealed';
		} catch (error) {
			phase = null;
			busy = false;
			failure = describeError(net, error);
			unsettled = error instanceof Outcome && error.unsettled;
		}
	}

	/** The seal has been looked at. The page goes into the book, and the book is opened at it. */
	async function putAway() {
		const entry = sealed;
		if (!entry) return;
		leaving = true;
		await new Promise((done) => setTimeout(done, 420));
		text = '';
		open = false;
		phase = null;
		sealed = undefined;
		leaving = struck = busy = false;
		onwritten(entry);
	}
</script>

<!--
	A sheet of paper and, at its foot, one row. Everything else that could be
	said is left unsaid until it is asked for or until it matters: writing is
	the one thing done here. A press outside the sheet puts it away, and what
	was written is kept.
-->
<dialog
	bind:this={dialog}
	class:expanded
	class:cramped
	class:leaving
	onclose={() => (open = false)}
	oncancel={(event) => busy && event.preventDefault()}
	onclick={(event) => event.target === dialog && dismiss()}
	aria-labelledby="compose-title"
>
	<form onsubmit={submit} class:sealing={phase !== null} class:struck>
		<div class="top">
			<div class="when">
				<h2 id="compose-title">{today.day}</h2>
				<p class="eyebrow">{today.weekday} · {diary.title}</p>
			</div>
			<button
				type="button"
				class="round grow"
				onclick={() => (expanded = !expanded)}
				aria-pressed={expanded}
				aria-label={expanded ? 'Make the page smaller' : 'Make the page fill the screen'}
			>
				<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
					{#if expanded}
						<path d="M10 4v6H4M14 20v-6h6" />
					{:else}
						<path d="M14 4h6v6M10 20H4v-6" />
					{/if}
				</svg>
			</button>
			<button type="button" class="round" onclick={dismiss} disabled={busy} aria-label="Close">
				<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
		</div>

		<textarea
			bind:this={field}
			bind:value={text}
			oninput={() => {
				keep();
				fit();
			}}
			placeholder="Dear diary,"
			aria-label="Today's page"
			disabled={busy}
			spellcheck="true"
			autocapitalize="sentences"></textarea>

		<div class="foot">
			{#if explained}
				<p class="note" id="compose-terms">
					{#if net.practice}
						Anyone can read what you seal here, and it cannot be changed. But this is {net.chain
							.name}, and a testnet can be wiped: keep nothing here that you want kept.
					{:else}
						Anyone can read what you seal here, and it can never be changed or taken back. Not by
						you, and not by {BRAND}.
					{/if}
					The gas to carry a page grows with its length.
				</p>
			{/if}

			{#if failure}
				<p class="note error" role="alert">
					{failure}
					{#if unsettled}
						Your words are still here. Look in your wallet before sealing them again, or you may pay
						for this page twice.
					{/if}
				</p>
			{:else if problem && bytes > 0 && !busy}
				<p class="note error">
					{problem}
					{#if short && net.faucet}<ExternalLink href={net.faucet}
							>Get some free from the faucet</ExternalLink
						>{/if}
				</p>
			{/if}

			<div class="actions">
				<!-- The one thing that has to be known before sealing, in two words. The rest is a press away. -->
				<button
					type="button"
					class="terms"
					onclick={() => (explained = !explained)}
					aria-expanded={explained}
					aria-controls="compose-terms"
				>
					Public · {net.practice ? 'for practice' : 'permanent'}
				</button>
				{#if nearly}
					<span class="count" class:over={bytes > MAX_ENTRY_BYTES}>
						{bytes.toLocaleString('en-US')} / {MAX_ENTRY_BYTES.toLocaleString('en-US')}
					</span>
				{/if}
				<button class="button primary seal" disabled={busy || problem !== null}>
					{sent ? 'Reading back…' : busy ? 'Sealing…' : `Seal · ${coin(FEE)} ${net.coin}`}
					<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
						<path d="M12 19V5M6 11l6-6 6 6" />
					</svg>
				</button>
			</div>
		</div>

		{#if phase}
			<Sealing
				{phase}
				waiting={`Confirm in Vela, then give ${net.chain.name} ${net.wait}. Keep this page open.`}
				sent={`Confirmed in your wallet. Reading it back from ${net.chain.name}…`}
				sealed={sealed ? `Entry ${sealed.index + 1} · ${dateParts(sealed.writtenAt).day}` : ''}
				kept={net.practice
					? `Kept on ${net.chain.name}, for practice.`
					: `Kept on ${net.chain.name}, for good.`}
				onstruck={() => (struck = true)}
				ondone={putAway}
			/>
		{/if}
	</form>
</dialog>

<style>
	dialog {
		width: min(720px, calc(100vw - 24px));
		max-height: min(900px, calc(100dvh - 32px));
		padding: 0;
		border: 0;
		border-radius: 10px;
		background: none;
		color: var(--ink);
		overflow: visible;
	}

	dialog::backdrop {
		background: rgb(8 6 4 / 0.8);
		backdrop-filter: blur(10px);
	}

	form {
		position: relative;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		max-height: inherit;
		border-radius: inherit;
		/* A page of the same paper the book is made of. */
		background:
			linear-gradient(90deg, rgb(58 40 22 / 0.2), transparent 9%),
			radial-gradient(120% 80% at 100% 100%, rgb(150 104 52 / 0.16), transparent 60%), var(--paper);
		box-shadow:
			0 40px 90px rgb(0 0 0 / 0.7),
			0 0 0 1px rgb(120 90 50 / 0.3);
		overflow: hidden;
	}

	/* While it is being sealed the page is only a page: nothing on it is for pressing. */
	form.sealing {
		min-height: min(340px, 100%);
	}

	form.sealing .foot {
		visibility: hidden;
	}

	/* The die comes down on it. */
	form.struck {
		animation: thud 0.34s cubic-bezier(0.3, 0.6, 0.4, 1);
	}

	/* Sealed, and put away into the book. */
	.leaving form {
		animation: away 0.42s cubic-bezier(0.5, 0, 0.8, 0.5) forwards;
	}

	.leaving::backdrop {
		opacity: 0;
		transition: opacity 0.42s ease;
	}

	@keyframes thud {
		30% {
			transform: translateY(4px) scale(0.996);
		}
		62% {
			transform: translateY(-1px);
		}
	}

	@keyframes away {
		to {
			opacity: 0;
			transform: translateY(26px) scale(0.955);
		}
	}

	/* The day, said once and quietly, the way it is written at the head of a page. */
	.top {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 16px 16px 10px 58px;
	}

	.when {
		display: flex;
		flex: 1;
		align-items: baseline;
		gap: 12px;
		min-width: 0;
	}

	h2 {
		font-size: 22px;
		color: #6f4428;
		white-space: nowrap;
	}

	.eyebrow {
		min-width: 0;
		overflow: hidden;
		color: rgb(111 68 40 / 0.7);
		font-size: 11px;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.round {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		flex: none;
		border: 0;
		border-radius: 50%;
		background: none;
		color: rgb(111 68 40 / 0.75);
		cursor: pointer;
		transition: background 0.15s;
	}

	.round:hover:not(:disabled) {
		background: rgb(111 68 40 / 0.1);
	}

	.round:disabled {
		opacity: 0.35;
		cursor: default;
	}

	/* Only a phone has a page to pull up. */
	.grow {
		display: none;
	}

	svg path {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	textarea {
		--line: 38px;
		--ruled: 46px;
		display: block;
		width: 100%;
		min-height: calc(var(--line) * 6);
		/* Thirteen lines to begin with, and then as many as are written, while the screen has them. */
		height: max(calc(var(--line) * 13), min(var(--content, 0px), 66dvh));
		padding: 0 30px 0 58px;
		border: 0;
		outline: 0;
		resize: none;
		/* Ruled, with a margin line, and the rules travel with the writing. */
		background:
			linear-gradient(
				90deg,
				transparent var(--ruled),
				rgb(184 68 58 / 0.28) var(--ruled) calc(var(--ruled) + 1px),
				transparent calc(var(--ruled) + 1px)
			),
			repeating-linear-gradient(
				transparent 0 calc(var(--line) - 1px),
				rgb(70 92 140 / 0.2) calc(var(--line) - 1px) var(--line)
			);
		background-attachment: local;
		background-position: 0 -6px;
		color: var(--ink);
		font-family: var(--hand);
		font-size: 27px;
		/* A hand's letters are small for their size. Writing that falls to another
		   face, as Chinese does, is drawn to the same height, not to the same size. */
		font-size-adjust: from-font;
		line-height: var(--line);
		caret-color: var(--wax);
		overscroll-behavior: contain;
	}

	textarea::placeholder {
		color: rgb(27 37 64 / 0.28);
	}

	.foot {
		display: grid;
		gap: 8px;
		padding: 8px 14px 12px 58px;
	}

	.note {
		max-width: 46em;
		font-size: 13px;
		color: #5a3a22;
		text-wrap: pretty;
	}

	.note.error {
		color: #a3271e;
	}

	.note :global(a) {
		color: #8a2f1e;
		font-weight: 600;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.terms {
		min-width: 0;
		margin-right: auto;
		padding: 6px 0;
		overflow: hidden;
		text-overflow: ellipsis;
		border: 0;
		background: none;
		color: rgb(111 68 40 / 0.7);
		font-size: 12px;
		letter-spacing: 0.02em;
		white-space: nowrap;
		cursor: pointer;
		text-decoration: underline dotted rgb(111 68 40 / 0.45);
		text-underline-offset: 4px;
	}

	.terms:hover,
	.terms[aria-expanded='true'] {
		color: #5a3a22;
	}

	.count {
		font-size: 12px;
		color: rgb(111 68 40 / 0.8);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.count.over {
		color: #a3271e;
		font-weight: 700;
	}

	.seal {
		flex: none;
		min-height: 44px;
		gap: 6px;
		padding: 0 14px 0 20px;
		font-size: 15px;
	}

	/*
	 * On a phone the page is a sheet standing on the keyboard, the book still in
	 * sight above it. It is as tall as what is written on it, up to the top of
	 * the screen, and the row at its foot is where a thumb already is.
	 */
	@media (max-width: 640px), (max-height: 500px) {
		dialog {
			top: var(--offset, 0);
			left: 0;
			width: 100%;
			max-width: none;
			height: var(--visible, 100dvh);
			max-height: none;
			margin: 0;
			border-radius: 0;
		}

		dialog[open] {
			display: flex;
			flex-direction: column;
			justify-content: flex-end;
		}

		dialog::backdrop {
			background: rgb(8 6 4 / 0.5);
			backdrop-filter: blur(3px);
		}

		form {
			display: flex;
			flex-direction: column;
			max-height: 100%;
			border-radius: 22px 22px 0 0;
			box-shadow:
				0 -18px 50px rgb(0 0 0 / 0.55),
				0 0 0 1px rgb(120 90 50 / 0.3);
			animation: rise 0.3s cubic-bezier(0.2, 0.9, 0.3, 1);
		}

		.expanded form {
			height: 100%;
			border-radius: 0;
		}

		.top {
			gap: 2px;
			padding: 8px 8px 2px 46px;
		}

		.expanded .top {
			padding-top: calc(8px + env(safe-area-inset-top));
		}

		.when {
			gap: 8px;
		}

		h2 {
			font-size: 17px;
		}

		.eyebrow {
			font-size: 10px;
			letter-spacing: 0.1em;
		}

		.grow {
			display: grid;
		}

		textarea {
			--line: 34px;
			--ruled: 34px;
			flex: 0 1 auto;
			min-height: calc(var(--line) * 6);
			/* As tall as what is written. The sheet stops at the top of the screen, and then the page scrolls. */
			height: var(--content, calc(var(--line) * 6));
			padding: 0 16px 0 46px;
			font-size: 24px;
		}

		.cramped textarea {
			min-height: calc(var(--line) * 3);
		}

		.expanded textarea {
			flex: 1 1 auto;
			height: auto;
		}

		.foot {
			gap: 6px;
			padding: 6px 10px calc(8px + env(safe-area-inset-bottom)) 16px;
		}

		.actions {
			gap: 10px;
		}

		/* The keyboard is where the bottom of the screen was, so there is nothing below to keep clear of. */
		.cramped .foot {
			padding-bottom: 8px;
		}

		.note {
			font-size: 12px;
		}

		.seal {
			padding: 0 12px 0 16px;
			font-size: 14px;
		}
	}

	@keyframes rise {
		from {
			transform: translateY(40%);
			opacity: 0;
		}
	}
</style>
