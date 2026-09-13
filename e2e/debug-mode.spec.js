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

const { wpEvalJson } = require( './helpers' );

test.describe( 'PHP diagnostics are visible in the test environment', () => {
	test( 'WP_DEBUG and WP_DEBUG_DISPLAY are enabled', async () => {
		// Read from PHP, not from Site Health. That screen reports the state as
		// "Enabled", which is "Ingeschakeld" the moment the environment runs in
		// Dutch, and this suite runs against whichever locale is active.
		const constants = wpEvalJson(
			'echo wp_json_encode( array(' +
				" 'WP_DEBUG' => defined( 'WP_DEBUG' ) && WP_DEBUG," +
				" 'WP_DEBUG_DISPLAY' => defined( 'WP_DEBUG_DISPLAY' ) && WP_DEBUG_DISPLAY," +
				" 'display_errors' => (string) ini_get( 'display_errors' )," +
				' ) );'
		);

		expect( constants.WP_DEBUG ).toBe( true );
		expect( constants.WP_DEBUG_DISPLAY ).toBe( true );

		// The constants are the switch; `display_errors` is what actually puts
		// a diagnostic on the page, and it is what the other specs depend on.
		expect( constants.display_errors ).not.toBe( '' );
		expect( constants.display_errors ).not.toBe( '0' );
	} );
} );
