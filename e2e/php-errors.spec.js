const { test, expect } = require( '@playwright/test' );
const {
	expectNoPhpDiagnostics,
	seedTvBlockPage,
	restUrl,
	FATAL_ERROR_PATTERN,
	PLUGIN_DIAGNOSTIC_PATTERN,
} = require( './helpers' );

/**
 * Asserts that the surfaces this plugin renders emit no PHP diagnostics.
 *
 * `WP_DEBUG` and `WP_DEBUG_DISPLAY` are enabled for the wp-env `tests`
 * environment, so diagnostics land in the rendered document. Fatals and parse
 * errors are rejected wherever they come from; warnings, notices and
 * deprecations only when they point at this plugin's own PHP files, so
 * unrelated core or theme noise cannot turn CI red.
 *
 * The load-bearing surface is the front end: the soli/tv-settings block's
 * `render_callback` is the only plugin PHP that runs while a visitor page
 * renders, so a page carrying the block is created once and then visited both
 * logged in and logged out.
 */

let fixture;

test.beforeAll( () => {
	fixture = seedTvBlockPage();
} );

test.describe( 'renders without PHP diagnostics', () => {
	test( 'on a front-end page containing the tv-settings block', async ( {
		page,
	} ) => {
		await page.goto( fixture.link );

		// Prove the render_callback actually ran before asserting on the
		// output: without this the page could be a 404 and the assertion would
		// pass for the wrong reason. The `data-attributes` payload is matched
		// rather than the `block-tv-settings` class, because frontend.js strips
		// that class off the container once React has mounted into it.
		await expect( page.locator( 'div[data-attributes]' ) ).toBeAttached();

		await expectNoPhpDiagnostics( page );
	} );

	test( 'on that same page for a logged-out visitor', async ( { browser } ) => {
		// The TV display is unauthenticated, so this is how the block is really
		// reached in production.
		const context = await browser.newContext( {
			storageState: { cookies: [], origins: [] },
		} );
		const page = await context.newPage();

		await page.goto( fixture.link );
		await expect( page.locator( 'div[data-attributes]' ) ).toBeAttached();
		await expectNoPhpDiagnostics( page );

		await context.close();
	} );

	test( 'on the site front page', async ( { page } ) => {
		// Covers the plugin filters that run on every front-end request, such
		// as excerpt_more and register_post_type_args.
		await page.goto( '/' );
		await expectNoPhpDiagnostics( page );
	} );

	test( 'in the block editor for that page', async ( { page } ) => {
		await page.goto( `/wp-admin/post.php?post=${ fixture.id }&action=edit` );
		await expectNoPhpDiagnostics( page );
	} );

	test( 'on the wp-admin dashboard', async ( { page } ) => {
		await page.goto( '/wp-admin/index.php' );
		await expect( page.locator( '#wpadminbar' ) ).toBeVisible();
		await expectNoPhpDiagnostics( page );
	} );

	test( 'on the plugins screen', async ( { page } ) => {
		await page.goto( '/wp-admin/plugins.php' );
		await expect(
			page.locator( 'tr[data-plugin="wp-soli-tv-plugin/soli-tv-plugin.php"]' )
		).toBeVisible();
		await expectNoPhpDiagnostics( page );
	} );

	test( 'in the soli_tv/v1 messages REST response', async ( { request } ) => {
		// A diagnostic printed by the endpoint is emitted ahead of the JSON
		// body, so the raw text is what has to be inspected here.
		const response = await request.get( restUrl( '/soli_tv/v1/messages' ) );
		const body = await response.text();

		expect( body ).not.toMatch( FATAL_ERROR_PATTERN );
		expect( body ).not.toMatch( PLUGIN_DIAGNOSTIC_PATTERN );
	} );
} );
