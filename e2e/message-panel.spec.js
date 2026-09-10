const { test, expect } = require( '@playwright/test' );

const { wpEval, wpEvalJson } = require( './helpers' );

/**
 * Covers the soli_tv_message sidebar panel (step 4 of
 * PLAN-cpt-and-kiosk-route.md).
 *
 * Driven through the real editor rather than through REST: the point of the
 * panel is that someone can set these fields in wp-admin, and the REST layer
 * behind it is already covered by e2e/post-type.spec.js.
 */

test.describe.configure( { mode: 'serial' } );

const MARKER = 'spec-panel';

function createMessage( title ) {
	return wpEvalJson(
		'echo wp_json_encode( wp_insert_post( array(' +
			" 'post_type' => 'soli_tv_message'," +
			" 'post_status' => 'draft'," +
			" 'post_title' => '" + MARKER + ' ' + title + "' ) ) );"
	);
}

function createPost( title ) {
	return wpEvalJson(
		'echo wp_json_encode( wp_insert_post( array(' +
			" 'post_type' => 'post'," +
			" 'post_status' => 'draft'," +
			" 'post_title' => '" + MARKER + ' ' + title + "' ) ) );"
	);
}

function readMeta( id ) {
	return wpEvalJson(
		'$id = ' + id + ';' +
			' echo wp_json_encode( array(' +
			" 'layout' => get_post_meta( $id, '_soli_tv_layout', true )," +
			" 'fit' => get_post_meta( $id, '_soli_tv_fit', true )," +
			" 'start' => get_post_meta( $id, '_soli_tv_start', true )," +
			" 'link' => get_post_meta( $id, '_soli_tv_link', true )," +
			" 'disabled' => (bool) get_post_meta( $id, '_soli_tv_disabled', true )" +
			' ) );'
	);
}

/**
 * Turns off the block editor's welcome guide for the admin user.
 *
 * A fresh user gets the guide as a modal over the whole editor, and every click
 * in this spec then times out. It never showed locally because the preference
 * had been dismissed by hand months earlier - so these tests passed here and
 * failed on CI, where the user is new. Set rather than clicked away: a modal
 * that has to be closed first is one more thing to race.
 *
 * Both scopes are written because the key has moved between them across
 * WordPress versions, and this suite runs against two.
 */
function dismissWelcomeGuide() {
	wpEval(
		'update_user_meta( 1, "wp_persisted_preferences", array(' +
			' "core" => array( "welcomeGuide" => false ),' +
			' "core/edit-post" => array( "welcomeGuide" => false ),' +
			' "_modified" => gmdate( "c" ) ) );'
	);
}

/** Opens the editor and expands the panel, which renders collapsed. */
async function openPanel( page, id ) {
	await page.goto( `/wp-admin/post.php?post=${ id }&action=edit`, {
		// Not networkidle: the editor keeps connections open and never reaches
		// it, so the navigation times out while the page is perfectly usable.
		waitUntil: 'domcontentloaded',
	} );

	const panel = page.locator( '.soli-tv-message-panel' );
	await expect( panel ).toBeVisible( { timeout: 30000 } );

	// Expanded state is itself a stored preference (`openPanels`), so this
	// checks rather than assumes: locally the panel was already open from
	// earlier manual use, which hid the fact that a fresh user gets it closed.
	const toggle = panel.locator( 'button.components-panel__body-toggle' );
	if ( ( await toggle.getAttribute( 'aria-expanded' ) ) !== 'true' ) {
		await toggle.click();
	}

	return panel;
}

function cleanup() {
	wpEval(
		"$q = new WP_Query( array( 'post_type' => array( 'soli_tv_message', 'post' )," +
			" 'post_status' => 'any', 'posts_per_page' => -1, 's' => '" + MARKER + "' ) );" +
			' foreach ( $q->posts as $p ) {' +
			"   if ( strpos( $p->post_title, '" + MARKER + "' ) === 0 ) { wp_delete_post( $p->ID, true ); }" +
			' }'
	);
}

test.beforeAll( () => {
	cleanup();
	dismissWelcomeGuide();
} );

