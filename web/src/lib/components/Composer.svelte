<script lang="ts">
	import { BRAND } from '#lib/brand.ts';
	import { page } from '$app/state';
	import { netOf } from '#lib/chain.ts';
	import ExternalLink from './ExternalLink.svelte';
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

	$effect(() => {
		if (open && !dialog.open) {
			try {
				text = localStorage.getItem(draftKey) ?? text;
			} catch {
				// No storage here: the page starts blank.
			}
			dialog.showModal();
			field?.focus();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	// On a phone the keyboard takes half the screen and the browser does not say
	// so in any unit CSS has. The page is fitted to what can actually be seen,
	// so the line being written is never under the keys.
	$effect(() => {
		const viewport = window.visualViewport;
		if (!open || !viewport) return;
		const fit = () => {
			dialog.style.setProperty('--visible', `${viewport.height}px`);
			dialog.style.setProperty('--offset', `${viewport.offsetTop}px`);
		};
		fit();
		viewport.addEventListener('resize', fit);
		viewport.addEventListener('scroll', fit);
		return () => {
			viewport.removeEventListener('resize', fit);
			viewport.removeEventListener('scroll', fit);
		};
	});

	function keep() {
		try {
			if (text.trim()) localStorage.setItem(draftKey, text);
			else localStorage.removeItem(draftKey);
		} catch {
			// Not kept, then.
		}
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy || problem) return;
		busy = true;
		sent = false;
		failure = null;
		unsettled = false;
		keep();
		try {
			const entry = await writeEntry(net, diary.id, text.trim(), { onSent: () => (sent = true) });
			text = '';
			keep();
			void wallet.refresh();
			open = false;
			onwritten(entry);
		} catch (error) {
			failure = describeError(net, error);
			unsettled = error instanceof Outcome && error.unsettled;
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	oncancel={(event) => busy && event.preventDefault()}
	aria-labelledby="compose-title"
>
	<form onsubmit={submit}>
		<div class="top">
			<div>
				<p class="eyebrow">{today.weekday} · {diary.title}</p>
				<h2 id="compose-title">{today.day}</h2>
			</div>
			<button
				type="button"
				class="close"
				onclick={() => dialog.close()}
				disabled={busy}
				aria-label="Close"
			>
				×
			</button>
		</div>

		<textarea
			bind:this={field}
			bind:value={text}
			oninput={keep}
			placeholder="Dear diary,"
			aria-label="Today's page"
			disabled={busy}
			spellcheck="true"></textarea>

		<div class="foot">
			<p class="count" class:over={bytes > MAX_ENTRY_BYTES}>
				{bytes.toLocaleString('en-US')} / {MAX_ENTRY_BYTES.toLocaleString('en-US')} bytes
			</p>
			{#if net.practice}
				<p class="warning">
					<strong>Public, and for practice.</strong> Anyone can read what you seal here, and it
					cannot be changed. But this is {net.chain.name}, and a testnet can be wiped: keep nothing
					here that you want kept.
				</p>
			{:else}
				<p class="warning">
					<strong>Public, and permanent.</strong> Anyone can read what you seal here, and it can
					never be changed or taken back. Not by you, and not by {BRAND}.
				</p>
			{/if}

			{#if failure}
				<p class="error" role="alert">
					{failure}
					{#if unsettled}
						<br />Your words are still here. Look in your wallet before sealing them again, or you
						may pay for this page twice.
					{/if}
				</p>
			{/if}

			<button class="button primary wide big" disabled={busy || problem !== null}>
				{#if sent}
					Confirmed in your wallet. Reading it back from {net.chain.name}…
				{:else if busy}
					Sealing… confirm in Vela, then give {net.chain.name} {net.wait}
				{:else}
					Seal this page · {coin(FEE)} {net.coin}
				{/if}
			</button>
			{#if busy}
				<p class="hint">Keep this page open until it is done.</p>
			{:else if problem && bytes > 0}
				<p class="hint">
					{problem}
					{#if short && net.faucet}<ExternalLink href={net.faucet}
							>Get some free from the faucet</ExternalLink
						>{/if}
				</p>
			{:else}
				<p class="hint">Plus the gas to carry it, which grows with the length of the page.</p>
			{/if}
		</div>
	</form>
</dialog>

<style>
	dialog {
		width: min(680px, calc(100vw - 24px));
		max-height: min(860px, calc(100dvh - 24px));
		padding: 0;
		border: 0;
		border-radius: 10px;
		background: none;
		color: var(--ink);
		overflow: visible;
	}

	dialog::backdrop {
		background: rgb(8 6 4 / 0.72);
		backdrop-filter: blur(8px);
	}

	form {
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

	.top {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 12px;
		padding: 26px 30px 14px 58px;
		border-bottom: 3px double rgb(111 68 40 / 0.45);
	}

	.eyebrow {
		color: rgb(111 68 40 / 0.85);
	}

	h2 {
		margin-top: 4px;
		font-size: clamp(30px, 5vw, 42px);
		color: #6f4428;
	}

	.close {
		width: 36px;
		height: 36px;
		flex: none;
		border: 0;
		border-radius: 50%;
		background: rgb(111 68 40 / 0.1);
		color: #6f4428;
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
	}

	textarea {
		--line: 38px;
		display: block;
		width: 100%;
		min-height: calc(var(--line) * 7);
		height: calc(var(--line) * 11);
		padding: 0 30px 0 58px;
		border: 0;
		outline: 0;
		resize: none;
		/* Ruled, with a margin line, and the rules travel with the writing. */
		background:
			linear-gradient(90deg, transparent 46px, rgb(184 68 58 / 0.3) 46px 47px, transparent 47px),
			repeating-linear-gradient(
				transparent 0 calc(var(--line) - 1px),
				rgb(70 92 140 / 0.22) calc(var(--line) - 1px) var(--line)
			);
		background-attachment: local;
		background-position: 0 -6px;
		color: var(--ink);
		font-family: var(--hand);
		font-size: 27px;
		line-height: var(--line);
		caret-color: var(--wax);
	}

	textarea::placeholder {
		color: rgb(27 37 64 / 0.3);
	}

	.foot {
		display: grid;
		gap: 10px;
		padding: 14px 30px 24px 58px;
		border-top: 1px solid rgb(111 68 40 / 0.25);
	}

	.count {
		justify-self: end;
		font-size: 12px;
		color: rgb(111 68 40 / 0.8);
		font-variant-numeric: tabular-nums;
	}

	.count.over {
		color: #a3271e;
		font-weight: 700;
	}

	.warning {
		font-size: 13px;
		color: #5a3a22;
	}

	.error {
		color: #a3271e;
	}

	.big {
		min-height: 56px;
		font-size: 16px;
		white-space: normal;
		text-align: center;
	}

	.hint {
		font-size: 12px;
		text-align: center;
		color: rgb(111 68 40 / 0.85);
	}

	.hint :global(a) {
		color: #8a2f1e;
		font-weight: 600;
	}

	@media (max-width: 560px) {
		dialog {
			top: var(--offset, 0);
			width: 100%;
			max-width: none;
			max-height: var(--visible, 100dvh);
			height: var(--visible, 100dvh);
			margin: 0;
			border-radius: 0;
		}

		/* With the keyboard up there is room for the writing and the button, and little else. */
		@media (max-height: 520px) {
			.warning,
			.hint {
				display: none;
			}

			h2 {
				font-size: 24px;
			}

			textarea {
				min-height: calc(var(--line) * 3);
			}

			.foot {
				gap: 6px;
				padding-top: 8px;
				padding-bottom: 10px;
			}
		}

		form {
			height: 100%;
		}

		.top {
			padding: calc(18px + env(safe-area-inset-top)) 16px 12px 46px;
		}

		textarea {
			height: auto;
			padding: 0 16px 0 46px;
			background:
				linear-gradient(90deg, transparent 34px, rgb(184 68 58 / 0.3) 34px 35px, transparent 35px),
				repeating-linear-gradient(
					transparent 0 calc(var(--line) - 1px),
					rgb(70 92 140 / 0.22) calc(var(--line) - 1px) var(--line)
				);
			background-attachment: local;
			background-position: 0 -6px;
		}

		.foot {
			padding: 12px 16px calc(16px + env(safe-area-inset-bottom)) 46px;
		}
	}
</style>
