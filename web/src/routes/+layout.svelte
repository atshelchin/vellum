<script lang="ts">
	import '@fontsource-variable/inter';
	import '@fontsource-variable/cormorant-garamond';
	import '@fontsource-variable/cormorant-garamond/wght-italic.css';
	import '@fontsource-variable/literata/wght.css';
	import '@fontsource-variable/literata/wght-italic.css';
	import '../app.css';
	import { onMount } from 'svelte';
	import { dev } from '$app/env';
	import { page } from '$app/state';
	import favicon from '#lib/assets/favicon.svg';
	import { BRAND, MAKER_ON_X } from '#lib/brand.ts';
	import { NETS, netOf } from '#lib/chain.ts';
	import ConnectModal from '#lib/components/ConnectModal.svelte';
	import Header from '#lib/components/Header.svelte';
	import { wallet } from '#lib/wallet.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	// Which network a page is on is said by its address, and by nothing else.
	let net = $derived(netOf(page.params.network));

	// The wallet's balance and standing are read on whichever network that is.
	$effect(() => wallet.use(net));

	// What a link to this page shows when it is shared. A page that knows
	// better — a diary — returns its own from `load`.
	let card = $derived(
		page.data.card ??
			(net.practice
				? {
						title: `${BRAND} — the practice book`,
						description: `Try ${BRAND}, the diary kept on Ethereum, on ${net.chain.name} first: turn its pages, write one, and it costs nothing. For Vela Wallet.`,
						image: '/card.png'
					}
				: {
						title: `${BRAND} — a diary kept on Ethereum`,
						description:
							'A diary you turn page by page, written on Ethereum and kept there for good. For Vela Wallet.',
						image: '/card.png'
					})
	);

	onMount(async () => {
		// In development, `?mock=<account>` puts a pretend Vela Wallet in the page,
		// for a local fork. A built site has no such door: see lib/dev/mock-vela.ts.
		if (dev) {
			const mock = page.url.searchParams.get('mock');
			if (mock && /^0x[0-9a-fA-F]{40}$/.test(mock)) {
				const { installMockVela } = await import('#lib/dev/mock-vela.ts');
				// The fork it stands in for is a fork of the practice book's chain.
				installMockVela(
					mock,
					NETS.testnet.chain.rpcUrls.default.http[0],
					NETS.testnet.chain.id,
					page.url.searchParams.get('mock-mode')
				);
			}
		}
		wallet.discover();
	});
</script>

<svelte:head>
	<meta name="description" content={card.description} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={BRAND} />
	<meta property="og:title" content={card.title} />
	<meta property="og:description" content={card.description} />
	<meta property="og:url" content={page.url.href} />
	<meta property="og:image" content="{page.url.origin}{card.image}" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:site" content={MAKER_ON_X} />
	<link rel="icon" href={favicon} />
</svelte:head>

<Header />
{@render children()}
<ConnectModal />
