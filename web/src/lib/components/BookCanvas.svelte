<script lang="ts">
	import { onMount } from 'svelte';
	import { WAITING } from '#lib/book/faces.ts';
	import { faceReady, fontsReady } from '#lib/book/paint.ts';
	import type { Reader } from '#lib/book/reader.svelte.ts';
	import type { Binding, BookStage } from '#lib/book/Stage.ts';
	import { penNameOf } from '#lib/format.ts';
	import { sound } from '#lib/sound.svelte.ts';

	let {
		binding,
		reader,
		open = false,
		shift = 0,
		insets = { top: 0, bottom: 0 },
		readingInsets,
		stage = $bindable(),
		unavailable = $bindable(false)
	}: {
		/** What is on the boards. */
		binding: Binding;
		/** Who is reading, if anyone: without one the book stays shut. */
		reader?: Reader;
		/** Whether the book starts lying open. */
		open?: boolean;
		shift?: number;
		insets?: { top: number; bottom: number };
		/** The insets the book is read at, when it is sometimes shown smaller to make room. */
		readingInsets?: { top: number; bottom: number };
		stage?: BookStage;
		/** Set when the browser cannot draw the book at all. */
		unavailable?: boolean;
	} = $props();

	let canvas: HTMLCanvasElement;
	let shown = $state(false);

	onMount(() => {
		let gone = false;
		let instance: BookStage | undefined;
		// Everything written on the book before a page of it is turned: the title
		// on its boards, and the name on the plate inside them.
		const written = `${binding.title} ${reader ? penNameOf(reader.diary) : ''}`;
		// three.js is most of this site's weight, and the writing has to be
		// drawn in faces that arrive on their own time. Both are waited for
		// together, and the page is readable meanwhile.
		Promise.all([
			import('#lib/book/Stage.ts'),
			fontsReady(written),
			reader ? faceReady(reader.diary.owner) : undefined
		]).then(([{ BookStage }]) => {
			if (gone) return;
			try {
				instance = new BookStage(canvas, {
					binding,
					spread: { key: 'waiting', left: WAITING, right: WAITING, progress: 0 },
					open,
					insets,
					readingInsets,
					shift,
					onLayout: (metrics) => reader?.relayout(metrics),
					onTurn: () => sound.turn()
				});
			} catch (error) {
				console.error('The book could not be drawn', error);
				unavailable = true;
				return;
			}
			reader?.attach(instance);
			stage = instance;
			shown = true;
		});
		return () => {
			gone = true;
			reader?.detach();
			instance?.dispose();
			stage = undefined;
		};
	});

	$effect(() => {
		stage?.setBinding(binding);
	});

	$effect(() => {
		stage?.setInsets(insets);
	});
</script>

<!-- With no book to draw, the canvas steps aside for whatever the page shows in its place. -->
<canvas bind:this={canvas} class:shown hidden={unavailable} aria-hidden="true"></canvas>

<style>
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		/* The book takes every gesture made on it: a page is turned by dragging it. */
		touch-action: none;
		opacity: 0;
		transition: opacity 0.6s ease;
		-webkit-tap-highlight-color: transparent;
	}

	canvas.shown {
		opacity: 1;
	}
</style>
