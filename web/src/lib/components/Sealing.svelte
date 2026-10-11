<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { SEAL_EDGE, SEAL_V } from '#lib/seal.ts';
	import { sound } from '#lib/sound.svelte.ts';

	let {
		phase,
		waiting,
		sent,
		sealed,
		kept,
		onstruck,
		ondone
	}: {
		/**
		 * Where the sealing has got to: the wax is poured while the wallet is
		 * asked, it stays warm while the chain is read, and the seal goes into it
		 * only once the page is known to be on the chain.
		 */
		phase: 'wax' | 'sent' | 'sealed';
		/** What is said under the wax while the wallet is asked. */
		waiting: string;
		/** What is said once the wallet has answered. */
		sent: string;
		/** What is said under the seal: which page it is. */
		sealed: string;
		/** And where it is kept. */
		kept: string;
		/** The die has met the wax. */
		onstruck?: () => void;
		/** The seal has been pressed and looked at. */
		ondone: () => void;
	} = $props();

	const id = $props.id();

	/** How long after the die starts down it meets the wax. */
	const IMPACT = 300;
	/** How long the seal is left to be looked at before the page is put away. */
	const ADMIRED = 2300;

	/** The die has met the wax: the pool is a seal from here on. */
	let struck = $state(false);

	// Drops thrown out from under the die, each its own way. Set once: the same
	// press always throws the same drops, and nothing is worked out while it moves.
	const drops = Array.from({ length: 11 }, (_, index) => {
		const turn = (index / 11) * Math.PI * 2 + (index % 3) * 0.21;
		const reach = 62 + ((index * 37) % 34);
		return {
			x: Math.round(Math.cos(turn) * reach),
			y: Math.round(Math.sin(turn) * reach),
			size: 4 + ((index * 5) % 5),
			delay: (index % 4) * 18
		};
	});

	onMount(() => sound.pour());

	$effect(() => {
		if (phase !== 'sealed') return;
		const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const strike = setTimeout(
			() => {
				struck = true;
				onstruck?.();
				sound.seal();
				// A phone that can be felt is felt: one short knock.
				navigator.vibrate?.(28);
			},
			calm ? 0 : IMPACT
		);
		const done = setTimeout(ondone, ADMIRED);
		return () => {
			clearTimeout(strike);
			clearTimeout(done);
		};
	});
</script>

<!--
	Sealing a page, as it is done with wax. It is poured the moment the seal is
	asked for and kept warm for as long as the wallet and the chain take. The die
	comes down only when the page is on the chain, so the seal is never a promise:
	if it is there, the page is. If the wallet says no, or the chain does not
	answer, the wax is lifted off and the page is as it was.
-->
<div
	class="sealing"
	class:sealed={phase === 'sealed'}
	class:struck
	role="status"
	out:fade|global={{ duration: 260 }}
