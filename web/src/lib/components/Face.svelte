<script lang="ts">
	let { address, size = 24 }: { address: string; size?: number } = $props();

	let svg = $state('');

	// Every face there could be is drawn from one set of parts, and the set is a
	// hundred kilobytes: it is fetched when there is a face to show, not before.
	$effect(() => {
		const whose = address;
		let gone = false;
		void import('#lib/identicon.ts').then(({ identiconSvg }) => {
			if (!gone) svg = identiconSvg(whose);
		});
		return () => {
			gone = true;
		};
	});
</script>

<!-- An account's face: the one Vela Wallet shows for it. See `lib/identicon.ts`. -->
<span class="face" style:width="{size}px" style:height="{size}px" aria-hidden="true">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- drawn here from an address, out of the library's own shapes: nothing anyone wrote is in it -->
	{@html svg}
</span>

<style>
	.face {
		display: block;
		flex: none;
		border-radius: 50%;
		background: rgb(255 240 215 / 0.08);
		box-shadow: 0 0 0 1px rgb(255 240 215 / 0.14);
		overflow: hidden;
	}

	.face :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
