const { test, expect } = require( '@playwright/test' );

const { wpEval, wpEvalJson } = require( './helpers' );

/**
 * Covers `/tv/`, the screen itself (step 7 of PLAN-cpt-and-kiosk-route.md).
 *
 * Two things are asserted that a rendering test normally would not bother with:
 * that the document does *not* contain the theme and core scaffolding a page
 * would have brought, since avoiding that is the whole reason the route exists;
 * and that the URL is exactly `/tv/`.
 */

test.describe.configure( { mode: 'serial' } );

const MARKER = 'spec-kiosk';

let eventsAvailable = false;

function seedMessage( title, meta = {} ) {
	const pairs = Object.entries( meta )
		.map(
			( [ key, value ] ) =>
				` update_post_meta( $id, '${ key }', '${ value }' );`
		)
		.join( '' );

	return wpEvalJson(
		"$id = wp_insert_post( array( 'post_type' => 'soli_tv_message'," +
			" 'post_status' => 'publish'," +
			" 'post_title' => '" + MARKER + ' ' + title + "'," +
			" 'post_content' => 'body copy' ) );" +
			pairs +
			' echo wp_json_encode( $id );'
	);
}

/** The payload the document carries, parsed. */
async function payload( request ) {
	const response = await request.get( '/tv/' );
	expect( response.status() ).toBe( 200 );

	const html = await response.text();
	const match = html.match(
		/<script id="soli-tv-payload"[^>]*>([\s\S]*?)<\/script>/
	);

	expect( match, 'the document carries a payload' ).not.toBeNull();

	return { html, data: JSON.parse( match[ 1 ] ) };
}

function titles( data ) {
	return data.slides.map( ( slide ) => slide.title );
}

/**
 * Everything this file seeds, messages and events alike.
 *
 * Events are cleared here rather than only at the end of the test that seeded
 * them, because a test that fails never reaches its own cleanup and its rows
 * then sit in the next run's agenda. That is exactly how this file first broke:
 * a deliberately failed run left four events behind, and the next run's agenda
 * assertions read them.
 *
 * The event_dates delete is guarded. The table only exists where the event
 * plugin is installed, and an unguarded DELETE against a missing table prints a
 * wpdb error that breaks the next wp eval JSON read.
 */
function cleanup() {
	wpEval(
		'global $wpdb;' +
			' $dates = $wpdb->prefix . "event_dates";' +
			' $has_dates = $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $dates ) ) === $dates;' +
			" $q = new WP_Query( array( 'post_type' => array( 'soli_tv_message', 'soli_event' )," +
			" 'post_status' => 'any', 'posts_per_page' => -1, 's' => '" + MARKER + "' ) );" +
			' foreach ( $q->posts as $p ) {' +
			"   if ( strpos( $p->post_title, '" + MARKER + "' ) !== 0 ) { continue; }" +
			'   if ( $has_dates ) { $wpdb->delete( $dates, array( "post_id" => $p->ID ) ); }' +
			'   wp_delete_post( $p->ID, true );' +
			' }'
	);
}

test.beforeAll( () => {
	eventsAvailable = wpEvalJson(
		"require_once ABSPATH . 'wp-admin/includes/plugin.php';" +
			' global $wpdb; $t = $wpdb->prefix . "event_dates";' +
			' echo wp_json_encode(' +
			"   is_plugin_active( 'wp-soli-event-plugin/soli-event-plugin.php' )" +
			'   && $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $t ) ) === $t );'
	);

	cleanup();
} );

test.afterAll( () => {
	cleanup();
} );

