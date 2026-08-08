const { test: setup, expect } = require( '@playwright/test' );
const path = require( 'path' );

const ADMIN_USER = process.env.WP_ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.WP_ADMIN_PASSWORD || 'password';

const authFile = path.join( __dirname, '.auth', 'admin.json' );

/**
 * Logs in once and stores the session for every other spec to reuse.
 *
 * Doing this per-test made concurrent logins race against each other, which
 * showed up as intermittent redirects back to wp-login.php.
 */
setup( 'authenticate as administrator', async ( { page } ) => {
	await page.goto( '/wp-login.php' );
	await page.fill( '#user_login', ADMIN_USER );
	await page.fill( '#user_pass', ADMIN_PASSWORD );

	await Promise.all( [
		page.waitForNavigation( { waitUntil: 'domcontentloaded' } ),
		page.click( '#wp-submit' ),
	] );

	// WordPress can interrupt login with the "confirm your admin email"
	// interstitial. The session cookie is already set by then, so stepping past
	// it is enough. wp-env pushes admin_email_lifespan far into the future in
	// its afterStart script, so this is a fallback rather than the norm.
	if ( page.url().includes( 'confirm_admin_email' ) ) {
		const remindLater = page.locator( '.admin-email__later a' );
		if ( await remindLater.count() ) {
			await remindLater.click();
		}
	}

	await page.goto( '/wp-admin/' );

	// Assert on the admin bar rather than the URL: a rejected login lands on
	// wp-login.php with ?redirect_to=...%2Fwp-admin%2F, which still matches a
	// naive /wp-admin/ URL check.
	await expect( page.locator( '#wpadminbar' ) ).toBeVisible();

	await page.context().storageState( { path: authFile } );
} );
