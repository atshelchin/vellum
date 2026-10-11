<script lang="ts">
	import { page } from '$app/state';
	import { BRAND } from '#lib/brand.ts';
	import { netOf, otherNet } from '#lib/chain.ts';
	import { homePath } from '#lib/paths.ts';

	let net = $derived(netOf(page.params.network));
	let other = $derived(otherNet(net));
</script>

<!--
	The way from the practice book to the diary, and back. The way is only
	offered once there is something at the end of it; and where this network has
	no Vellum yet, the page says so itself and has already pointed across.
-->
{#if net.practice}
	<p class="elsewhere">
		This is the practice book. Nothing here costs money, and a testnet does not keep things for
		good.
		{#if other.vellum}
			<a href={homePath(other)}>Write for keeps on {other.chain.name} →</a>
		{:else}
			{BRAND} on {other.chain.name}, where a page is kept for good, opens soon.
		{/if}
	</p>
{:else if net.vellum && other.vellum}
	<p class="elsewhere">
		Rather try it first?
		<a href={homePath(other)}>The practice book on {other.chain.name} is free →</a>
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

	a:hover {
		color: var(--gold-strong);
	}
</style>
