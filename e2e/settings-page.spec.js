const { test, expect } = require( '@playwright/test' );

const { wpEval, wpEvalJson } = require( './helpers' );

/**
 * Covers `Tv berichten` -> `Instellingen` (step 5 of
 * PLAN-cpt-and-kiosk-route.md).
 *
 * This screen replaces the block's edit view, and the assertions that matter
 * are about where its state lands: the per-item switch on the item's own meta,
 * the rest in the soli_tv_settings option. In the block both lived in
 * attributes serialised into a page's content, and the switch never reached the
 * TV at all.
 */

test.describe.configure( { mode: 'serial' } );

const MARKER = 'spec-settings';

/**
 * Whether the event plugin is here at all.
 *
 * `wp-soli-event-plugin` is an optional dependency, loaded locally through
 * `.wp-env.override.json` and absent on CI. The agenda assertions seed into its
 * `event_dates` table, so on CI they failed with "Table 'wp_event_dates'
 * doesn't exist" while passing locally - the same shape of local/CI divergence
 * as the editor's welcome guide.
 *
 * Both conditions are checked: the table is what the seeding needs, and the
 * plugin being active is what makes the screen render an agenda at all.
 */
let eventsAvailable = false;
const PAGE = '/wp-admin/edit.php?post_type=soli_tv_message&page=soli-tv-settings';

function seedMessage( title ) {
	return wpEvalJson(
		"$id = wp_insert_post( array( 'post_type' => 'soli_tv_message'," +
			" 'post_status' => 'publish', 'post_title' => '" + MARKER + ' ' + title + "' ) );" +
			" update_post_meta( $id, '_soli_tv_start', '2026-12-01T19:00:00' );" +
			" update_post_meta( $id, '_soli_tv_end', '2026-12-26T23:00:00' );" +
			' echo wp_json_encode( $id );'
	);
}

/** An event post with two date rows, which is what makes the dedupe matter. */
function seedEventWithTwoDates( title ) {
	return wpEvalJson(
		'global $wpdb;' +
			" $post = wp_insert_post( array( 'post_type' => 'soli_event'," +
			" 'post_status' => 'publish', 'post_title' => '" + MARKER + ' ' + title + "' ) );" +
			' $t = $wpdb->prefix . "event_dates";' +
			" foreach ( array( '+5 days 20:15', '+12 days 20:15' ) as $when ) {" +
			'   $wpdb->insert( $t, array(' +
			"     'post_id' => $post," +
			"     'start_date' => gmdate( 'Y-m-d H:i:s', strtotime( $when ) )," +
			"     'end_date' => gmdate( 'Y-m-d H:i:s', strtotime( $when ) + 7200 )," +
			"     'status' => 'PUBLIC', 'is_concert' => 1 )," +
			"     array( '%d','%s','%s','%s','%d' ) );" +
			' }' +
			' $rows = $wpdb->get_col( $wpdb->prepare(' +
			'   "SELECT id FROM {$t} WHERE post_id = %d", $post ) );' +
			" echo wp_json_encode( array( 'post' => $post, 'dates' => array_map( 'intval', $rows ) ) );"
	);
}

/**
 * `$count` event posts, one future date each, ordered from today onwards.
 *
 * Used to push the list past the screen's own horizon, which is the whole point
 * of the Instellingen list reaching further than `/tv/` does.
 */
function seedEventSeries( count ) {
	return wpEvalJson(
		'global $wpdb; $t = $wpdb->prefix . "event_dates"; $ids = array();' +
			' for ( $i = 1; $i <= ' + count + '; $i++ ) {' +
			"   $post = wp_insert_post( array( 'post_type' => 'soli_event'," +
			" 'post_status' => 'publish', 'post_title' => '" + MARKER + " serie ' . $i ) );" +
			'   $wpdb->insert( $t, array(' +
			"     'post_id' => $post," +
			"     'start_date' => gmdate( 'Y-m-d H:i:s', strtotime( \"+{$i} days 20:15\" ) )," +
			"     'end_date' => gmdate( 'Y-m-d H:i:s', strtotime( \"+{$i} days 22:15\" ) )," +
			"     'status' => 'PUBLIC', 'is_concert' => 1 )," +
			"     array( '%d','%s','%s','%s','%d' ) );" +
			'   $ids[] = $post;' +
			' }' +
			' echo wp_json_encode( $ids );'
	);
}

/** The screen's own event cap, read from PHP rather than repeated here. */
function kioskEventLimit() {
	return wpEvalJson( 'echo wp_json_encode( Soli\\TV\\KIOSK_EVENT_LIMIT );' );
}

function disabledFlag( id ) {
	return wpEvalJson(
		'echo wp_json_encode( (bool) get_post_meta( ' + id + ", '_soli_tv_disabled', true ) );"
	);
}

