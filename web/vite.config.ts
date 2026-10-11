import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';
import { SCRIPTS } from './src/lib/scripts.ts';
import { intersect, narrow } from './src/lib/unicode-range.ts';

/**
 * The faces for other writing (`src/lib/scripts.ts`) come with style sheets
 * that say which characters are in which file. Two things are put right in
 * those sheets as they are built in.
 *
 * Each face is kept to the writing it is there for. A face for one writing
 * always carries some of another: the Chinese one has a few dozen Korean
 * syllables, the Korean one a few hundred Chinese characters, and every one
 * of them has a Latin alphabet of its own. Left alone, a line comes out in
 * two hands, whichever face a browser reaches first drawing what it can. So
 * each is offered for its own characters and for nothing else, and a piece
 * left with none of them is not offered at all.
 *
 * And each file is offered once. Some sheets offer every piece twice, as
 * WOFF2 and again as WOFF for browsers that have not been made for ten years,
 * and each offer is a file the build would carry.
 *
 * A sheet asked for as text (`?raw`), as the Worker asks to find its way
 * about the pieces, is left as it was written.
 */
const faces = {
	name: 'vellum:faces',
	enforce: 'pre' as const,
	transform(code: string, id: string) {
		const [path, query = ''] = id.split('?');
		if (!path.endsWith('.css') || /\b(raw|url|inline)\b/.test(query)) return;
		const script = SCRIPTS.find((each) =>
			path.replaceAll('\\', '/').includes(`/node_modules/${each.source}/`)
		);
		if (!script) return;
		const css = code.replace(/,\s*url\([^)]+\.woff\)\s*format\('woff'\)/g, '');
		return { code: narrow(css, (ranges) => intersect(ranges, script.ranges)), map: null };
	}
};

export default defineConfig({
	plugins: [
		faces,
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
