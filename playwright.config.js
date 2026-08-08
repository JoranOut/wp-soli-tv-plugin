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
	workers: process.env.CI ? 1 : undefined,
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
