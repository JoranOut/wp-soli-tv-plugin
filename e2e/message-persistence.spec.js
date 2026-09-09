const { test, expect } = require( '@playwright/test' );

const { wpEval, wpEvalJson } = require( './helpers' );

/**
 * Covers what the soli_tv/v1 write path actually stores.
 *
 * `rest-api.spec.js` asserts the routes' public/authenticated surface from the
 * outside. These assertions go the other way: they drive the real route through
 * `rest_do_request()` as the administrator and then read the row back out of
 * `{prefix}tv_message`, because every bug here was a value silently arriving in
 * the database as something other than what was sent.
 *
 * Each test seeds and removes its own rows by title marker, so the suite may
 * keep running in parallel with the rest of the specs.
 */

const MARKER = 'e2e-persistence';

// Serial, not parallel: every test in this file reads and writes the single
// {prefix}tv_message table, and the cleanup below deletes by title marker. Run
// in parallel, one test's afterAll deletes rows another test is still asserting
// on - which showed up as `row` being null rather than as a real failure.
test.describe.configure( { mode: 'serial' } );

/** POSTs one message through the real REST route as the administrator. */
function postMessage( body ) {
	const payload = JSON.stringify( body ).replace( /'/g, "\\'" );

	return wpEvalJson(
		"$r = new WP_REST_Request( 'POST', '/soli_tv/v1/message'" +
			( body.id ? " . '/' . " + body.id : '' ) +
			' );' +
			" $r->set_body( '" +
			payload +
			"' );" +
			" $r->set_header( 'content-type', 'application/json' );" +
			' $res = rest_do_request( $r );' +
			" echo wp_json_encode( array( 'status' => $res->get_status(), 'data' => $res->get_data() ) );"
	);
}

/** Reads one row straight from the table, bypassing the plugin's own queries. */
function readRow( id ) {
	return wpEvalJson(
		'global $wpdb;' +
			' echo wp_json_encode( $wpdb->get_row( $wpdb->prepare(' +
			' "SELECT * FROM {$wpdb->prefix}tv_message WHERE id = %d", ' +
			id +
			' ), ARRAY_A ) );'
	);
}

function deleteMarkedRows() {
	wpEval(
		'global $wpdb;' +
			' $wpdb->query( $wpdb->prepare(' +
			' "DELETE FROM {$wpdb->prefix}tv_message WHERE title LIKE %s", ' +
			"'%" +
			MARKER +
			"%' ) );"
	);
}

/**
 * A valid message body. `title` is always prefixed with the marker so
 * `afterAll` can clean up exactly the rows this spec created.
 */
const baseMessage = ( { title = 'message', ...overrides } = {} ) => ( {
	type: 'img_text',
	content: 'body copy',
	start_date: '2026-03-01 09:00:00',
	end_date: '2026-03-31 23:00:00',
	status: 'published',
	...overrides,
	title: MARKER + ' ' + title,
} );

test.afterAll( () => {
	deleteMarkedRows();
} );

test.describe( 'soli_tv message persistence', () => {
	test( 'stores the active window and status it was given', async () => {
		const response = postMessage( baseMessage( { title: 'window' } ) );
		expect( response.status ).toBe( 200 );

		const row = readRow( response.data.id );

		// These three were previously overwritten client-side with
		// yesterday..+31 days and 'draft' on every save, so a scheduled or
		// published message was impossible.
		expect( row.start_date ).toBe( '2026-03-01 09:00:00' );
		expect( row.end_date ).toBe( '2026-03-31 23:00:00' );
		expect( row.status ).toBe( 'published' );
	} );

	test( 'stores a missing image as NULL rather than 0', async () => {
		const response = postMessage(
			baseMessage( { title: 'no-image', type: 'text_only' } )
		);
		expect( response.status ).toBe( 200 );

		const row = readRow( response.data.id );

		// img is a nullable BIGINT. Bound as %s through wpdb::prepare(), a null
		// became an empty string and landed as 0 - a valid-looking attachment
		// id pointing at nothing.
		expect( row.img ).toBeNull();
	} );

	test( 'stores an image id as the integer it was sent as', async () => {
		const response = postMessage(
			baseMessage( { title: 'with-image', img: 7 } )
		);
		expect( response.status ).toBe( 200 );

		const row = readRow( response.data.id );

		expect( parseInt( row.img, 10 ) ).toBe( 7 );
	} );

	test( 'updates an existing row instead of inserting a second one', async () => {
		const created = postMessage( baseMessage( { title: 'update' } ) );
		expect( created.status ).toBe( 200 );

		const updated = postMessage(
			baseMessage( {
				title: 'update',
				id: created.data.id,
				content: 'revised body copy',
				status: 'archived',
			} )
		);
		expect( updated.status ).toBe( 200 );

		const row = readRow( created.data.id );
		expect( row.content ).toBe( 'revised body copy' );
		expect( row.status ).toBe( 'archived' );
	} );

	test( 'accepts PLANNED, the status the schema assigns by default', async () => {
		const response = postMessage(
			baseMessage( { title: 'planned', status: 'PLANNED' } )
		);

		// A row created by a direct insert carries the column default PLANNED.
		// While validation rejected that value such a row could be read but
		// never saved again.
		expect( response.status ).toBe( 200 );
		expect( readRow( response.data.id ).status ).toBe( 'PLANNED' );
	} );

	test( 'still rejects a status outside the accepted set', async () => {
		const response = postMessage(
			baseMessage( { title: 'bad-status', status: 'whatever' } )
		);

		expect( response.status ).toBe( 400 );
	} );

	test( 'returns a single message by id', async () => {
		const created = postMessage( baseMessage( { title: 'single' } ) );

		const response = wpEvalJson(
			"$r = new WP_REST_Request( 'GET', '/soli_tv/v1/message/' . " +
				created.data.id +
				' );' +
				' $res = rest_do_request( $r );' +
				" echo wp_json_encode( array( 'status' => $res->get_status(), 'data' => $res->get_data() ) );"
		);

		// getSingleTVMessage() dropped its `return`, so this route answered null
		// - and therefore 204 - for every id that existed.
		expect( response.status ).toBe( 200 );
		expect( parseInt( response.data.id, 10 ) ).toBe( created.data.id );
		expect( response.data.title ).toContain( MARKER );
	} );

	test( 'answers 204 for an id that does not exist', async () => {
		const response = wpEvalJson(
			"$r = new WP_REST_Request( 'GET', '/soli_tv/v1/message/99999999' );" +
				' $res = rest_do_request( $r );' +
				" echo wp_json_encode( array( 'status' => $res->get_status() ) );"
		);

		expect( response.status ).toBe( 204 );
	} );
} );

test.describe( 'the active-message window', () => {
	test( 'includes a window that opened earlier today and excludes one that closed', async () => {
		// Both bounds are built in site-local time, the same basis the query
		// now compares against.
		const seed = ( title, startExpr, endExpr ) =>
			wpEvalJson(
				'global $wpdb;' +
					' $wpdb->insert( $wpdb->prefix . "tv_message", array(' +
					' "title" => "' +
					MARKER +
					' ' +
					title +
					'",' +
					' "type" => "text_only", "content" => "c",' +
					' "start_date" => ' +
					startExpr +
					',' +
					' "end_date" => ' +
					endExpr +
					',' +
					' "status" => "published" ) );' +
					' echo wp_json_encode( $wpdb->insert_id );'
			);

		// Opened an hour ago, closes in an hour: unambiguously active.
		const active = seed(
			'active-now',
			'current_time( "mysql", false )',
			'gmdate( "Y-m-d H:i:s", strtotime( current_time( "mysql" ) ) + 7200 )'
		);

		// Closed an hour ago, today. Against midnight-based `current_date` this
		// stayed on screen for the rest of the day.
		const closed = seed(
			'closed-earlier-today',
			'gmdate( "Y-m-d H:i:s", strtotime( current_time( "mysql" ) ) - 7200 )',
			'gmdate( "Y-m-d H:i:s", strtotime( current_time( "mysql" ) ) - 3600 )'
		);

		const ids = wpEvalJson(
			'$h = new \\Soli\\TV\\TVMessageTableHandler();' +
				' echo wp_json_encode( array_map( "intval", wp_list_pluck( $h->getTVMessages(), "id" ) ) );'
		);

		expect( ids ).toContain( active );
		expect( ids ).not.toContain( closed );
	} );
} );
