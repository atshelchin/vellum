<script lang="ts">
	import { page } from '$app/state';
	import { BRAND } from '#lib/brand.ts';
	import { netOf } from '#lib/chain.ts';
	import { immersion } from '#lib/immersion.svelte.ts';
	import { homePath } from '#lib/paths.ts';
	import { sound } from '#lib/sound.svelte.ts';
	import NetSwitch from './NetSwitch.svelte';
	import Seal from './Seal.svelte';
	import WalletButton from './WalletButton.svelte';

	let net = $derived(netOf(page.params.network));
</script>

<header class:away={immersion.on} class:paper={immersion.paper} inert={immersion.on}>
	<a class="brand" href={homePath(net)} aria-label="{BRAND}, home">
		<Seal size={34} />
		<span>{BRAND}</span>
	</a>
	<NetSwitch />
	<span class="space"></span>
	<button
		class="sound"
		onclick={() => sound.toggle()}
		aria-pressed={!sound.muted}
		aria-label={sound.muted ? 'Turn sound on' : 'Turn sound off'}
		title={sound.muted ? 'Sound is off' : 'Sound is on'}
	>
		<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
			<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
			{#if sound.muted}
				<path
					d="M16 9.5l5 5m0-5l-5 5"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
				/>
			{:else}
				<path
					d="M15.5 9a4.2 4.2 0 0 1 0 6m2.6-8.6a8 8 0 0 1 0 11.2"
					fill="none"
					stroke="currentColor"
					stroke-width="1.8"
					stroke-linecap="round"
				/>
			{/if}
		</svg>
	</button>
	<WalletButton />
</header>

<style>
	header {
		position: absolute;
		z-index: 10;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		gap: 10px;
		height: calc(var(--header) + env(safe-area-inset-top));
		padding: env(safe-area-inset-top) var(--gutter) 0;
		border-bottom: 1px solid transparent;
		/* The book lies under the header: whatever is not a control lets a press through. */
		pointer-events: none;
		transition:
			opacity 0.5s ease,
			transform 0.5s ease,
			background-color 0.4s ease,
			border-color 0.4s ease;
	}

	/* A book is being read: the header leaves, and comes back when it is wanted. */
	header.away {
		opacity: 0;
		transform: translateY(-14px);
	}

	header.away > :global(*) {
		pointer-events: none;
	}

	header > :global(*) {
		pointer-events: auto;
	}

	/* Over paper, glass that the paper shows through goes the colour of mud: there it is all but solid. */
	header.paper {
		--glass: rgb(20 16 13 / 0.94);
	}

	/*
	 * Over paper that has the screen to itself there is no dark to be read
	 * against, and things made for the dark look lost on it. So the header
	 * brings its own: it is a bar across the top, of the room the paper lies in.
	 */
	@media (max-width: 1100px) {
		header.paper {
			border-bottom-color: var(--border);
			background-color: var(--bg);
			pointer-events: auto;
		}

		header.paper.away {
			transform: translateY(-100%);
			pointer-events: none;
		}
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		margin-right: 4px;
		font-family: var(--serif);
		font-size: 26px;
		font-weight: 600;
		letter-spacing: 0.01em;
		text-decoration: none;
		white-space: nowrap;
	}

	.space {
		flex: 1;
		pointer-events: none;
	}

	.sound {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		flex: none;
		border: 1px solid var(--border-strong);
		border-radius: 50%;
		background: var(--glass);
		backdrop-filter: blur(10px);
		color: var(--fg-muted);
		cursor: pointer;
	}

	.sound:hover {
		border-color: var(--fg-subtle);
		color: var(--fg);
	}

	/* On a narrow screen the seal is name enough, and the room goes to the switch. */
	@media (max-width: 720px) {
		header {
			gap: 8px;
		}

		.brand span {
			display: none;
		}
	}
</style>
