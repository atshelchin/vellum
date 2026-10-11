<script lang="ts">
	let { size = 30 }: { size?: number } = $props();

	// More than one of these can be on a page, and a gradient is found by its
	// name: each seal has its own.
	const id = $props.id();
</script>

<!-- Vellum's mark: the seal pressed into the wax on every entry. -->
<svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
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
	<path
		d="M61.84 32.00 L62.13 34.64 L61.63 37.22 L60.38 39.60 L58.70 41.72 L57.02 43.67 L55.59 45.62 L54.44 47.71 L53.36 49.92 L52.08 52.08 L50.43 53.97 L48.45 55.50 L46.29 56.74 L44.08 57.90 L41.87 59.11 L39.59 60.33 L37.17 61.34 L34.61 61.80 L32.00 61.53 L29.50 60.59 L27.18 59.33 L24.99 58.15 L22.78 57.32 L20.43 56.82 L17.92 56.39 L15.42 55.68 L13.14 54.47 L11.24 52.76 L9.68 50.73 L8.31 48.59 L6.96 46.46 L5.62 44.30 L4.46 42.02 L3.73 39.58 L3.59 37.01 L4.00 34.45 L4.64 32.00 L5.15 29.65 L5.30 27.29 L5.13 24.80 L4.95 22.16 L5.18 19.49 L6.05 17.02 L7.58 14.90 L9.54 13.15 L11.63 11.63 L13.67 10.15 L15.65 8.64 L17.69 7.21 L19.90 6.06 L22.30 5.35 L24.79 5.08 L27.24 5.01 L29.62 4.82 L32.00 4.33 L34.48 3.61 L37.11 3.00 L39.80 2.90 L42.35 3.57 L44.60 4.98 L46.52 6.85 L48.23 8.83 L49.91 10.66 L51.68 12.32 L53.50 13.96 L55.16 15.78 L56.50 17.86 L57.46 20.13 L58.21 22.46 L58.98 24.77 L59.93 27.08 L60.98 29.46 Z"
		fill="url(#{id}-wax)"
	/>
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
	<path
		d="M19.6 20.6h10.2v1.7l-2.9.6 6.4 15.7 6-15.5-3.1-.8v-1.7h8.3v1.7l-2.5.7-9.5 22.9h-2.1L22.3 22.9l-2.7-.6z"
		fill="#ffb7a3"
		fill-opacity="0.36"
		transform="translate(0.7 0.9)"
	/>
	<path
		d="M19.6 20.6h10.2v1.7l-2.9.6 6.4 15.7 6-15.5-3.1-.8v-1.7h8.3v1.7l-2.5.7-9.5 22.9h-2.1L22.3 22.9l-2.7-.6z"
		fill="#560d0a"
		fill-opacity="0.78"
	/>
	<path
		d="M61.84 32.00 L62.13 34.64 L61.63 37.22 L60.38 39.60 L58.70 41.72 L57.02 43.67 L55.59 45.62 L54.44 47.71 L53.36 49.92 L52.08 52.08 L50.43 53.97 L48.45 55.50 L46.29 56.74 L44.08 57.90 L41.87 59.11 L39.59 60.33 L37.17 61.34 L34.61 61.80 L32.00 61.53 L29.50 60.59 L27.18 59.33 L24.99 58.15 L22.78 57.32 L20.43 56.82 L17.92 56.39 L15.42 55.68 L13.14 54.47 L11.24 52.76 L9.68 50.73 L8.31 48.59 L6.96 46.46 L5.62 44.30 L4.46 42.02 L3.73 39.58 L3.59 37.01 L4.00 34.45 L4.64 32.00 L5.15 29.65 L5.30 27.29 L5.13 24.80 L4.95 22.16 L5.18 19.49 L6.05 17.02 L7.58 14.90 L9.54 13.15 L11.63 11.63 L13.67 10.15 L15.65 8.64 L17.69 7.21 L19.90 6.06 L22.30 5.35 L24.79 5.08 L27.24 5.01 L29.62 4.82 L32.00 4.33 L34.48 3.61 L37.11 3.00 L39.80 2.90 L42.35 3.57 L44.60 4.98 L46.52 6.85 L48.23 8.83 L49.91 10.66 L51.68 12.32 L53.50 13.96 L55.16 15.78 L56.50 17.86 L57.46 20.13 L58.21 22.46 L58.98 24.77 L59.93 27.08 L60.98 29.46 Z"
		fill="url(#{id}-shine)"
	/>
</svg>

<style>
	svg {
		flex: none;
		/* Wax stands a little proud of whatever it is on. */
		filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.45));
	}
</style>
