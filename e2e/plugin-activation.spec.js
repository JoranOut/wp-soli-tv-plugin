const { test, expect } = require( '@playwright/test' );

/**
 * These specs run with the administrator session captured by auth.setup.js.
 */
test.describe( 'Plugin activation', () => {
	test( 'is active in wp-admin and reports its version', async ( { page } ) => {
		await page.goto( '/wp-admin/plugins.php' );

		// data-slug is only set for wp.org-hosted plugins; data-plugin is the
		// plugin file path and is always present.
		const row = page.locator(
			'tr[data-plugin="wp-soli-tv-plugin/soli-tv-plugin.php"]'
		);
		await expect( row ).toBeVisible();
		await expect( row ).toContainText( '0.1.0' );

		// An active plugin renders a Deactivate action; an inactive one renders
		// Activate. This is the load-bearing assertion - if the plugin fataled
		// on load, WordPress would have refused to activate it.
		await expect( row.locator( '.deactivate' ) ).toBeVisible();
	} );

	test( 'registers the soli_tv_message post type on activation', async ( {
		page,
	} ) => {
		// Replaces the old "creates the tv_message table" assertion: messages
		// are posts now, and a type that failed to register answers 404 here.
		const response = await page.request.get(
			'/?rest_route=/wp/v2/soli_tv_message'
		);
		expect( response.status() ).toBe( 200 );
	} );

	test( 'serves the screen at /tv/', async ( { page } ) => {
		// The rewrite rule is added on init and only takes effect once the
		// rules are rebuilt, which activation and the stored rewrite version
		// are both responsible for. A 404 here means neither happened.
		const response = await page.request.get( '/tv/' );
		expect( response.status() ).toBe( 200 );
	} );

	// The ad-hoc "no PHP fatal or warning on the dashboard" assertion that used
	// to live here moved to php-errors.spec.js, which owns every diagnostics
	// surface and scopes the softer diagnostics to this plugin's own files. Its
	// unscoped `Warning: ` check would have flagged unrelated core noise, and it
	// only ever read wp-admin, which says nothing about front-end rendering.

	test( 'no longer registers the soli/tv-settings block', async ( { page } ) => {
		await page.goto( '/wp-admin/post-new.php' );

		// Waits for the editor bundle first, so this asserts an absence in a
		// loaded editor rather than in one that never booted.
		await page.waitForFunction(
			() => window.wp && window.wp.blocks && window.wp.blocks.getBlockType,
			undefined,
			{ timeout: 30000 }
		);

		const blockName = await page.evaluate( () => {
			const type = window.wp.blocks.getBlockType( 'soli/tv-settings' );
			return type ? type.name : null;
		} );

		// The block is gone: editing happens in the post editor and the
		// overview lives at Tv berichten -> Instellingen. A page still holding
		// the block markup renders nothing, which is why `wp soli-tv migrate`
		// reports those pages.
		expect( blockName ).toBeNull();
	} );
} );
