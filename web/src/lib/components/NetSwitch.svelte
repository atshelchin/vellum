<script lang="ts">
	import { page } from '$app/state';
	import { NET_LIST, netOf } from '#lib/chain.ts';
	import { homePath, newDiaryPath } from '#lib/paths.ts';

	let net = $derived(netOf(page.params.network));

	// The same page on another network, where there is one. A diary is on one
	// network only, so from a diary the way across leads to the shelf.
	let opening = $derived(page.route.id?.endsWith('/new') ?? false);
</script>

<!--
	Which network the page is on, and the way to the others. It is always in
	sight: nobody should have to wonder where what they are writing is kept, or
	for how long.
-->
<nav aria-label="Network">
	{#each NET_LIST as each (each.id)}
		<a
			href={opening ? newDiaryPath(each) : homePath(each)}
			class:practice={each.practice}
			aria-current={each === net ? 'true' : undefined}
			title="{each.chain.name}. {each.about}"
		>
			<span class="long">{each.label}</span>
			<span class="short">{each.short}</span>
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
		padding: 5px 11px;
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

	.short {
		display: none;
	}

	/* Three names, a seal, a wallet and a phone: the names are the part that can give. */
	@media (max-width: 480px) {
		a {
			padding: 5px 9px;
		}

		.long {
			display: none;
		}

		.short {
			display: inline;
		}
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
