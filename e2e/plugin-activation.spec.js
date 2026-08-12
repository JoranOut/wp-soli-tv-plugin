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

	test( 'creates the tv_message table on activation', async ( { page } ) => {
		// The messages route reads straight from the table. A missing table
		// surfaces as a 500 rather than the 200/204 the handler returns.
		const response = await page.request.get(
			'/?rest_route=/soli_tv/v1/messages'
		);
		expect( [ 200, 204 ] ).toContain( response.status() );
	} );

	// The ad-hoc "no PHP fatal or warning on the dashboard" assertion that used
	// to live here moved to php-errors.spec.js, which owns every diagnostics
	// surface and scopes the softer diagnostics to this plugin's own files. Its
	// unscoped `Warning: ` check would have flagged unrelated core noise, and it
	// only ever read wp-admin, which says nothing about front-end rendering.

	test( 'registers the soli/tv-settings block in the editor', async ( {
		page,
	} ) => {
		await page.goto( '/wp-admin/post-new.php' );

		// Waits for the editor bundle, which is what actually proves the
		// registered script dependencies resolve - a missing handle would stop
		// wp.blocks from ever appearing.
		await page.waitForFunction(
			() => window.wp && window.wp.blocks && window.wp.blocks.getBlockType,
			undefined,
			{ timeout: 30000 }
		);

		const blockName = await page.evaluate( () => {
			const type = window.wp.blocks.getBlockType( 'soli/tv-settings' );
			return type ? type.name : null;
		} );

		expect( blockName ).toBe( 'soli/tv-settings' );
	} );
} );
