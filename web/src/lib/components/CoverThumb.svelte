<script lang="ts">
	import { COVERS } from '#lib/book/covers.ts';
	import { fontsReady, paintCover } from '#lib/book/paint.ts';

	let { title, cover }: { title: string; cover: number } = $props();

	let canvas: HTMLCanvasElement;
	let style = $derived(COVERS[cover % COVERS.length]);

	// The same hand paints this as paints the board of the book itself, so a
	// diary on the shelf is the diary that opens.
	$effect(() => {
		const text = title;
		const which = cover;
		let stale = false;
		fontsReady(text).then(() => {
			if (!stale) paintCover(canvas, which, text);
		});
		return () => {
			stale = true;
		};
	});
</script>

<span class="book" style:--leather={style.leather}>
	<canvas bind:this={canvas} width="352" height="500" aria-hidden="true"></canvas>
</span>

<style>
	.book {
		position: relative;
		display: block;
		aspect-ratio: 352 / 500;
		border-radius: 3px 9px 9px 3px;
		background: var(--leather);
		box-shadow:
			0 1px 0 rgb(255 255 255 / 0.08) inset,
			0 22px 34px -18px rgb(0 0 0 / 0.75),
			0 4px 10px -4px rgb(0 0 0 / 0.5);
		transform-origin: 0 50%;
		transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1);
	}

	/* The block of pages, showing past the board at the fore-edge. */
	.book::before {
		content: '';
		position: absolute;
		z-index: -1;
		top: 2.2%;
		bottom: 2.2%;
		right: -5px;
		width: 12px;
		border-radius: 0 3px 3px 0;
		background: repeating-linear-gradient(90deg, #efe4cb 0 1px, #cdbf9f 1px 2px);
		box-shadow: 0 6px 12px -6px rgb(0 0 0 / 0.6);
	}

	/* The joint, where the board folds. */
	.book::after {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 4.5%;
		width: 2.2%;
		background: linear-gradient(90deg, rgb(0 0 0 / 0.32), rgb(255 255 255 / 0.07));
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: inherit;
	}
</style>