test.afterAll( () => {
	cleanup();
} );

test.describe( 'the Tv bericht sidebar panel', () => {
	test( 'shows every field on a soli_tv_message', async ( { page } ) => {
		const id = createMessage( 'fields' );
		const panel = await openPanel( page, id );

		await expect( panel.getByLabel( 'Layout' ) ).toBeVisible();
		await expect(
			panel.getByLabel( 'Afbeelding vullend of passend' )
		).toBeVisible();
		await expect( panel.getByLabel( 'Zichtbaar vanaf' ) ).toBeVisible();
		await expect( panel.getByLabel( 'Zichtbaar tot' ) ).toBeVisible();
		await expect( panel.getByLabel( 'URL voor QR-code' ) ).toBeVisible();
		await expect( panel.getByLabel( 'Nu niet tonen' ) ).toBeVisible();
	} );

	test( 'hides the fit control for a text-only slide', async ( { page } ) => {
		const id = createMessage( 'text-only' );
		const panel = await openPanel( page, id );

		await panel.getByLabel( 'Layout' ).selectOption( 'text_only' );

		// A control that cannot apply is noise, so it goes rather than greying
		// out.
		await expect(
			panel.getByLabel( 'Afbeelding vullend of passend' )
		).toBeHidden();
	} );

	test( 'saves what was set in the panel onto the post meta', async ( {
		page,
	} ) => {
		const id = createMessage( 'roundtrip' );
		const panel = await openPanel( page, id );

		await panel.getByLabel( 'Layout' ).selectOption( 'img_only' );
		await panel.getByLabel( 'Afbeelding vullend of passend' ).selectOption( 'contain' );
		await panel
			.getByLabel( 'Zichtbaar vanaf' )
			.fill( '2026-04-01T09:30' );
		await panel
			.getByLabel( 'URL voor QR-code' )
			.fill( 'https://soli.nl/tv' );
		await panel.getByLabel( 'Nu niet tonen' ).click();

		// Clicking the save-state button, not Ctrl+S: the shortcut does not
		// reach the editor from a sidebar input, and measured on 2026-09-10 it
		// fired no REST request at all. Saving the draft rather than publishing
		// keeps post_status out of what this asserts.
		//
		// Do not assert on this button being *visible* to confirm a save: it is
		// always visible, reading "Saved" when clean, so such an assertion
		// passes without anything having been written. Wait for the text.
		// The two states use different elements, which is easy to get wrong:
		// while the post is clean the header holds `.editor-post-saved-state`
		// reading "Saved"; once it is dirty that element is *replaced* by a
		// "Save draft" button. A selector for one is absent in the other.
		const saveDraft = page.getByRole( 'button', { name: /Save draft/i } );
		await expect( saveDraft ).toBeVisible( { timeout: 30000 } );
		await saveDraft.click();

		// Back to the clean state, which is the actual evidence of a save.
		await expect(
			page.locator( '.editor-post-saved-state' )
		).toHaveText( /Saved/i, { timeout: 30000 } );

		// Poll anyway: the REST save resolves before this reads the database
		// through a separate wp-cli process.
		await expect
			.poll( () => readMeta( id ).layout, { timeout: 15000 } )
			.toBe( 'img_only' );

		const meta = readMeta( id );
		expect( meta.fit ).toBe( 'contain' );
		expect( meta.start ).toBe( '2026-04-01T09:30' );
		expect( meta.link ).toBe( 'https://soli.nl/tv' );
		expect( meta.disabled ).toBe( true );
	} );

	test( 'stays off an ordinary post', async ( { page } ) => {
		const id = createPost( 'ordinary' );

		await page.goto( `/wp-admin/post.php?post=${ id }&action=edit`, {
			waitUntil: 'domcontentloaded',
		} );

		// Wait for the editor itself before asserting an absence, or the
		// assertion passes simply because nothing has rendered yet.
		await expect(
			page.locator( '.edit-post-header, .editor-header' ).first()
		).toBeVisible( { timeout: 30000 } );

		await expect( page.locator( '.soli-tv-message-panel' ) ).toHaveCount( 0 );
	} );
} );