function readOption() {
	return wpEvalJson( "echo wp_json_encode( get_option( 'soli_tv_settings' ) );" );
}

function cleanup() {
	// The event_dates delete is guarded: the table only exists where the event
	// plugin is installed, and an unguarded DELETE against a missing table
	// prints a wpdb error that then breaks the next wp eval JSON read.
	wpEval(
		'global $wpdb;' +
			' $dates = $wpdb->prefix . "event_dates";' +
			' $has_dates = $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $dates ) ) === $dates;' +
			" $q = new WP_Query( array( 'post_type' => array( 'soli_tv_message', 'soli_event' )," +
			" 'post_status' => 'any', 'posts_per_page' => -1, 's' => '" + MARKER + "' ) );" +
			' foreach ( $q->posts as $p ) {' +
			"   if ( strpos( $p->post_title, '" + MARKER + "' ) === 0 ) {" +
			'     if ( $has_dates ) { $wpdb->delete( $dates, array( "post_id" => $p->ID ) ); }' +
			'     wp_delete_post( $p->ID, true );' +
			'   }' +
			' }' +
			" delete_option( 'soli_tv_settings' );"
	);
}

/** Waits for the React app, which mounts after its REST reads resolve. */
async function openSettings( page ) {
	await page.goto( PAGE, { waitUntil: 'domcontentloaded' } );
	await expect( page.locator( '.soli-tv-settings__card' ).first() ).toBeVisible( {
		timeout: 30000,
	} );
}

function row( page, title ) {
	return page
		.locator( '.soli-tv-settings__row' )
		.filter( { hasText: title } )
		.first();
}

test.beforeAll( () => {
	eventsAvailable = wpEvalJson(
		"require_once ABSPATH . 'wp-admin/includes/plugin.php';" +
			' global $wpdb; $table = $wpdb->prefix . "event_dates";' +
			' echo wp_json_encode(' +
			"   is_plugin_active( 'wp-soli-event-plugin/soli-event-plugin.php' )" +
			'   && $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $table ) ) === $table' +
			' );'
	);

	cleanup();
} );

test.afterAll( () => {
	cleanup();
} );

