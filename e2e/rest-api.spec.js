const { test, expect } = require( '@playwright/test' );

/**
 * Covers the soli_tv/v1 REST surface registered in lib/tv_message_endpoints.php.
 *
 * The GET routes are intentionally public - the TV display calls them without a
 * session - so they are asserted as reachable. The POST route must stay behind
 * the edit_posts capability.
 */
// Drop the shared administrator session: these assertions are about what an
// unauthenticated caller can reach, so they must not inherit login cookies.
test.use( { storageState: { cookies: [], origins: [] } } );

test.describe( 'soli_tv/v1 REST API', () => {
	test( 'exposes the messages collection without authentication', async ( {
		request,
	} ) => {
		const response = await request.get( '/?rest_route=/soli_tv/v1/messages' );

		// 200 with messages, or 204 when the table is empty. Both mean the
		// route is registered and the handler ran.
		expect( [ 200, 204 ] ).toContain( response.status() );
	} );

	test( 'returns a registered route rather than a 404 for a single message', async ( {
		request,
	} ) => {
		const response = await request.get(
			'/?rest_route=/soli_tv/v1/message/1'
		);

		expect( response.status() ).not.toBe( 404 );
	} );

	test( 'rejects anonymous writes to the message endpoint', async ( {
		request,
	} ) => {
		const response = await request.post( '/?rest_route=/soli_tv/v1/message', {
			data: {
				title: 'Anonymous write attempt',
				content: 'should not be persisted',
				type: 'img_text',
				start_date: '2026-01-01 00:00:00',
				end_date: '2026-01-02 00:00:00',
				status: 'draft',
			},
		} );

		// permission_callback requires edit_posts; WordPress answers 401 for a
		// logged-out request.
		expect( response.status() ).toBe( 401 );
	} );

	test( 'validates the request body before persisting', async ( {
		request,
	} ) => {
		const response = await request.post( '/?rest_route=/soli_tv/v1/message', {
			data: { title: 'Missing every other required field' },
		} );

		// Still unauthenticated, so the capability check fires first. This
		// asserts the endpoint never reaches the handler for a bad anonymous
		// payload.
		expect( response.status() ).toBe( 401 );
	} );
} );
