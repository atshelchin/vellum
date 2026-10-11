<script lang="ts">
	import type { Reader } from '#lib/book/reader.svelte.ts';
	import { dateParts } from '#lib/format.ts';

	let { reader }: { reader: Reader } = $props();

	let count = $derived(reader.diary.entries);
	let where = $derived(
		reader.atStart
			? 'Title page'
			: reader.atEnd
				? 'The last page'
				: `Entry ${reader.place.entry + 1} of ${count}`
	);
	let when = $derived(reader.entry ? dateParts(reader.entry.writtenAt).day : '');
</script>

<nav aria-label="Pages">
	<button
		class="turn"
		onclick={() => reader.step(-1)}
		disabled={reader.atStart}
		aria-label="Previous page"
	>
		<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
			<path
				d="M15 5l-7 7 7 7"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>

	<div class="where">
		<p aria-live="polite">
			<b>{where}</b>
			{#if when}<span>{when}</span>{/if}
			{#if reader.loading > 0}<i class="reading" title="Reading from the chain"></i>{/if}
		</p>
		{#if count > 3}
			<!-- One stop before the first entry for the title page, and one after the last. -->
			<input
				type="range"
				min="-1"
				max={count}
				step="1"
				value={reader.place.entry}
				onchange={(event) => reader.goTo(Number(event.currentTarget.value))}
				aria-label="Go to an entry"
			/>
		{/if}
	</div>

	<button
		class="turn"
		onclick={() => reader.step(1)}
		disabled={reader.atEnd}
		aria-label="Next page"
	>
		<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
			<path
				d="M9 5l7 7-7 7"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>
</nav>

<style>
	nav {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px;
		border: 1px solid var(--border-strong);
		border-radius: 999px;
		background: rgb(20 16 13 / 0.72);
		backdrop-filter: blur(14px);
	}

	.turn {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		flex: none;
		border: 0;
		border-radius: 50%;
		background: rgb(255 240 215 / 0.07);
		cursor: pointer;
		transition: background 0.15s;
	}

	.turn:hover:not(:disabled) {
		background: rgb(255 240 215 / 0.15);
	}

	.turn:disabled {
		opacity: 0.35;
		cursor: default;
	}

	.where {
		display: grid;
		gap: 4px;
		/* Takes whatever the bar has to give, so the two buttons sit at its ends. */
		flex: 1;
		min-width: 190px;
		padding: 0 6px;
		text-align: center;
	}

	p {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 8px;
		font-size: 13px;
		white-space: nowrap;
	}

	b {
		font-weight: 600;
	}

	span {
		color: var(--fg-muted);
	}

	.reading {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--gold);
		animation: beat 0.9s ease-in-out infinite;
	}

	input {
		width: 100%;
		height: 14px;
		margin: 0;
		accent-color: var(--gold);
		cursor: pointer;
	}

	@keyframes beat {
		50% {
			opacity: 0.25;
		}
	}

	@media (max-width: 520px) {
		.where {
			min-width: 0;
		}

		p {
			flex-wrap: wrap;
			gap: 0 8px;
		}
	}
</style>