test.describe( 'the screen at /tv/', () => {
	test( 'is served at /tv/, and /tv redirects there', async ( { request } ) => {
		const slash = await request.get( '/tv/' );
		expect( slash.status() ).toBe( 200 );

		// The screen's address is /tv/ and nothing else. The soli_tv query var
		// exists only as the rewrite target.
		const noSlash = await request.get( '/tv', { maxRedirects: 0 } );
		expect( noSlash.status() ).toBe( 301 );
		expect( noSlash.headers().location ).toContain( '/tv/' );
	} );

	test( 'carries none of the scaffolding a page would have', async ( {
		request,
	} ) => {
		const { html } = await payload( request );

		// Each of these came with the block-on-a-page approach and is the
		// reason this route exists: measured 2026-09-09, that page was 97,518
		// bytes, of which 38,992 was inline CSS and 39,979 the theme's chrome.
		for ( const scaffolding of [
			'global-styles-inline-css',
			'wp-block-library',
			'admin-bar',
			'wp-emoji',
			'/feed',
		] ) {
			expect( html, `document must not contain ${ scaffolding }` ).not.toContain(
				scaffolding
			);
		}

		// The scaffolding is the document minus its payload, and that is what
		// this caps. Measuring the whole document conflated "no theme" with
		// "little content": with 65 messages seeded the payload alone pushed it
		// to 20,707 bytes and this assertion failed on a site that was
		// perfectly healthy.
		const withoutPayload = html.replace(
			/<script id="soli-tv-payload"[\s\S]*?<\/script>/,
			''
		);

		expect( withoutPayload.length ).toBeLessThan( 4000 );
	} );

	test( 'shows a published message that is in its window', async ( {
		request,
	} ) => {
		seedMessage( 'in-window', {
			_soli_tv_start: '2020-01-01T00:00:00',
			_soli_tv_end: '2099-01-01T00:00:00',
		} );

		const { data } = await payload( request );
		expect( titles( data ) ).toContain( MARKER + ' in-window' );
	} );

	test( 'shows a message with no window at all', async ( { request } ) => {
		seedMessage( 'no-window' );

		// An absent bound means "always on", which is why the query has to
		// accept a missing key rather than only comparing values.
		const { data } = await payload( request );
		expect( titles( data ) ).toContain( MARKER + ' no-window' );
	} );

	test( 'hides a message whose window has passed', async ( { request } ) => {
		seedMessage( 'expired', {
			_soli_tv_start: '2020-01-01T00:00:00',
			_soli_tv_end: '2020-02-01T00:00:00',
		} );

		const { data } = await payload( request );
		expect( titles( data ) ).not.toContain( MARKER + ' expired' );
	} );

	test( 'shows a window that starts and ends today', async ( { request } ) => {
		// Both bounds are whole days and inclusive. The editor's
		// datetime-local inputs always emit a time, so a bound picked as a date
		// arrives as midnight - and comparing that as a moment dropped the
		// message for the whole of the day it was meant to run.
		const today = wpEvalJson(
			"echo wp_json_encode( current_time( 'Y-m-d' ) );"
		);

		seedMessage( 'today-only', {
			_soli_tv_start: today + 'T00:00',
			_soli_tv_end: today + 'T00:00',
		} );

		const { data } = await payload( request );
		expect( titles( data ) ).toContain( MARKER + ' today-only' );
	} );

	test( 'hides a window that ended yesterday', async ( { request } ) => {
		// The other side of the same rule: inclusive to the end of the day
		// named, and not one day further.
		const yesterday = wpEvalJson(
			"echo wp_json_encode( gmdate( 'Y-m-d', strtotime( current_time( 'Y-m-d' ) . ' -1 day' ) ) );"
		);

		seedMessage( 'ended-yesterday', {
			_soli_tv_start: '2020-01-01T00:00:00',
			_soli_tv_end: yesterday + 'T23:59',
		} );

		const { data } = await payload( request );
		expect( titles( data ) ).not.toContain( MARKER + ' ended-yesterday' );
	} );

	test( 'hides a message that is switched off', async ( { request } ) => {
		seedMessage( 'switched-off', { _soli_tv_disabled: '1' } );

		// The switch the block could never deliver to the screen.
		const { data } = await payload( request );
		expect( titles( data ) ).not.toContain( MARKER + ' switched-off' );
	} );

	test( 'hides a draft', async ( { request } ) => {
		wpEval(
			"wp_insert_post( array( 'post_type' => 'soli_tv_message'," +
				" 'post_status' => 'draft', 'post_title' => '" + MARKER + " drafted' ) );"
		);

		const { data } = await payload( request );
		expect( titles( data ) ).not.toContain( MARKER + ' drafted' );
	} );

	test( 'gives an image as a file URL, never an attachment page', async ( {
		request,
	} ) => {
		const id = seedMessage( 'with-image' );

		const attachment = wpEvalJson(
			"$src = WP_PLUGIN_DIR . '/wp-soli-tv-plugin/blocks/tv-settings/assets/img/default_background.jpg';" +
				" $up = wp_upload_bits( '" + MARKER + "-image.jpg', null, file_get_contents( $src ) );" +
				" $att = wp_insert_attachment( array( 'post_mime_type' => 'image/jpeg'," +
				"   'post_title' => '" + MARKER + " image', 'post_status' => 'inherit' ), $up['file'] );" +
				' set_post_thumbnail( ' + id + ', $att );' +
				' echo wp_json_encode( $att );'
		);

		const { data } = await payload( request );
		const slide = data.slides.find(
			( s ) => s.title === MARKER + ' with-image'
		);

		expect( slide.imgUrl ).toBeTruthy();

		// `/?attachment_id=N` answers 301 to a text/html attachment page, so it
		// was never renderable in an <img>. Measured 2026-09-10.
		expect( slide.imgUrl ).not.toContain( 'attachment_id' );

		const image = await request.get( slide.imgUrl );
		expect( image.status() ).toBe( 200 );
		expect( image.headers()[ 'content-type' ] ).toContain( 'image/' );

		wpEval( 'wp_delete_attachment( ' + attachment + ', true );' );
	} );

	test( 'renders a message in the Soli two-tone treatment', async ( {
		page,
	} ) => {
		seedMessage( 'two-tone', {} );

		await page.goto( '/tv/', { waitUntil: 'domcontentloaded' } );

		// Class hooks, never the copy: the title's own words are content and
		// the rest of this suite runs against whichever locale is active.
		const slide = page
			.locator( '.soli-tv-block-single-slide.message' )
			.filter( {
				has: page.locator( '.soli-tv-slide__title', {
					hasText: MARKER + ' two-tone',
				} ),
			} )
			.first();

		await expect(
			slide.locator( '.soli-tv-slide__title-lead' )
		).toContainText( MARKER );
		// The last word carries the accent, which is the hero's rule.
		await expect(
			slide.locator( '.soli-tv-slide__title-accent' )
		).toHaveText( 'two-tone' );
		await expect( slide.locator( '.soli-tv-slide__scrim' ) ).toHaveCount(
			1
		);
	} );

	test( 'renders the slides in a browser without console errors', async ( {
		page,
	} ) => {
		seedMessage( 'rendered' );

		const errors = [];
		page.on( 'pageerror', ( error ) => errors.push( error.message ) );
		page.on( 'console', ( message ) => {
			if ( message.type() === 'error' ) {
				errors.push( message.text() );
			}
		} );

		await page.goto( '/tv/' );

		await expect(
			page.locator( '.soli-tv-block-single-slide' ).first()
		).toBeAttached( { timeout: 30000 } );

		// One slide visible at a time, full screen.
		const active = page.locator( '.soli-tv-block-single-slide.is-active' );
		await expect( active ).toHaveCount( 1 );

		expect( errors ).toEqual( [] );
	} );

	test( 'takes its interval from the settings option', async ( { request } ) => {
		wpEval(
			"update_option( 'soli_tv_settings', array( 'delay' => 42," +
				" 'onlyConcerts' => false, 'selectedGroups' => array() ) );"
		);

		const { data } = await payload( request );
		expect( data.delayMs ).toBe( 42000 );

		wpEval( "delete_option( 'soli_tv_settings' );" );
	} );

	test( 'includes upcoming events from the event plugin', async ( {
		request,
	} ) => {
		test.skip(
			! eventsAvailable,
			'wp-soli-event-plugin is not installed in this environment'
		);

		const seeded = wpEvalJson(
			'global $wpdb;' +
				" $post = wp_insert_post( array( 'post_type' => 'soli_event'," +
				" 'post_status' => 'publish', 'post_title' => '" + MARKER + " event' ) );" +
				' $wpdb->insert( $wpdb->prefix . "event_dates", array(' +
				"   'post_id' => $post," +
				"   'start_date' => gmdate( 'Y-m-d H:i:s', strtotime( '+3 days' ) )," +
				"   'end_date' => gmdate( 'Y-m-d H:i:s', strtotime( '+3 days' ) + 7200 )," +
				"   'status' => 'PUBLIC', 'is_concert' => 1 )," +
				"   array( '%d','%s','%s','%s','%d' ) );" +
				' echo wp_json_encode( $post );'
		);

		const { data } = await payload( request );
		const event = data.slides.find(
			( slide ) => slide.title === MARKER + ' event'
		);

		expect( event ).toBeDefined();
		expect( event.slide_type ).toBe( 'event' );

		// postId, not id: the flag lives on the post while `id` is a row in
		// the event plugin's date table.
		expect( event.postId ).toBe( seeded );

		wpEval(
			'global $wpdb;' +
				' $wpdb->delete( $wpdb->prefix . "event_dates", array( "post_id" => ' + seeded + ' ) );' +
				' wp_delete_post( ' + seeded + ', true );'
		);
	} );

	test( 'spreads messages between the events rather than ahead of them', async ( {
		request,
	} ) => {
		test.skip(
			! eventsAvailable,
			'wp-soli-event-plugin is not installed in this environment'
		);

		seedMessage( 'mixed' );

		const seeded = wpEvalJson(
			'global $wpdb; $ids = array();' +
				' for ( $i = 1; $i <= 4; $i++ ) {' +
				"   $post = wp_insert_post( array( 'post_type' => 'soli_event'," +
				" 'post_status' => 'publish', 'post_title' => '" + MARKER + " mix ' . $i ) );" +
				'   $wpdb->insert( $wpdb->prefix . "event_dates", array(' +
				"     'post_id' => $post," +
				"     'start_date' => gmdate( 'Y-m-d H:i:s', strtotime( \"+{$i} days\" ) )," +
				"     'end_date' => gmdate( 'Y-m-d H:i:s', strtotime( \"+{$i} days\" ) + 7200 )," +
				"     'status' => 'PUBLIC', 'is_concert' => 1 )," +
				"     array( '%d','%s','%s','%s','%d' ) );" +
				'   $ids[] = $post;' +
				' }' +
				' echo wp_json_encode( $ids );'
		);

		const { data } = await payload( request );
		const types = data.slides.map( ( slide ) => slide.slide_type );
		const firstMessage = types.indexOf( 'message' );

		// Asserted as a property of the order, not as fixed positions: other
		// spec files seed messages into the same screen, so the exact indices
		// move with whatever else is published.
		expect( types[ 0 ] ).toBe( 'event' );
		expect( firstMessage ).toBeGreaterThan( 0 );
		expect( types.slice( firstMessage ) ).toContain( 'event' );

		wpEval(
			'global $wpdb;' +
				' foreach ( array( ' + seeded.join( ',' ) + ' ) as $id ) {' +
				'   $wpdb->delete( $wpdb->prefix . "event_dates", array( "post_id" => $id ) );' +
				'   wp_delete_post( $id, true );' +
				' }'
		);
	} );

	test( 'shows PUBLIC dates and leaves every other status off', async ( {
		request,
	} ) => {
		test.skip(
			! eventsAvailable,
			'wp-soli-event-plugin is not installed in this environment'
		);

		// The screen hangs in a public hall: an option, a date awaiting
		// approval and a private booking are all agenda states that are not for
		// that audience, and only the first of these four belongs on it.
		const seeded = wpEvalJson(
			'global $wpdb; $ids = array();' +
				" foreach ( array( 'PUBLIC', 'OPTION', 'PENDING_APPROVAL', 'PRIVATE' ) as $i => $status ) {" +
				"   $post = wp_insert_post( array( 'post_type' => 'soli_event'," +
				" 'post_status' => 'publish', 'post_title' => '" + MARKER + " status ' . $status ) );" +
				'   $wpdb->insert( $wpdb->prefix . "event_dates", array(' +
				"     'post_id' => $post," +
				"     'start_date' => gmdate( 'Y-m-d H:i:s', strtotime( '+' . ( $i + 2 ) . ' days' ) )," +
				"     'end_date' => gmdate( 'Y-m-d H:i:s', strtotime( '+' . ( $i + 2 ) . ' days' ) + 7200 )," +
				"     'status' => $status, 'is_concert' => 1 )," +
				"     array( '%d','%s','%s','%s','%d' ) );" +
				'   $ids[] = $post;' +
				' }' +
				' echo wp_json_encode( $ids );'
		);

		const { data } = await payload( request );
		const shown = titles( data );

		expect( shown ).toContain( MARKER + ' status PUBLIC' );
		expect( shown ).not.toContain( MARKER + ' status OPTION' );
		expect( shown ).not.toContain( MARKER + ' status PENDING_APPROVAL' );
		expect( shown ).not.toContain( MARKER + ' status PRIVATE' );

		wpEval(
			'global $wpdb;' +
				' foreach ( array( ' + seeded.join( ',' ) + ' ) as $id ) {' +
				'   $wpdb->delete( $wpdb->prefix . "event_dates", array( "post_id" => $id ) );' +
				'   wp_delete_post( $id, true );' +
				' }'
		);
	} );

	test( 'renders an event beside the agenda, with its own row marked', async ( {
		page,
	} ) => {
		test.skip(
			! eventsAvailable,
			'wp-soli-event-plugin is not installed in this environment'
		);

		// Two dates, so the panel has something to list besides the event the
		// slide is about and `is-current` has to pick one of them.
		const seeded = wpEvalJson(
			'global $wpdb; $ids = array();' +
				" foreach ( array( '+2 days', '+9 days' ) as $i => $when ) {" +
				"   $post = wp_insert_post( array( 'post_type' => 'soli_event'," +
				" 'post_status' => 'publish', 'post_title' => '" + MARKER + " agenda ' . $i ) );" +
				'   $wpdb->insert( $wpdb->prefix . "event_dates", array(' +
				"     'post_id' => $post," +
				"     'start_date' => gmdate( 'Y-m-d H:i:s', strtotime( $when ) )," +
				"     'end_date' => gmdate( 'Y-m-d H:i:s', strtotime( $when ) + 7200 )," +
				"     'status' => 'PUBLIC', 'is_concert' => 1 )," +
				"     array( '%d','%s','%s','%s','%d' ) );" +
				'   $ids[] = $post;' +
				' }' +
				' echo wp_json_encode( $ids );'
		);

		await page.goto( '/tv/', { waitUntil: 'domcontentloaded' } );

		// Found by its own title, not by text anywhere in the slide: every
		// event slide now lists every event, so `hasText` matches all of them
		// and `.first()` picks whichever date happens to be earliest.
		const slide = page
			.locator( '.soli-tv-block-single-slide.event' )
			.filter( {
				has: page.locator( '.soli-tv-slide__title', {
					hasText: MARKER + ' agenda 0',
				} ),
			} )
			.first();

		// Every event slide carries the panel, and exactly one row in it is the
		// event that slide is about.
		await expect(
			slide.locator( '.soli-tv-agenda__item.is-current' )
		).toHaveCount( 1 );
		await expect(
			slide.locator( '.soli-tv-agenda__item.is-current' )
		).toContainText( MARKER + ' agenda 0' );

		// Every event slide carries the same list, in start order, so the later
		// event is listed under the earlier one whichever slide is on show.
		await expect( slide.locator( '.soli-tv-agenda__item' ) ).toContainText( [
			new RegExp( MARKER + ' agenda 0' ),
			new RegExp( MARKER + ' agenda 1' ),
		] );

		wpEval(
			'global $wpdb;' +
				' foreach ( array( ' + seeded.join( ',' ) + ' ) as $id ) {' +
				'   $wpdb->delete( $wpdb->prefix . "event_dates", array( "post_id" => $id ) );' +
				'   wp_delete_post( $id, true );' +
				' }'
		);
	} );
} );
