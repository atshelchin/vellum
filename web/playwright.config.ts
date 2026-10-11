import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: { command: 'npm run build && npm run preview', port: 4173 },
	testMatch: '**/*.e2e.{ts,js}',
	// A page here loads three.js and reads a chain before it settles. On a busy
	// machine that is sometimes more than the five seconds an expectation waits
	// by default, and a slow pass is not a failure.
	expect: { timeout: 15_000 }
});
