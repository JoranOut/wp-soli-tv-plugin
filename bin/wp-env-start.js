#!/usr/bin/env node
/**
 * Starts wp-env on the newest WordPress release, the same version CI's
 * `latest` leg resolves, by handing wp-env that release's zip as WP_ENV_CORE.
 * wp-env only re-downloads core when its config changes, so naming the exact
 * version (rather than latest.zip) is what makes a new release arrive.
 *
 * A WP_ENV_CORE that is already set (CI's matrix legs) is left alone. Offline,
 * the `core` pin in .wp-env.json is used. Extra arguments go to `wp-env start`.
 */
const { spawnSync } = require( 'child_process' );

async function newestRelease() {
	try {
		const response = await fetch( 'https://api.wordpress.org/core/version-check/1.7/', {
			signal: AbortSignal.timeout( 5000 ),
		} );
		return ( await response.json() ).offers?.[ 0 ]?.current ?? null;
	} catch {
		return null;
	}
}

( async () => {
	if ( process.env.WP_ENV_CORE ) {
		console.log( `wp-env: WP_ENV_CORE already set to ${ process.env.WP_ENV_CORE }` );
	} else {
		const version = await newestRelease();
		if ( version ) {
			process.env.WP_ENV_CORE = `https://wordpress.org/wordpress-${ version }.zip`;
			console.log( `wp-env: WordPress ${ version } (newest release)` );
		} else {
			console.warn( 'wp-env: wordpress.org unreachable, using the core pin in .wp-env.json' );
		}
	}

	const result = spawnSync( 'npx', [ '@wordpress/env', 'start', ...process.argv.slice( 2 ) ], {
		stdio: 'inherit',
		env: process.env,
	} );
	process.exit( result.status ?? 1 );
} )();