test.describe( 'the Instellingen screen', () => {
	test( 'is registered under the post type menu, for edit_posts', async () => {
		const entry = wpEvalJson(
			"global $submenu; require_once ABSPATH . 'wp-admin/includes/plugin.php';" +
				' do_action( "admin_menu" );' +
				" $found = null;" +
				" foreach ( (array) $submenu as $parent => $items ) {" +
				"   if ( $parent !== 'edit.php?post_type=soli_tv_message' ) { continue; }" +
				'   foreach ( $items as $item ) {' +
				"     if ( $item[2] === 'soli-tv-settings' ) {" +
				"       $found = array( 'parent' => $parent, 'cap' => $item[1], 'title' => $item[0] );" +
				'     }' +
				'   }' +
				' }' +
				' echo wp_json_encode( $found );'
		);

		expect( entry ).not.toBeNull();
		expect( entry.parent ).toBe( 'edit.php?post_type=soli_tv_message' );

		// edit_posts, not manage_options: turning a slide off is editorial
		// work and a committee member should not need to be an administrator.
		expect( entry.cap ).toBe( 'edit_posts' );
	} );

	test( 'lists messages with their window', async ( { page } ) => {
		seedMessage( 'listed' );
		await openSettings( page );

		const listed = row( page, MARKER + ' listed' );
		await expect( listed ).toBeVisible();

		// The year, not a formatted date: the screen formats in the admin's own
		// locale, so asserting "dec 2026" passed only while the formatter was
		// hardcoded to Dutch and broke the moment it followed the locale.
		await expect( listed ).toContainText( '2026' );
		// Neither fallback phrasing, whichever locale is active.
		await expect( listed ).not.toContainText( 'altijd zichtbaar' );
		await expect( listed ).not.toContainText( 'always visible' );
	} );

	test( 'writes a message switch onto that post', async ( { page } ) => {
		const id = seedMessage( 'switch' );
		await openSettings( page );

		const toggle = row( page, MARKER + ' switch' ).getByRole( 'checkbox' );
		await expect( toggle ).toBeChecked();
		await toggle.click();

		await expect.poll( () => disabledFlag( id ), { timeout: 15000 } ).toBe( true );
	} );

	test( 'writes an event switch onto the event post, not the date row', async ( {
		page,
	} ) => {
		test.skip(
			! eventsAvailable,
			'wp-soli-event-plugin is not installed in this environment'
		);

		const seeded = seedEventWithTwoDates( 'agenda' );
		await openSettings( page );

		const toggle = row( page, MARKER + ' agenda' ).getByRole( 'checkbox' );
		await expect( toggle ).toBeChecked();
		await toggle.click();

		await expect
			.poll( () => disabledFlag( seeded.post ), { timeout: 15000 } )
			.toBe( true );

		// The ids the block stored were event_dates row ids. Writing this
		// plugin's meta against one of those lands on whatever unrelated post
		// carries that number, so nothing may appear on them.
		for ( const dateId of seeded.dates ) {
			if ( dateId !== seeded.post ) {
				expect( disabledFlag( dateId ) ).toBe( false );
			}
		}
	} );

	test( 'shows one switch for an event with two dates', async ( { page } ) => {
		test.skip(
			! eventsAvailable,
			'wp-soli-event-plugin is not installed in this environment'
		);

		await openSettings( page );

		// Two switches writing the same post meta would leave one of them
		// looking broken the moment the other is used.
		await expect(
			page
				.locator( '.soli-tv-settings__row' )
				.filter( { hasText: MARKER + ' agenda' } )
		).toHaveCount( 1 );
	} );

	test( 'links each row to the post behind it', async ( { page } ) => {
		const id = seedMessage( 'link' );
		await openSettings( page );

		// The edit screen of that exact post: the row carries a switch and a
		// date, and everything else about the item is edited on the post.
		await expect(
			row( page, MARKER + ' link' ).locator( '.soli-tv-settings__edit' )
		).toHaveAttribute( 'href', new RegExp( 'post=' + id + '(&|$)' ) );
	} );

	test( 'marks a switched-on message that the screen will not show', async ( {
		page,
	} ) => {
		// A draft is listed here and never reaches /tv/, which reads publish
		// only. With the switch on and no explanation that looked like a broken
		// screen rather than an unpublished message.
		wpEval(
			"wp_insert_post( array( 'post_type' => 'soli_tv_message'," +
				" 'post_status' => 'draft', 'post_title' => '" +
				MARKER +
				" concept' ) );" +
				" wp_insert_post( array( 'post_type' => 'soli_tv_message'," +
				" 'post_status' => 'publish', 'post_title' => '" +
				MARKER +
				" open' ) );"
		);

		await openSettings( page );

		// The note is asserted by its class, never by its text: the copy is
		// translated and this suite runs against whichever locale is active.
		await expect(
			row( page, MARKER + ' concept' ).locator( '.soli-tv-settings__note' )
		).toBeVisible();

		// The control: published, no window, so it is on the screen right now
		// and must carry no note at all. `MARKER listed` is not usable here -
		// its window is a December one, so it earns a note of its own.
		await expect(
			row( page, MARKER + ' open' ).locator( '.soli-tv-settings__note' )
		).toHaveCount( 0 );
	} );

	test( 'lists events past the screen horizon, marked', async ( {
		page,
		request,
	} ) => {
		test.skip(
			! eventsAvailable,
			'wp-soli-event-plugin is not installed in this environment'
		);

		const limit = kioskEventLimit();
		seedEventSeries( limit + 5 );

		await openSettings( page );

		const eventRows = page.locator( '[data-slide-type="event"]' );

		// The list has to reach past the screen, or an event can never be
		// switched off before it appears - which is what this exists for.
		await expect
			.poll( () => eventRows.count(), { timeout: 30000 } )
			.toBeGreaterThan( limit );

		// The rows beyond the horizon say so rather than looking identical to
		// the ones that are actually on screen.
		await expect(
			eventRows.locator( '.soli-tv-settings__note' ).first()
		).toBeVisible();

		// And the screen itself stays capped, which is the other half of the
		// arrangement: a longer list must not lengthen the loop.
		const response = await request.get( '/tv/' );
		const payload = JSON.parse(
			/<script id="soli-tv-payload"[^>]*>([\s\S]*?)<\/script>/.exec(
				await response.text()
			)[ 1 ]
		);
		const onScreen = payload.slides
			.filter( ( slide ) => slide.slide_type === 'event' )
			.map( ( slide ) => slide.title );

		// Identity, never a total: earlier tests in this file switch events off,
		// so the screen legitimately carries fewer than `limit` slides and a
		// count assertion races them. The nearest of the seeded series is on
		// screen and the furthest is not, which is the cap itself.
		expect( onScreen ).toContain( MARKER + ' serie 1' );
		expect( onScreen ).not.toContain( MARKER + ' serie ' + ( limit + 5 ) );
		expect( onScreen.length ).toBeLessThanOrEqual( limit );
	} );

	test( 'saves the delay into the soli_tv_settings option', async ( { page } ) => {
		await openSettings( page );

		// Selected by class, not label: the label is translated and this suite
		// runs against whichever locale the environment happens to use.
		const delay = page.locator(
			'.soli-tv-setting--delay input[type="number"]'
		);
		await delay.fill( '45' );
		await delay.blur();

		await expect
			.poll( () => readOption().delay, { timeout: 15000 } )
			.toBe( 45 );
	} );
} );
