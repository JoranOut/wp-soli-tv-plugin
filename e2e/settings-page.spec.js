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

function disabledFlag( id ) {
	return wpEvalJson(
		'echo wp_json_encode( (bool) get_post_meta( ' + id + ", '_soli_tv_disabled', true ) );"
	);
}

function readOption() {
	return wpEvalJson( "echo wp_json_encode( get_option( 'soli_tv_settings' ) );" );
}

function cleanup() {
	wpEval(
		'global $wpdb;' +
			" $q = new WP_Query( array( 'post_type' => array( 'soli_tv_message', 'soli_event' )," +
			" 'post_status' => 'any', 'posts_per_page' => -1, 's' => '" + MARKER + "' ) );" +
			' foreach ( $q->posts as $p ) {' +
			"   if ( strpos( $p->post_title, '" + MARKER + "' ) === 0 ) {" +
			'     $wpdb->delete( $wpdb->prefix . "event_dates", array( "post_id" => $p->ID ) );' +
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
		await expect( listed ).toContainText( 'dec 2026' );
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
		await openSettings( page );

		// Two switches writing the same post meta would leave one of them
		// looking broken the moment the other is used.
		await expect(
			page
				.locator( '.soli-tv-settings__row' )
				.filter( { hasText: MARKER + ' agenda' } )
		).toHaveCount( 1 );
	} );

	test( 'saves the delay into the soli_tv_settings option', async ( { page } ) => {
		await openSettings( page );

		const slider = page.getByRole( 'spinbutton', {
			name: /Seconden per slide/i,
		} );
		await slider.fill( '45' );
		await slider.blur();

		await expect
			.poll( () => readOption().delay, { timeout: 15000 } )
			.toBe( 45 );
	} );
} );
