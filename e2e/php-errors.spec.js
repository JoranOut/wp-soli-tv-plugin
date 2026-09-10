const { test, expect } = require( '@playwright/test' );
const {
	expectNoPhpDiagnostics,
	restUrl,
	wpEval,
	wpEvalJson,
	FATAL_ERROR_PATTERN,
	PLUGIN_DIAGNOSTIC_PATTERN,
} = require( './helpers' );

/** One published message, so /tv/ renders a slide rather than the empty state. */
function seedKioskMessage() {
	return wpEvalJson(
		"echo wp_json_encode( wp_insert_post( array(" +
			" 'post_type' => 'soli_tv_message'," +
			" 'post_status' => 'publish'," +
			" 'post_title' => 'php-errors kiosk fixture'," +
			" 'post_content' => 'body copy' ) ) );"
	);
}

/**
 * Asserts that the surfaces this plugin renders emit no PHP diagnostics.
 *
 * `WP_DEBUG` and `WP_DEBUG_DISPLAY` are enabled for the wp-env `tests`
 * environment, so diagnostics land in the rendered document. Fatals and parse
 * errors are rejected wherever they come from; warnings, notices and
 * deprecations only when they point at this plugin's own PHP files, so
 * unrelated core or theme noise cannot turn CI red.
 *
 * The load-bearing surface is `/tv/`: `lib/kiosk.php` builds that whole
 * document, so it is where plugin PHP runs for a visitor. It used to be a page
 * carrying the soli/tv-settings block, until the block was removed.
 */

// A message so /tv/ has something to render: an empty screen exercises less of
// the payload-building code than a populated one.
let messageId;

test.beforeAll( () => {
	messageId = seedKioskMessage();
} );

test.afterAll( () => {
	if ( messageId ) {
		wpEval( 'wp_delete_post( ' + messageId + ', true );' );
	}
} );

test.describe( 'renders without PHP diagnostics', () => {
	test( 'on the screen at /tv/', async ( { page } ) => {
		await page.goto( '/tv/' );

		// Prove the route actually rendered before asserting on the output:
		// without this a 404 would satisfy "no diagnostics" for entirely the
		// wrong reason. The payload script is the marker, because React
		// replaces the contents of the mount point once it boots.
		await expect( page.locator( '#soli-tv-payload' ) ).toBeAttached();

		await expectNoPhpDiagnostics( page );
	} );

	test( 'on that same page for a logged-out visitor', async ( { browser } ) => {
		// The TV display is unauthenticated, so this is how the screen is
		// really reached.
		const context = await browser.newContext( {
			storageState: { cookies: [], origins: [] },
		} );
		const page = await context.newPage();

		await page.goto( '/tv/' );

		// Same marker as the logged-in case: proof the route rendered, so "no
		// diagnostics" cannot pass on a 404.
		await expect( page.locator( '#soli-tv-payload' ) ).toBeAttached();
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
		await page.goto( `/wp-admin/post.php?post=${ messageId }&action=edit` );
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

	test( 'in the soli_tv_message REST response', async ( { request } ) => {
		// A diagnostic printed while the response is built is emitted ahead of
		// the JSON body, so the raw text is what has to be inspected. This
		// replaces the same check against soli_tv/v1, which no longer exists.
		const response = await request.get(
			restUrl( '/wp/v2/soli_tv_message' )
		);
		const body = await response.text();

		expect( body ).not.toMatch( FATAL_ERROR_PATTERN );
		expect( body ).not.toMatch( PLUGIN_DIAGNOSTIC_PATTERN );
	} );
} );
