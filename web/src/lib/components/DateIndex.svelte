<script lang="ts">
	import { tick, untrack } from 'svelte';
	import {
		dayKey,
		dayOf,
		daysWritten,
		monthDays,
		yearsOf,
		type Written
	} from '#lib/book/calendar.ts';
	import type { Reader } from '#lib/book/reader.svelte.ts';
	import { plural } from '#lib/format.ts';

	let {
		reader,
		open = $bindable(false),
		onpick
	}: {
		reader: Reader;
		open?: boolean;
		/** A day was chosen: the first entry written on it, by its place in the diary. */
		onpick: (entry: number) => void;
	} = $props();

	const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'long' });
	const DAY = new Intl.DateTimeFormat('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});
	const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

	let dialog: HTMLDialogElement;
	let sheet = $state<HTMLElement>();
	let leaves = $state<HTMLElement>();
	let now = $state(Math.floor(Date.now() / 1000));
	let year = $state(dayOf(Math.floor(Date.now() / 1000)).year);
	/** The reader has turned to a year themselves: it is not chosen for them again. */
	let chosen = false;

	let times = $derived(reader.times ?? []);
	let days = $derived(daysWritten(times));
	let years = $derived(yearsOf(reader.diary.createdAt, times, now));
	let today = $derived(dayOf(now));
	/** The day of the entry the book lies open at. */
	let here = $derived(reader.entry ? dayOf(reader.entry.writtenAt) : undefined);

	let months = $derived(
		Array.from({ length: 12 }, (_, month) => {
			let entries = 0;
			const cells = monthDays(year, month).map((date) => {
				if (date === null) return null;
				const written = days.get(dayKey({ year, month, date }));
				entries += written?.count ?? 0;
				const said = DAY.format(new Date(year, month, date));
				return {
					date,
					written,
					today: today.year === year && today.month === month && today.date === date,
					here: here?.year === year && here.month === month && here.date === date,
					label: written ? `${said}: ${plural(written.count, 'entry', 'entries')}` : said
				};
			});
			const name = MONTH.format(new Date(year, month, 1));
			return { month, name, cells, entries };
		})
	);

	let tally = $derived.by(() => {
		let entries = 0;
		let written = 0;
		for (const month of months) {
			entries += month.entries;
			written += month.cells.filter((cell) => cell?.written).length;
		}
		return { entries, days: written };
	});

	/** The month the eye should land on: where the book is open, or the last one written in, or this one. */
	function landing(): number | undefined {
		if (here?.year === year) return here.month;
		const last = months.findLast((month) => month.entries > 0);
		if (last) return last.month;
		return today.year === year ? today.month : undefined;
	}

	/** Brings a month to the middle of what can be seen, where the year is longer than the screen. */
	function bring(month = landing(), smooth = false) {
		const leaf =
			month === undefined ? null : leaves?.querySelector<HTMLElement>(`[data-month="${month}"]`);
		if (!leaves || !leaf) return;
		leaves.scrollTo({
			top: leaf.offsetTop - Math.max(0, (leaves.clientHeight - leaf.offsetHeight) / 2),
			behavior: smooth ? 'smooth' : 'instant'
		});
	}

	function turn(by: number) {
		const to = Math.min(Math.max(year + by, years[0]), years[years.length - 1]);
		if (to === year) return;
		chosen = true;
		year = to;
		void tick().then(() => bring());
	}

	function pick(written: Written) {
		dialog.close();
		onpick(written.first);
	}

	$effect(() => {
		if (open && !dialog.open) {
			now = Math.floor(Date.now() / 1000);
			chosen = false;
			const last = reader.times?.at(-1);
			year = here?.year ?? (last === undefined ? dayOf(now).year : dayOf(last).year);
			void reader.readTimes();
			dialog.showModal();
			// A dialog gives itself to the first thing in it that can be pressed, which
			// is the way out. What the reader came for is the day they are on.
			(dialog.querySelector<HTMLElement>('.here') ?? sheet)?.focus({ preventScroll: true });
			void tick().then(() => bring());
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	// The dates can arrive after the calendar is open, and the year takes its
	// shape from them. If the book is not open at an entry, it is the year last
	// written in that the reader will want; either way the month that matters
	// is brought back to where it can be seen.
	$effect(() => {
		const last = reader.times?.at(-1);
		if (!open || last === undefined) return;
		untrack(() => {
			if (!chosen && !here) year = dayOf(last).year;
		});
		void tick().then(() => {
			bring();
			// Nothing has been reached for yet: the day the book is open at is the place to start from.
			if (document.activeElement === sheet) {
				dialog.querySelector<HTMLElement>('.here')?.focus({ preventScroll: true });
			}
		});
	});

	function onkeydown(event: KeyboardEvent) {
		if (event.metaKey || event.ctrlKey || event.altKey) return;
		if (event.key === 'ArrowLeft') turn(-1);
		else if (event.key === 'ArrowRight') turn(1);
		else return;
		event.preventDefault();
	}
</script>

<!--
	A diary by its dates: a year on one sheet, and a seal on every day that has
	something written on it. Pressing a seal opens the book at that day. It is
	put away until it is asked for, and put away again the moment a day is
	chosen.
-->
<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	onclick={(event) => event.target === dialog && dialog.close()}
	{onkeydown}
	aria-labelledby="index-year"
>
	<div class="sheet" bind:this={sheet} tabindex="-1">
		<header>
			<p class="tally" aria-live="polite">
				{#if reader.times}
					{#if tally.entries === 0}
						Nothing written in {year}
					{:else}
						{plural(tally.entries, 'entry', 'entries')} on {plural(tally.days, 'day')}
					{/if}
				{:else if reader.timesFailed}
					The dates could not be read.
					<button type="button" class="again" onclick={() => reader.readTimes()}>Try again</button>
				{:else}
					<span class="reading">Reading the dates…</span>
				{/if}
			</p>

			<div class="year">
				<button
					type="button"
					class="round"
					onclick={() => turn(-1)}
					disabled={year <= years[0]}
					aria-label="The year before"
				>
					<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
						<path d="M15 5l-7 7 7 7" />
					</svg>
				</button>
				<h2 id="index-year">{year}</h2>
				<button
					type="button"
					class="round"
					onclick={() => turn(1)}
					disabled={year >= years[years.length - 1]}
					aria-label="The year after"
				>
					<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
						<path d="M9 5l7 7-7 7" />
					</svg>
				</button>
			</div>

			<button type="button" class="round close" onclick={() => dialog.close()} aria-label="Close">
				<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>

			<!-- Where the year is longer than the screen: the twelve months at a glance, and a way to each. -->
			<nav class="strip" aria-label="Months">
				{#each months as month (month.month)}
					<button
						type="button"
						class:kept={month.entries > 0}
						onclick={() => bring(month.month, true)}
						aria-label={month.entries > 0
							? `${month.name}: ${plural(month.entries, 'entry', 'entries')}`
							: month.name}
					>
						{month.name[0]}
					</button>
				{/each}
			</nav>
		</header>

		<div class="months" bind:this={leaves}>
			{#each months as month (month.month)}
				<section
					data-month={month.month}
					class:bare={month.entries === 0}
					style:--m={month.month}
					aria-label="{month.name} {year}"
				>
					<h3>
						{month.name}
						{#if month.entries > 0}<span>{month.entries}</span>{/if}
					</h3>
					<div class="week" aria-hidden="true">
						{#each WEEK as letter, at (at)}<span>{letter}</span>{/each}
					</div>
					<div class="days">
						{#each month.cells as cell, at (at)}
							{#if !cell}
								<span></span>
							{:else if cell.written}
								{@const written = cell.written}
								<button
									type="button"
									class="day written"
									class:here={cell.here}
									onclick={() => pick(written)}
									aria-label={cell.label}
									aria-current={cell.here ? 'date' : undefined}
									title={cell.label}
								>
									{cell.date}
									{#if written.count > 1}<i aria-hidden="true">{written.count}</i>{/if}
								</button>
							{:else}
								<span class="day" class:today={cell.today}>{cell.date}</span>
							{/if}
						{/each}
					</div>
				</section>
			{/each}
		</div>
	</div>
</dialog>

<style>
	dialog {
		width: min(1120px, calc(100vw - 48px));
		max-height: calc(100dvh - 48px);
		padding: 0;
		border: 0;
		border-radius: 10px;
		background: none;
		color: var(--ink);
		overflow: visible;
	}

	dialog::backdrop {
		background: rgb(8 6 4 / 0.8);
		backdrop-filter: blur(10px);
	}

	.sheet {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		max-height: inherit;
		border-radius: inherit;
		/* A leaf of the same paper the book is made of. */
		background:
			radial-gradient(120% 80% at 100% 100%, rgb(150 104 52 / 0.16), transparent 60%),
			radial-gradient(90% 60% at 0% 0%, rgb(255 255 255 / 0.3), transparent 70%), var(--paper);
		box-shadow:
			0 40px 90px rgb(0 0 0 / 0.7),
			0 0 0 1px rgb(120 90 50 / 0.3);
		outline: 0;
		overflow: hidden;
		animation: settle 0.3s cubic-bezier(0.2, 0.9, 0.3, 1);
	}

	header {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		gap: 8px;
		padding: 14px 16px 10px 28px;
	}

	.tally {
		color: rgb(111 68 40 / 0.85);
		font-family: var(--serif);
		font-size: 19px;
		font-style: italic;
	}

	.reading {
		animation: breathe 1.6s ease-in-out infinite;
	}

	.again {
		padding: 0;
		border: 0;
		background: none;
		color: #6f4428;
		font: inherit;
		font-weight: 600;
		text-decoration: underline;
		cursor: pointer;
	}

	.year {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	h2 {
		min-width: 3.2ch;
		color: #6f4428;
		font-size: 44px;
		font-weight: 600;
		line-height: 1;
		text-align: center;
	}

	.round {
		display: grid;
		place-items: center;
		width: 40px;
		height: 40px;
		flex: none;
		border: 0;
		border-radius: 50%;
		background: none;
		color: rgb(111 68 40 / 0.8);
		cursor: pointer;
		transition: background 0.15s;
	}

	.round:hover:not(:disabled) {
		background: rgb(111 68 40 / 0.1);
	}

	.round:disabled {
		opacity: 0.25;
		cursor: default;
	}

	.round path {
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.close {
		justify-self: end;
	}

	.strip {
		display: none;
	}

	.months {
		--columns: 4;
		position: relative;
		display: grid;
		grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
		align-content: start;
		gap: 20px 32px;
		padding: 8px 28px 26px;
		border-top: 1px solid rgb(111 68 40 / 0.22);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	h3 {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 0 4px 4px;
		color: #6f4428;
		font-size: 19px;
		font-weight: 600;
	}

	h3 span {
		color: rgb(111 68 40 / 0.6);
		font-family: var(--sans);
		font-size: 11px;
		font-weight: 600;
	}

	.bare h3 {
		color: rgb(111 68 40 / 0.5);
		font-weight: 500;
	}

	.week,
	.days {
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		justify-items: center;
	}

	.week {
		padding-bottom: 2px;
		color: rgb(111 68 40 / 0.45);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.04em;
	}

	.days {
		row-gap: 2px;
	}

	.day {
		--size: 28px;
		position: relative;
		display: grid;
		place-items: center;
		width: var(--size);
		height: var(--size);
		padding: 0;
		border: 0;
		border-radius: 50%;
		background: none;
		/* A day with nothing on it is only there to be counted past. */
		color: rgb(27 37 64 / 0.38);
		font-family: var(--serif);
		font-size: 15px;
		font-weight: 500;
		line-height: 1;
	}

	.today {
		box-shadow: inset 0 0 0 1px rgb(111 68 40 / 0.6);
		color: #6f4428;
		font-weight: 700;
	}

	/* A day with writing on it is sealed, in the same wax as everything else here. */
	.written {
		background: radial-gradient(circle at 36% 30%, #e45d4f, #b22d24 52%, #7a1814);
		box-shadow:
			0 1px 2px rgb(60 10 8 / 0.55),
			inset 0 0 0 1px rgb(255 183 163 / 0.22);
		color: #fff1e9;
		font-weight: 700;
		cursor: pointer;
		transition:
			transform 0.16s cubic-bezier(0.2, 0.9, 0.3, 1.4),
			box-shadow 0.16s;
		animation: stamp 0.36s cubic-bezier(0.2, 0.9, 0.3, 1.4) backwards;
		animation-delay: calc(var(--m) * 22ms);
	}

	.written:hover {
		box-shadow:
			0 4px 10px rgb(60 10 8 / 0.5),
			inset 0 0 0 1px rgb(255 183 163 / 0.3);
		transform: scale(1.16);
	}

	.written:active {
		transform: scale(0.94);
	}

	.written:focus-visible {
		outline: 2px solid var(--ink);
		outline-offset: 2px;
	}

	/* Where the book lies open. */
	.here {
		outline: 2px solid #b98a30;
		outline-offset: 2px;
	}

	/* More than one entry that day. */
	.day i {
		position: absolute;
		top: -4px;
		right: -5px;
		display: grid;
		place-items: center;
		min-width: 14px;
		height: 14px;
		padding: 0 3px;
		border-radius: 7px;
		background: var(--ink);
		color: var(--paper);
		font-family: var(--sans);
		font-size: 9px;
		font-style: normal;
		font-weight: 700;
	}

	@keyframes settle {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.985);
		}
	}

	@keyframes stamp {
		from {
			opacity: 0;
			transform: scale(0.3);
		}
	}

	@keyframes breathe {
		50% {
			opacity: 0.45;
		}
	}

	/* A wide screen that is not a tall one: the year in two rows instead of three. */
	@media (min-width: 1200px) and (max-height: 919px) {
		dialog {
			width: min(1480px, calc(100vw - 48px));
		}

		.months {
			--columns: 6;
			column-gap: 26px;
		}
	}

	@media (max-width: 1000px) {
		.months {
			--columns: 3;
			column-gap: 24px;
		}
	}

	/*
	 * A phone. The sheet comes up from the foot of the screen and the year runs
	 * down it, a month to a row, with days large enough for a thumb. A month
	 * with nothing in it is its name and no more, and the twelve letters at the
	 * top say which months those are.
	 */
	@media (max-width: 640px) {
		dialog {
			top: 0;
			left: 0;
			width: 100%;
			max-width: none;
			height: 100dvh;
			max-height: none;
			margin: 0;
			border-radius: 0;
		}

		dialog[open] {
			display: flex;
			flex-direction: column;
			justify-content: flex-end;
		}

		dialog::backdrop {
			background: rgb(8 6 4 / 0.6);
			backdrop-filter: blur(4px);
		}

		.sheet {
			max-height: 92%;
			border-radius: 22px 22px 0 0;
			box-shadow:
				0 -18px 50px rgb(0 0 0 / 0.55),
				0 0 0 1px rgb(120 90 50 / 0.3);
			animation: rise 0.32s cubic-bezier(0.2, 0.9, 0.3, 1);
		}

		header {
			grid-template-columns: 1fr auto;
			grid-template-areas:
				'year close'
				'tally tally'
				'strip strip';
			gap: 2px 8px;
			padding: 10px 10px 8px 14px;
		}

		.year {
			grid-area: year;
			margin-left: -8px;
		}

		h2 {
			font-size: 34px;
		}

		.close {
			grid-area: close;
		}

		.tally {
			grid-area: tally;
			padding-left: 4px;
			font-size: 17px;
		}

		.strip {
			grid-area: strip;
			display: grid;
			grid-template-columns: repeat(12, 1fr);
			padding-top: 6px;
		}

		.strip button {
			position: relative;
			height: 40px;
			padding: 0 0 8px;
			border: 0;
			background: none;
			color: rgb(27 37 64 / 0.38);
			font-family: var(--serif);
			font-size: 16px;
			font-weight: 600;
			cursor: pointer;
		}

		.strip .kept {
			color: #6f4428;
		}

		.strip .kept::after {
			content: '';
			position: absolute;
			left: 50%;
			bottom: 5px;
			width: 6px;
			height: 6px;
			border-radius: 50%;
			background: #b22d24;
			transform: translateX(-50%);
		}

		.months {
			--columns: 1;
			gap: 0;
			padding: 4px 14px calc(18px + env(safe-area-inset-bottom));
		}

		section {
			padding: 12px 0 14px;
			border-bottom: 1px solid rgb(111 68 40 / 0.14);
		}

		section:last-child {
			border-bottom: 0;
		}

		h3 {
			padding: 0 8px 6px;
			font-size: 22px;
		}

		h3 span {
			font-size: 12px;
		}

		.bare {
			padding: 9px 0;
		}

		.bare h3 {
			padding-bottom: 0;
			font-size: 18px;
		}

		.bare .week,
		.bare .days {
			display: none;
		}

		.week {
			font-size: 11px;
		}

		.days {
			row-gap: 4px;
		}

		.day {
			--size: 40px;
			font-size: 19px;
		}

		.day i {
			top: -3px;
			right: -4px;
			min-width: 16px;
			height: 16px;
			border-radius: 8px;
			font-size: 10px;
		}
	}

	@keyframes rise {
		from {
			transform: translateY(100%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet,
		.written,
		.reading {
			animation: none !important;
		}
	}
</style>
