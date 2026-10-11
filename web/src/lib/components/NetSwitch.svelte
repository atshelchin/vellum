<script lang="ts">
	import { page } from '$app/state';
	import { NETS, netOf } from '#lib/chain.ts';
	import { homePath, newDiaryPath } from '#lib/paths.ts';

	let net = $derived(netOf(page.params.network));

	// The same page on the other network, where there is one. A diary is on one
	// network only, so from a diary the way across leads to the shelf.
	let opening = $derived(page.route.id?.endsWith('/new') ?? false);
</script>

<!--
	Which network the page is on, and the way to the other. It is always in
	sight: nobody should have to wonder whether what they are writing is kept.
-->
<nav aria-label="Network">
	{#each [NETS.mainnet, NETS.testnet] as each (each.id)}
		<a
			href={opening ? newDiaryPath(each) : homePath(each)}
			class:practice={each.practice}
			aria-current={each === net ? 'true' : undefined}
			title={each.practice
				? `${each.chain.name}: the practice book. Free, and not kept for good.`
				: `${each.chain.name}: kept for good.`}
		>
			{each.label}
		</a>
	{/each}
</nav>

<style>
	nav {
		display: inline-flex;
		padding: 3px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: rgb(20 16 13 / 0.6);
		backdrop-filter: blur(10px);
	}

	a {
		padding: 5px 12px;
		border-radius: 999px;
		color: var(--fg-subtle);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-decoration: none;
		white-space: nowrap;
		transition:
			background 0.15s,
			color 0.15s;
	}

	a:hover {
		color: var(--fg);
	}

	a[aria-current] {
		background: rgb(255 240 215 / 0.12);
		color: var(--fg);
	}

	/* The practice book is said in gold, wherever it is said. */
	a.practice[aria-current] {
		background: var(--gold-soft);
		color: var(--gold-strong);
	}
</style>
