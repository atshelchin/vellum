<script lang="ts">
	import { backdrop } from '#lib/backdrop.ts';
	import { BRAND, VELA } from '#lib/brand.ts';
	import { page } from '$app/state';
	import { netOf } from '#lib/chain.ts';
	import { coin, shortAddress } from '#lib/format.ts';
	import { wallet, type Standing } from '#lib/wallet.svelte.ts';
	import ExternalLink from './ExternalLink.svelte';

	let net = $derived(netOf(page.params.network));

	let standing: Record<Standing, string> = $derived({
		checking: 'Checking this account…',
		vela: 'A Vela account. You can open diaries and write in them.',
		'new-vela': `A Vela account that is new on ${net.chain.name}. Your first transaction here sets it up.`,
		'not-vela': 'Not a Vela account. You can read a diary you have the link to, but not keep one.'
	});

	let dialog: HTMLDialogElement;
	let hasVela = $derived(wallet.options.some((option) => option.isVela));

	$effect(() => {
		if (wallet.pickerOpen && !dialog.open) dialog.showModal();
		else if (!wallet.pickerOpen && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	onclose={() => (wallet.pickerOpen = false)}
	use:backdrop={() => dialog.close()}
	aria-labelledby="connect-title"
>
	<!-- Focus lands on the sheet, not on its close button, so opening it draws no focus ring. -->
	<div class="sheet" tabindex="-1" autofocus>
		<div class="top">
			<h2 id="connect-title">{wallet.account ? 'Your wallet' : 'Connect a wallet'}</h2>
			<button class="close" onclick={() => dialog.close()} aria-label="Close">×</button>
		</div>

		<p class="notice">
			<strong>{BRAND} only supports Vela Wallet.</strong> Any wallet can connect to read, but only a Vela
			account can open a diary or write in one.
		</p>

		{#if wallet.account && wallet.current}
			<div class="current">
				<p class="name">{wallet.current.name}</p>
				<p class="mono address">{shortAddress(wallet.account)}</p>
				<p class="standing" class:ok={wallet.canWrite}>{standing[wallet.standing]}</p>
				{#if wallet.balance !== null}
					<p class="balance">{coin(wallet.balance)} {net.coin} on {net.chain.name}</p>
				{/if}
				<button class="button" onclick={() => wallet.disconnect()}>Disconnect</button>
			</div>
		{:else}
			{#if wallet.options.length > 0}
				<ul>
					{#each wallet.options as option (option.id)}
						<li>
							<button
								class="option"
								disabled={wallet.connecting !== null}
								onclick={() => wallet.connect(option)}
							>
								{#if option.icon}
									<img src={option.icon} alt="" width="36" height="36" />
								{:else}
									<span class="blank"></span>
								{/if}
								<span class="label">
									{option.name}
									{#if wallet.connecting === option.id}<small>Waiting for the wallet…</small>{/if}
								</span>
								<span class="tag" class:vela={option.isVela}
									>{option.isVela ? 'Can write' : 'Read only'}</span
								>
							</button>
						</li>
					{/each}
				</ul>
			{:else}
				<p class="empty">
					No wallet was found in this browser. Open this page in Vela Wallet's browser, or install
					the Vela extension.
				</p>
			{/if}
			{#if !hasVela}
				<ExternalLink href={VELA} class="button primary wide">Get Vela Wallet</ExternalLink>
			{/if}
			{#if wallet.error}
				<p class="error" role="alert">{wallet.error}</p>
			{/if}
		{/if}
		<p class="terms">
			{#if net.practice}
				This is the practice book, on {net.chain.name}: public, free, and not kept for good.
			{:else}
				Everything written in {BRAND} is public on {net.chain.name}, and permanent.
			{/if}
		</p>
	</div>
</dialog>

<style>
	dialog {
		width: min(420px, calc(100vw - 32px));
		padding: 0;
		border: 1px solid var(--border-strong);
		border-radius: 20px;
		background: var(--bg-raised);
		color: var(--fg);
		box-shadow: 0 30px 80px rgb(0 0 0 / 0.6);
	}

	dialog::backdrop {
		background: rgb(8 6 4 / 0.66);
		backdrop-filter: blur(6px);
	}

	.sheet {
		display: grid;
		gap: 16px;
		padding: 22px;
		outline: none;
	}

	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	h2 {
		font-size: 28px;
	}

	.close {
		width: 36px;
		height: 36px;
		border: 0;
		border-radius: 50%;
		background: rgb(255 240 215 / 0.06);
		font-size: 22px;
		line-height: 1;
		cursor: pointer;
	}

	ul {
		display: grid;
		gap: 8px;
	}

	.option {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--bg);
		text-align: left;
		cursor: pointer;
	}

	.option:hover:not(:disabled) {
		border-color: var(--fg-subtle);
	}

	.option img,
	.blank {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		background: var(--border);
	}

	.label {
		flex: 1;
		display: grid;
		font-weight: 600;
	}

	.label small {
		font-weight: 400;
		color: var(--fg-muted);
	}

	.tag {
		padding: 3px 9px;
		border-radius: 999px;
		background: rgb(255 240 215 / 0.07);
		color: var(--fg-muted);
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
	}

	.tag.vela {
		background: var(--gold-soft);
		color: var(--gold-strong);
	}

	.current {
		display: grid;
		gap: 6px;
		padding: 16px;
		border: 1px solid var(--border);
		border-radius: 14px;
		background: var(--bg);
	}

	.name {
		font-weight: 700;
	}

	.address,
	.balance {
		font-size: 14px;
		color: var(--fg-muted);
	}

	.standing {
		font-size: 14px;
	}

	.standing.ok {
		color: var(--success);
	}

	.current .button {
		margin-top: 8px;
	}

	.empty {
		font-size: 14px;
		color: var(--fg-muted);
	}

	.terms {
		font-size: 12px;
		color: var(--fg-subtle);
	}

	/* On a phone the picker rises from the bottom, where the thumb is. */
	@media (max-width: 560px) {
		dialog {
			width: 100%;
			max-width: none;
			margin: auto 0 0;
			border-width: 1px 0 0;
			border-radius: 22px 22px 0 0;
			animation: rise 0.28s cubic-bezier(0.2, 0.9, 0.3, 1);
		}

		.sheet {
			padding-bottom: calc(22px + env(safe-area-inset-bottom));
		}

		.option {
			min-height: 60px;
		}
	}

	@keyframes rise {
		from {
			transform: translateY(100%);
		}
	}
</style>
