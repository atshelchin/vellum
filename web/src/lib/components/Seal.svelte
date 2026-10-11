<script lang="ts">
	import { SEAL_EDGE, SEAL_V } from '#lib/seal.ts';

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

<style>
	svg {
		flex: none;
		/* Wax stands a little proud of whatever it is on. */
		filter: drop-shadow(0 2px 3px rgb(0 0 0 / 0.45));
	}
</style>
