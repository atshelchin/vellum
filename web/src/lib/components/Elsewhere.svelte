<script lang="ts">
	import { page } from '$app/state';
	import { BRAND } from '#lib/brand.ts';
	import { NET_LIST, netOf, openElsewhere } from '#lib/chain.ts';
	import { homePath } from '#lib/paths.ts';

	let net = $derived(netOf(page.params.network));
	let others = $derived(openElsewhere(net));
	/** The networks a page is kept on in earnest, that are not open yet. */
	let coming = $derived(NET_LIST.filter((each) => !each.practice && !each.vellum));
</script>

<!--
	The ways from one network to the others: from the practice book to where a
	page is kept, and from there back, and across. A way is only offered once
	there is something at the end of it; and where this network has no Vellum
	yet, the page says so itself and has already pointed across.
-->
{#if net.practice}
	<p class="elsewhere">
		This is the practice book. Nothing here costs money, and a testnet does not keep things for
		good.
		{#each others as other (other.id)}
			<a href={homePath(other)}>{other.invite} →</a>
		{:else}
			{BRAND} on {coming.map((each) => each.chain.name).join(' and ')} opens soon.
		{/each}
	</p>
{:else if net.vellum && others.length > 0}
	<p class="elsewhere">
		{#each others as other (other.id)}
			<a href={homePath(other)}>{other.invite} →</a>
		{/each}
	</p>
{/if}

<style>
	.elsewhere {
		font-size: 13px;
		color: var(--fg-subtle);
		text-wrap: pretty;
	}

	a {
		color: var(--gold);
		font-weight: 600;
		text-decoration: none;
		white-space: nowrap;
	}

	/* More than one way across: each on a line of its own. */
	a + a {
		display: block;
		margin-top: 4px;
	}

	a:hover {
		color: var(--gold-strong);
	}
</style>
