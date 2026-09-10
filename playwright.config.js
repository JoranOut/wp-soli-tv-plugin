const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

/**
 * Playwright configuration for the Soli TV plugin e2e tests.
 *
 * Targets the wp-env "tests" environment on port 8899, so a running dev
 * environment on 8898 is never mutated by a test run.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
	testDir: './e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,

	// One worker everywhere, not just on CI. Every spec drives the same
	// WordPress instance, so specs running in parallel collide on global state,
	// and they have three times: another spec's tv_message rows joined the
	// migration's report, orphan postmeta from one run failed the next, and
	// deleting the soli_tv_settings option in one file broke an assertion about
	// it in another. The cost is real - the suite goes from about 30s to about
	// 1m40s locally - and worth paying, because each of those three collisions
	// presented as a passing or failing test that had nothing to do with the
	// code under change. Tests within a file still run in parallel unless the
	// file opts into serial mode.
	workers: 1,
	reporter: 'html',
	use: {
		baseURL: process.env.WP_BASE_URL || 'http://localhost:8899',
		trace: 'on-first-retry',
		screenshot: 'only-on-failure',
	},
	projects: [
		{
			// Logs in once; every other project reuses the stored session.
			name: 'setup',
			testMatch: /auth\.setup\.js/,
		},
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				storageState: path.join(__dirname, 'e2e', '.auth', 'admin.json'),
			},
			dependencies: ['setup'],
		},
	],
	webServer: {
		command: 'npm run env:start',
		url: 'http://localhost:8899',
		reuseExistingServer: true,
		timeout: 120000,
	},
});
