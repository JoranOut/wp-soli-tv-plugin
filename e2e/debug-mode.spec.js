/**
 * Guards the environment the other tests depend on.
 *
 * Every "renders without PHP diagnostics" assertion in this suite works by
 * reading PHP diagnostics out of the rendered document. That only happens when
 * both `WP_DEBUG` and `WP_DEBUG_DISPLAY` are enabled: `wp_debug_mode()` leaves
 * `display_errors` untouched when `WP_DEBUG` is false, and then no diagnostic of
 * any severity — not even a fatal — reaches the page, so those assertions pass
 * unconditionally.
 *
 * wp-env's own defaults set `env.tests.config.WP_DEBUG = false`, and
 * environment-specific defaults beat the root-level `config`, so a root-level
 * `WP_DEBUG: true` is not enough. Confusingly `WP_DEBUG_LOG` and
 * `WP_DEBUG_DISPLAY` do carry over, which makes such a file look correct. This
 * test fails loudly if that regresses instead of letting the diagnostics
 * assertions go quietly vacuous.
 */

const { test, expect } = require( '@playwright/test' );

/**
 * Reads a constant's reported state from the Site Health "Info" tab.
 *
 * The constants live in a collapsed accordion panel, so the value is read from
 * `textContent` (which Playwright's `toHaveText` uses) rather than from
 * `innerText`, which is empty for hidden elements.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          constant Constant name.
 * @return {import('@playwright/test').Locator} The value cell.
 */
function constantValue( page, constant ) {
	return page
		.locator( '#health-check-accordion-block-wp-constants tr', {
			has: page.locator( 'th', {
				hasText: new RegExp( `^${ constant }$` ),
			} ),
		} )
		.locator( 'td' );
}

test.describe( 'PHP diagnostics are visible in the test environment', () => {
	test( 'WP_DEBUG and WP_DEBUG_DISPLAY are enabled', async ( { page } ) => {
		await page.goto( '/wp-admin/site-health.php?tab=debug' );

		await expect( constantValue( page, 'WP_DEBUG' ) ).toHaveText( 'Enabled' );
		await expect( constantValue( page, 'WP_DEBUG_DISPLAY' ) ).toHaveText(
			'Enabled'
		);
	} );
} );
