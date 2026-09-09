const { test, expect } = require( '@playwright/test' );

const { wpEval, wpEvalJson } = require( './helpers' );

/**
 * Covers the soli_tv_message post type and its registered meta.
 *
 * Nothing reads either yet: the slideshow still runs off {prefix}tv_message.
 * These assertions exist so the migration in step 3 of
 * PLAN-cpt-and-kiosk-route.md builds on a type whose schema is known to be
 * enforced, rather than on one that merely looks registered.
 *
 * The point of moving to registered meta was to stop validating by hand, so
 * most of what follows checks that WordPress rejects bad values without this
 * plugin containing any code to do it.
 */

// Serial: these write posts and read them back by id.
test.describe.configure( { mode: 'serial' } );

const MARKER = 'e2e-post-type';

/** Creates one message through the REST controller as the administrator. */
function createMessage( fields = {} ) {
	const body = JSON.stringify( {
		title: MARKER + ' ' + ( fields.title || 'message' ),
		status: 'publish',
		...fields,
		title: MARKER + ' ' + ( fields.title || 'message' ),
	} ).replace( /'/g, "\\'" );

	return wpEvalJson(
		"$r = new WP_REST_Request( 'POST', '/wp/v2/soli_tv_message' );" +
			" $r->set_body( '" + body + "' );" +
			" $r->set_header( 'content-type', 'application/json' );" +
			' $res = rest_do_request( $r );' +
			" echo wp_json_encode( array( 'status' => $res->get_status(), 'data' => $res->get_data() ) );"
	);
}

function deleteMarked() {
	wpEval(
		"$q = new WP_Query( array( 'post_type' => 'soli_tv_message'," +
			" 'post_status' => 'any', 'posts_per_page' => -1," +
			" 's' => '" + MARKER + "' ) );" +
			' foreach ( $q->posts as $p ) { wp_delete_post( $p->ID, true ); }'
	);
}

test.afterAll( () => {
	deleteMarked();
} );

test.describe( 'the soli_tv_message post type', () => {
	test( 'is registered and exposed over REST', async () => {
		const info = wpEvalJson(
			"$t = get_post_type_object( 'soli_tv_message' );" +
				' echo wp_json_encode( array(' +
				" 'exists' => (bool) $t," +
				" 'public' => $t->public," +
				" 'rest' => $t->show_in_rest," +
				" 'base' => $t->rest_base," +
				" 'supports' => array_keys( array_filter( get_all_post_type_supports( 'soli_tv_message' ) ) )" +
				' ) );'
		);

		expect( info.exists ).toBe( true );
		expect( info.rest ).toBe( true );
		expect( info.base ).toBe( 'soli_tv_message' );

		// Not public on purpose: a slide is not a URL.
		expect( info.public ).toBe( false );

		// page-attributes carries menu_order, which replaces sorting slides by
		// a hash of title and id.
		expect( info.supports ).toEqual(
			expect.arrayContaining( [
				'title',
				'editor',
				'thumbnail',
				'revisions',
				'page-attributes',
				// Without custom-fields the REST response carries no `meta` key
				// at all, so every meta assertion below would be vacuous.
				'custom-fields',
			] )
		);
	} );

	test( 'accepts a message with all its meta and reads it back', async () => {
		const response = createMessage( {
			title: 'full',
			content: 'body copy',
			meta: {
				_soli_tv_layout: 'text_only',
				_soli_tv_fit: 'contain',
				_soli_tv_start: '2026-03-01T09:00:00',
				_soli_tv_end: '2026-03-31T23:00:00',
				_soli_tv_link: 'https://soli.nl/agenda',
				_soli_tv_disabled: true,
			},
		} );

		expect( response.status ).toBe( 201 );

		const meta = response.data.meta;
		expect( meta._soli_tv_layout ).toBe( 'text_only' );
		expect( meta._soli_tv_fit ).toBe( 'contain' );
		expect( meta._soli_tv_start ).toBe( '2026-03-01T09:00:00' );
		expect( meta._soli_tv_link ).toBe( 'https://soli.nl/agenda' );
		expect( meta._soli_tv_disabled ).toBe( true );
	} );

	test( 'applies the declared defaults when meta is omitted', async () => {
		const response = createMessage( { title: 'defaults' } );

		expect( response.status ).toBe( 201 );
		expect( response.data.meta._soli_tv_layout ).toBe( 'img_text' );
		expect( response.data.meta._soli_tv_fit ).toBe( 'cover' );
		expect( response.data.meta._soli_tv_disabled ).toBe( false );
	} );

	test( 'rejects a layout outside the enum, with no validation code of ours', async () => {
		const response = createMessage( {
			title: 'bad-layout',
			meta: { _soli_tv_layout: 'whatever' },
		} );

		// This is the whole reason for registered meta: the plugin contains no
		// check for this. WordPress enforces the enum from the schema.
		expect( response.status ).toBe( 400 );
	} );

	test( 'rejects a fit outside the enum', async () => {
		const response = createMessage( {
			title: 'bad-fit',
			meta: { _soli_tv_fit: 'stretch' },
		} );

		expect( response.status ).toBe( 400 );
	} );

	test( 'rejects a window bound that is not a date-time', async () => {
		const response = createMessage( {
			title: 'bad-date',
			meta: { _soli_tv_start: 'tomorrow-ish' },
		} );

		// The ISO-8601-into-DATETIME defect came from dates crossing the wire
		// unchecked. format: date-time is what closes that off.
		expect( response.status ).toBe( 400 );
	} );

	test( 'refuses an anonymous create', async () => {
		// No wp_set_current_user, so this runs as nobody. Note this is the post
		// type's own create capability answering, not the meta auth_callback:
		// the request never reaches the meta. The callback is covered below.
		const response = JSON.parse(
			wpEval(
				"$r = new WP_REST_Request( 'POST', '/wp/v2/soli_tv_message' );" +
					" $r->set_body( '" +
					JSON.stringify( {
						title: MARKER + ' anonymous',
						meta: { _soli_tv_layout: 'img_only' },
					} ) +
					"' );" +
					" $r->set_header( 'content-type', 'application/json' );" +
					' $res = rest_do_request( $r );' +
					" echo wp_json_encode( array( 'status' => $res->get_status() ) );"
			)
				.split( /\r?\n/ )
				.filter( ( l ) => l.trim() )
				.pop()
		);

		expect( response.status ).toBe( 401 );
	} );

	test( 'writes protected meta only for a user who can edit the post', async () => {
		const created = createMessage( { title: 'meta-caps' } );
		expect( created.status ).toBe( 201 );

		// Two gates apply to `_`-prefixed meta, both measured 2026-09-09:
		//
		// - the registered auth_callback must permit. Making it return false
		//   blocks an administrator's write outright, so it is load-bearing.
		// - the post's own `edit_post` is checked first, which is what denies
		//   the subscriber below. That is also why the callback cannot be made
		//   stricter than `edit_posts` in any observable way.
		const caps = wpEvalJson(
			"$id = " + created.data.id + ';' +
				" $sub = get_user_by( 'login', 'soli_tv_meta_probe' );" +
				' if ( ! $sub ) {' +
				"   $sub = get_user_by( 'id', wp_insert_user( array(" +
				"     'user_login' => 'soli_tv_meta_probe'," +
				"     'user_pass' => wp_generate_password()," +
				"     'role' => 'subscriber' ) ) );" +
				' }' +
				' wp_set_current_user( 1 );' +
				" $admin = current_user_can( 'edit_post_meta', $id, '_soli_tv_layout' );" +
				' wp_set_current_user( $sub->ID );' +
				" $subscriber = current_user_can( 'edit_post_meta', $id, '_soli_tv_layout' );" +
				' wp_set_current_user( 1 );' +
				" echo wp_json_encode( array( 'admin' => $admin, 'subscriber' => $subscriber ) );"
		);

		expect( caps.admin ).toBe( true );
		expect( caps.subscriber ).toBe( false );
	} );
} );