>
	<div class="wax">
		<span class="stream"></span>
		<span class="glow"></span>
		<span class="pool"></span>

		<svg class="mark" viewBox="0 0 64 64" aria-hidden="true">
			<defs>
				<radialGradient id="{id}-wax" cx="36%" cy="30%" r="78%">
					<stop offset="0" stop-color="#e45d4f" />
					<stop offset="0.52" stop-color="#b22d24" />
					<stop offset="1" stop-color="#6f1512" />
				</radialGradient>
				<radialGradient id="{id}-shine" cx="31%" cy="24%" r="36%">
					<stop offset="0" stop-color="#fff1e9" stop-opacity="0.55" />
					<stop offset="1" stop-color="#fff1e9" stop-opacity="0" />
				</radialGradient>
			</defs>
			<path d={SEAL_EDGE} fill="#3a0806" opacity="0.45" transform="translate(1 2.2)" />
			<path d={SEAL_EDGE} fill="url(#{id}-wax)" />
			<circle
				cx="32"
				cy="32"
				r="19.4"
				fill="none"
				stroke="#4d0b09"
				stroke-opacity="0.55"
				stroke-width="2.2"
			/>
			<circle
				cx="32.6"
				cy="32.8"
				r="19.4"
				fill="none"
				stroke="#ffb7a3"
				stroke-opacity="0.34"
				stroke-width="0.9"
			/>
			<path d={SEAL_V} fill="#ffb7a3" fill-opacity="0.36" transform="translate(0.7 0.9)" />
			<path d={SEAL_V} fill="#560d0a" fill-opacity="0.78" />
			<path d={SEAL_EDGE} fill="url(#{id}-shine)" />
		</svg>

		<span class="ring"></span>
		{#each drops as drop, at (at)}
			<i
				style:--x="{drop.x}px"
				style:--y="{drop.y}px"
				style:--size="{drop.size}px"
				style:--delay="{drop.delay}ms"
			></i>
		{/each}
		<span class="die"></span>
	</div>

	{#key struck ? 'sealed' : phase}
		<div class="words">
			{#if struck}
				<p class="says done">Sealed</p>
				<p class="sub">{sealed}</p>
				<p class="sub kept">{kept}</p>
			{:else if phase === 'wax'}
				<p class="says">Warming the wax…</p>
				<p class="sub">{waiting}</p>
			{:else}
				<p class="says">The wax is ready…</p>
				<p class="sub">{sent}</p>
			{/if}
		</div>
	{/key}
</div>

<style>
	.sealing {
		--wax: 124px;
		position: absolute;
		z-index: 3;
		inset: 0;
		display: grid;
		align-content: center;
		justify-items: center;
		gap: 30px;
		padding: 24px;
		border-radius: inherit;
		/* The page goes pale behind it: still there, no longer what is looked at. */
		background: radial-gradient(
			120% 95% at 50% 52%,
			rgb(244 236 217 / 0.97) 28%,
			rgb(244 236 217 / 0.8) 72%,
			rgb(244 236 217 / 0.7)
		);
		text-align: center;
		animation: veil 0.45s ease both;
	}

	.wax {
		position: relative;
		width: var(--wax);
		height: var(--wax);
	}

	.wax > * {
		position: absolute;
	}

	/* The thread of wax that falls from the stick, and thins out as the pool fills. */
	.stream {
		left: 50%;
		bottom: 50%;
		width: 7px;
		height: 150px;
		margin-left: -3.5px;
		border-radius: 4px 4px 2px 2px;
		background: linear-gradient(#b22d24, #e8573f 70%, #ff9a6b);
		transform-origin: 50% 0;
		animation: fall 1.25s cubic-bezier(0.5, 0, 0.7, 1) both;
	}

	/* The heat of it, on the paper round about. */
	.glow {
		inset: -26%;
		border-radius: 50%;
		background: radial-gradient(closest-side, rgb(255 120 60 / 0.42), transparent);
		animation:
			arrive 1.1s 0.2s ease both,
			breathe 2.2s 1.3s ease-in-out infinite;
	}

	/* Wax that has not set: it has no edge of its own yet, and keeps moving. */
	.pool {
		inset: 4%;
		border-radius: 58% 42% 47% 53% / 46% 55% 45% 54%;
		/* It lies flat: lit across the top, darker where it thins at the rim, and
		   catching the lamp in two places, as anything wet does. */
		background:
			radial-gradient(22% 9% at 36% 22%, rgb(255 240 226 / 0.9), transparent),
			radial-gradient(9% 5% at 62% 30%, rgb(255 240 226 / 0.6), transparent),
			radial-gradient(70% 60% at 42% 34%, rgb(255 150 110 / 0.5), transparent 70%),
			radial-gradient(circle at 50% 50%, #e2513c 0%, #d2402f 52%, #b22d24 80%, #861b15 100%);
		box-shadow:
			0 5px 12px rgb(110 22 10 / 0.38),
			inset 0 0 0 1.5px rgb(255 170 140 / 0.22),
			inset 0 -6px 12px rgb(84 12 8 / 0.42);
		animation:
			pour 1.2s 0.18s cubic-bezier(0.2, 0.8, 0.2, 1) both,
			molten 3.6s 1.4s ease-in-out infinite;
	}

	/* Where it ran a little further than the rest. */
	.pool::before,
	.pool::after {
		content: '';
		position: absolute;
		border-radius: 50%;
		background: radial-gradient(circle at 40% 34%, #dc4a37, #a82820);
		box-shadow: inset 0 -2px 4px rgb(84 12 8 / 0.4);
	}

	.pool::before {
		right: 1%;
		bottom: 9%;
		width: 22%;
		height: 20%;
	}

	.pool::after {
		top: 16%;
		left: -3%;
		width: 15%;
		height: 17%;
	}

	.mark {
		inset: -4%;
		width: 108%;
		height: 108%;
		opacity: 0;
		filter: drop-shadow(0 5px 9px rgb(70 12 8 / 0.45));
	}

	/* The die: brass, seen from above, larger than the wax it comes down on. */
	.die {
		inset: -14%;
		border-radius: 50%;
		background:
			radial-gradient(circle at 50% 50%, transparent 58%, rgb(60 40 10 / 0.5) 60%, transparent 66%),
			radial-gradient(circle at 34% 28%, #fbeab0, #cfa446 42%, #8a6420 78%, #5c4012);
		box-shadow: 0 22px 40px rgb(30 18 6 / 0.5);
		opacity: 0;
	}

	.ring {
		inset: -6%;
		border: 2px solid rgb(201 152 58 / 0.9);
		border-radius: 50%;
		opacity: 0;
	}

	i {
		top: 50%;
		left: 50%;
		width: var(--size);
		height: var(--size);
		margin: calc(var(--size) / -2) 0 0 calc(var(--size) / -2);
		border-radius: 50%;
		background: radial-gradient(circle at 36% 30%, #e45d4f, #9c231c);
		opacity: 0;
	}

	/* The page is on the chain. The die comes down, and what it leaves is the seal. */
	.sealed .die {
		animation: press 0.95s cubic-bezier(0.5, 0, 0.3, 1) both;
	}

	.struck .stream,
	.struck .pool {
		animation: none;
		opacity: 0;
	}

	.struck .glow {
		animation: cool 1.6s ease both;
	}

	.struck .mark {
		opacity: 1;
		animation: squash 0.6s cubic-bezier(0.2, 0.9, 0.3, 1.5) both;
	}

	.struck .ring {
		animation: ripple 0.85s ease-out both;
	}

	.struck i {
		animation: fly 0.62s var(--delay) cubic-bezier(0.1, 0.7, 0.3, 1) both;
	}

	.words {
		display: grid;
		gap: 5px;
		max-width: 420px;
		animation: speak 0.5s ease both;
	}

	/* Said once the die is out of the way, and there is a seal to say it of. */
	.struck .words {
		animation-delay: 0.42s;
	}

	.says {
		color: #6f4428;
		font-family: var(--serif);
		font-size: 27px;
		font-style: italic;
		font-weight: 500;
		line-height: 1.15;
	}

	.says.done {
		color: var(--ink);
		font-size: 38px;
		font-style: normal;
		font-weight: 600;
		letter-spacing: 0.01em;
	}

	.sub {
		color: rgb(111 68 40 / 0.85);
		font-size: 14px;
		line-height: 1.45;
	}

	.kept {
		font-family: var(--serif);
		font-size: 18px;
		font-style: italic;
	}

	@keyframes veil {
		from {
			opacity: 0;
		}
	}

	@keyframes fall {
		0% {
			transform: scaleY(0);
		}
		18% {
			transform: scaleY(1);
		}
		70% {
			transform: scale(0.8, 1);
			opacity: 1;
		}
		100% {
			transform: scale(0, 1);
			opacity: 0;
		}
	}

	@keyframes pour {
		from {
			transform: scale(0.08);
			opacity: 0.6;
		}
	}

	@keyframes molten {
		0%,
		100% {
			border-radius: 58% 42% 47% 53% / 46% 55% 45% 54%;
			transform: scale(1);
		}
		33% {
			border-radius: 47% 53% 56% 44% / 55% 47% 53% 45%;
			transform: scale(1.03, 0.98);
		}
		66% {
			border-radius: 54% 46% 44% 56% / 44% 56% 48% 52%;
			transform: scale(0.98, 1.025);
		}
	}

	@keyframes arrive {
		from {
			opacity: 0;
			transform: scale(0.4);
		}
	}

	@keyframes breathe {
		50% {
			opacity: 0.55;
			transform: scale(0.94);
		}
	}

	@keyframes cool {
		to {
			opacity: 0;
		}
	}

	/* Down, held hard for a moment, and lifted clear. */
	@keyframes press {
		0% {
			opacity: 0;
			transform: translateY(-46px) scale(2.3);
		}
		31% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
		46% {
			opacity: 1;
			transform: translateY(0) scale(0.955);
		}
		58% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
		100% {
			opacity: 0;
			transform: translateY(-40px) scale(2);
		}
	}

	@keyframes squash {
		0% {
			transform: scale(1.22);
		}
		45% {
			transform: scale(0.95);
		}
	}

	@keyframes ripple {
		0% {
			opacity: 0.85;
			transform: scale(0.7);
		}
		100% {
			opacity: 0;
			transform: scale(2.1);
		}
	}

	@keyframes fly {
		0% {
			opacity: 1;
			transform: translate(0, 0) scale(1);
		}
		100% {
			opacity: 0;
			transform: translate(var(--x), var(--y)) scale(0.3);
		}
	}

	@keyframes speak {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
	}

	@media (max-width: 640px), (max-height: 500px) {
		.sealing {
			--wax: 104px;
			gap: 24px;
			padding: 16px;
		}

		.stream {
			height: 110px;
		}

		.says {
			font-size: 23px;
		}

		.says.done {
			font-size: 32px;
		}
	}

	/* Nothing pours and nothing falls: the wax is there, and then the seal is. */
	@media (prefers-reduced-motion: reduce) {
		.sealing,
		.stream,
		.glow,
		.pool,
		.words,
		.sealed .die,
		.struck .mark,
		.struck .ring,
		.struck i {
			animation: none !important;
		}

		.stream,
		.die,
		.ring,
		i {
			display: none;
		}
	}
</style>
