/**
 * Shared helpers for the Soli TV plugin e2e tests.
 *
 * The wp-env test environment installs WordPress with plain permalinks, so REST
 * requests go through the `?rest_route=` fallback instead of `/wp-json/`.
 */

const { execFileSync } = require( 'child_process' );
const path = require( 'path' );

const { expect } = require( '@playwright/test' );

const ADMIN_USER = process.env.WP_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.WP_ADMIN_PASSWORD || 'password';

/**
 * Fragments of paths that identify this plugin's own PHP files.
 *
 * Derived from the PHP this repository actually ships: `soli-tv-plugin.php`,
 * `uninstall.php`, `updater.php`, `blocks/block.php`, `blocks/settings.php`,
 * `blocks/tv-settings/index.php`, `lib/tv_message_table.php` and
 * `lib/tv_message_endpoints.php`. Matching the plugin directory covers all of
 * them, including files added later, while keeping unrelated WordPress core or
 * theme noise out of the assertion.
 */
const PLUGIN_PHP_FILES =
	'wp-soli-tv-plugin/(?:soli-tv-plugin|uninstall|updater)\\.php' +
	'|wp-soli-tv-plugin/(?:blocks|lib)/';

/** Diagnostics that are never acceptable, wherever they come from. */
const FATAL_ERROR_PATTERN = /Fatal error|Parse error/i;

/** Softer diagnostics, but only when they point at this plugin's files. */
const PLUGIN_DIAGNOSTIC_PATTERN = new RegExp(
	'(Warning|Notice|Deprecated):[^\\n]*(' + PLUGIN_PHP_FILES + ')',
	'i'
);

/**
 * Asserts that the currently loaded page contains no PHP diagnostics.
 *
 * `WP_DEBUG` and `WP_DEBUG_DISPLAY` are enabled for the wp-env `tests`
 * environment (see `.wp-env.json`), so PHP diagnostics are printed into the
 * rendered document. Anything PHP emits before `<html>` or inside `<head>` is
 * relocated into the body by the HTML parser, so reading the body text catches
 * diagnostics from any point in the request.
 *
 * @param {import('@playwright/test').Page} page
 */
async function expectNoPhpDiagnostics( page ) {
	const url = page.url();
	const body = await page.locator( 'body' ).innerText();

	expect( body, `PHP fatal/parse error rendered by ${ url }` ).not.toMatch(
		FATAL_ERROR_PATTERN
	);
	expect(
		body,
		`PHP warning/notice/deprecation from this plugin rendered by ${ url }`
	).not.toMatch( PLUGIN_DIAGNOSTIC_PATTERN );
}

/**
 * Builds a REST URL that works with plain permalinks.
 *
 * @param {string} route REST route, e.g. `/soli_tv/v1/messages`.
 * @return {string} Relative URL.
 */
function restUrl( route ) {
	return '/?rest_route=' + encodeURIComponent( route );
}

/**
 * Logs in as the wp-env administrator.
 *
 * @param {import('@playwright/test').Page} page
 */
async function loginAsAdmin( page ) {
	await page.goto( '/wp-login.php' );
	await page.fill( '#user_login', ADMIN_USER );
	await page.fill( '#user_pass', ADMIN_PASSWORD );
	await page.click( '#wp-submit' );
	await page.waitForURL( /wp-admin/ );
}

/**
 * Creates a published page whose content is a single soli/tv-settings block.
 *
 * This is the plugin's only front-end PHP surface: the block's `render_callback`
 * (`SoliTVSettingsBlock::theHTML`) runs while the page renders, so a page
 * carrying the block is what makes front-end diagnostics observable at all.
 *
 * Seeded through wp-cli rather than the REST API: the REST route needs a
 * `wp_rest` nonce read out of wp-admin, and doing that once per Playwright
 * worker raced against the editor bundle loading under parallel load. wp-cli is
 * synchronous and has no such dependency.
 *
 * With plain permalinks the page is reachable at `?page_id=`.
 *
 * @return {{id: number, link: string}} The created page.
 */
function seedTvBlockPage() {
	const content =
		'<!-- wp:soli/tv-settings {"selectedGroups":["Harmonie orkest"]} /-->';

	const id = parseInt(
		execFileSync(
			'npx',
			[
				'wp-env',
				'run',
				'tests-cli',
				'--',
				'wp',
				'post',
				'create',
				'--post_type=page',
				'--post_status=publish',
				'--post_title=TV settings block diagnostics fixture',
				`--post_content=${ content }`,
				'--porcelain',
			],
			{ cwd: path.join( __dirname, '..' ), encoding: 'utf8' }
		)
			.trim()
			.split( /\s+/ )
			.pop(),
		10
	);

	if ( ! id ) {
		throw new Error( 'Could not seed the tv-settings fixture page' );
	}

	return { id, link: `/?page_id=${ id }` };
}

module.exports = {
	ADMIN_USER,
	ADMIN_PASSWORD,
	PLUGIN_PHP_FILES,
	FATAL_ERROR_PATTERN,
	PLUGIN_DIAGNOSTIC_PATTERN,
	restUrl,
	loginAsAdmin,
	seedTvBlockPage,
	expectNoPhpDiagnostics,
};
