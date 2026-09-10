const { test, expect } = require( '@playwright/test' );
const { execFileSync } = require( 'child_process' );
const path = require( 'path' );

const { wpEval, wpEvalJson } = require( './helpers' );

/**
 * Covers `wp soli-tv migrate` (step 3 of PLAN-cpt-and-kiosk-route.md).
 *
 * This is the upgrade test the root CLAUDE.md asks for, in the shape this
 * migration actually needs: seed all three sources, run the command, assert on
 * the posts, meta and option that come out. Data moves once and cannot be
 * un-moved, so the assertions are about what survives rather than what runs.
 */

test.describe.configure( { mode: 'serial' } );

const MARKER = 'spec-mig';

/**
 * Recreates the legacy `{prefix}tv_message` table.
 *
 * The plugin stopped creating it when the block was removed, so a fresh
 * install has no such table - and this spec exists to cover a site that still
 * does. Building it here is the honest fixture: the migration's whole purpose
 * is the upgrade path from that schema, and a spec that skipped when the table
 * was absent would silently stop covering it on CI, which is exactly where the
 * table never exists.
 *
 * The columns are the schema the plugin shipped, copied verbatim from the
 * handler that used to own it.
 */
function ensureLegacyTable() {
	wpEval(
		'global $wpdb;' +
			' $t = $wpdb->prefix . "tv_message";' +
			' if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $t ) ) === $t ) { return; }' +
			' $charset = $wpdb->get_charset_collate();' +
			' require_once ABSPATH . "wp-admin/includes/upgrade.php";' +
			' dbDelta( "CREATE TABLE $t (' +
			' id BIGINT(20) unsigned NOT NULL AUTO_INCREMENT,' +
			' title TEXT NOT NULL,' +
			" type VARCHAR(20) NOT NULL DEFAULT 'img_text'," +
			' content LONGTEXT NOT NULL,' +
			' start_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,' +
			' end_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,' +
			" status varchar(20) NOT NULL DEFAULT 'PLANNED'," +
			' img BIGINT(20),' +
			' link TEXT,' +
			' PRIMARY KEY  (id)' +
			' ) $charset;" );'
	);
}

function runMigrate( args = [] ) {
	return execFileSync(
		'npx',
		[ 'wp-env', 'run', 'tests-cli', '--', 'wp', 'soli-tv', 'migrate', ...args ],
		{ cwd: path.join( __dirname, '..' ), encoding: 'utf8' }
	);
}

/** Seeds one table row, three legacy posts and a page carrying the block. */
function seed() {
	return wpEvalJson(
		'global $wpdb; $t = $wpdb->prefix . "tv_message";' +
			' $wpdb->insert( $t, array(' +
			' "title" => "' + MARKER + '-row", "type" => "img_text", "content" => "body",' +
			' "start_date" => "2026-03-01 09:00:00", "end_date" => "2026-03-31 23:00:00",' +
			' "status" => "archived", "link" => "https://soli.nl/agenda" ),' +
			' array( "%s","%s","%s","%s","%s","%s","%s" ) );' +
			' $row = $wpdb->insert_id;' +
			' $legacy = array();' +
			' foreach ( array( "pic_with_text", "pic_with_text_contain", "pic_only" ) as $i => $layout ) {' +
			'   $id = wp_insert_post( array( "post_type" => "tv", "post_status" => "publish",' +
			'     "post_title" => "' + MARKER + '-legacy-" . $layout, "post_content" => "legacy" ) );' +
			'   update_post_meta( $id, "tv_post_type", $layout );' +
			'   if ( $i === 2 ) { update_post_meta( $id, "invisible_on_tv", 1 ); }' +
			'   $legacy[] = $id;' +
			' }' +
			' $attrs = wp_json_encode( array(' +
			'   "disabledSlides" => array( "messages" => array( $row ), "events" => array( 999999 ) ),' +
			'   "settings" => array( "delay" => 35 ) ) );' +
			' $page = wp_insert_post( array( "post_type" => "page", "post_status" => "publish",' +
			'   "post_title" => "' + MARKER + '-page",' +
			'   "post_content" => "<!-- wp:soli/tv-settings " . $attrs . " /-->" ) );' +
			' echo wp_json_encode( array( "row" => $row, "legacy" => $legacy, "page" => $page ) );'
	);
}

/** Every migrated message, keyed by title, with its meta. */
function readMessages() {
	return wpEvalJson(
		'$q = new WP_Query( array( "post_type" => "soli_tv_message",' +
			' "post_status" => "any", "posts_per_page" => -1 ) );' +
			' $out = array();' +
			' foreach ( $q->posts as $p ) {' +
			'   if ( strpos( $p->post_title, "' + MARKER + '" ) !== 0 ) { continue; }' +
			'   $out[ $p->post_title ] = array(' +
			'     "status" => $p->post_status,' +
			'     "layout" => get_post_meta( $p->ID, "_soli_tv_layout", true ),' +
			'     "fit" => get_post_meta( $p->ID, "_soli_tv_fit", true ),' +
			'     "start" => get_post_meta( $p->ID, "_soli_tv_start", true ),' +
			'     "end" => get_post_meta( $p->ID, "_soli_tv_end", true ),' +
			'     "link" => get_post_meta( $p->ID, "_soli_tv_link", true ),' +
			'     "disabled" => (bool) get_post_meta( $p->ID, "_soli_tv_disabled", true ),' +
			'   );' +
			' }' +
			' echo wp_json_encode( $out );'
	);
}

function cleanup() {
	// The DELETE is guarded: the table no longer exists on a fresh install, and
	// an unguarded statement against a missing table prints a wpdb error that
	// then breaks the next wp eval JSON read.
	wpEval(
		'global $wpdb; $t = $wpdb->prefix . "tv_message";' +
			' if ( $wpdb->get_var( $wpdb->prepare( "SHOW TABLES LIKE %s", $t ) ) === $t ) {' +
			'   $wpdb->query( $wpdb->prepare( "DELETE FROM $t WHERE title LIKE %s", "' + MARKER + '%" ) );' +
			' }' +
			' $q = new WP_Query( array( "post_type" => array( "soli_tv_message", "tv", "page" ),' +
			'   "post_status" => "any", "posts_per_page" => -1, "s" => "' + MARKER + '" ) );' +
			' foreach ( $q->posts as $p ) {' +
			'   if ( strpos( $p->post_title, "' + MARKER + '" ) === 0 ) { wp_delete_post( $p->ID, true ); }' +
			' }' +
			" delete_option( 'soli_tv_settings' );" +
			// Meta for a post that does not exist is not removed by deleting
			// posts, and the orphan-guard test asserts the absence of exactly
			// this row. Without clearing it, one failing run leaves residue
			// that makes the next run fail for the previous run's reason.
			' $wpdb->delete( $wpdb->postmeta, array( "post_id" => 999999 ) );'
	);
}

test.beforeAll( () => {
	ensureLegacyTable();
	cleanup();
} );

test.afterAll( () => {
	cleanup();
} );

test.describe( 'wp soli-tv migrate', () => {
	let seeded;

	test( '--dry-run reports the work and writes nothing', async () => {
		seeded = seed();

		const output = runMigrate( [ '--dry-run' ] );

		expect( output ).toContain( 'Dry run: nothing will be written.' );
		expect( output ).toContain( MARKER + '-row' );
		// Asserted on this spec's own rows, never on the totals. The migration
		// is global by nature and spec files run in parallel, so another spec's
		// tv_message rows land in the same report and any count assertion
		// races them.
		expect( output ).toContain( MARKER + '-row" -> post' );
		expect( output ).toContain( MARKER + '-legacy-pic_with_text" ->' );

		// The dry run cannot resolve a message id to a post it has not created,
		// so it says so rather than reporting a resolution failure.
		expect( output ).toContain( 'stays off -> post (to be created)' );

		// Nothing moved.
		expect( Object.keys( readMessages() ) ).toHaveLength( 0 );

		const legacyLeft = wpEvalJson(
			'global $wpdb; echo wp_json_encode( (int) $wpdb->get_var(' +
				' "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = \'tv\'" ) );'
		);
		expect( legacyLeft ).toBe( 3 );
	} );

	test( 'moves table rows onto posts with their window and link intact', async () => {
		runMigrate();

		const messages = readMessages();
		const row = messages[ MARKER + '-row' ];

		expect( row ).toBeDefined();

		// archived folds into draft: nothing ever wrote that status and nothing
		// read `status` at all, so the window says when a message is done.
		expect( row.status ).toBe( 'draft' );

		// Substituted, not reformatted. Running the stored value through
		// strtotime()/gmdate() would reinterpret it in UTC and shift the window
		// by the site's offset.
		expect( row.start ).toBe( '2026-03-01T09:00:00' );
		expect( row.end ).toBe( '2026-03-31T23:00:00' );
		expect( row.link ).toBe( 'https://soli.nl/agenda' );
		expect( row.layout ).toBe( 'img_text' );
	} );

	test( 'keeps the legacy contain layout as a separate fit', async () => {
		const messages = readMessages();

		// The distinction the plan exists to preserve: legacy had
		// pic_with_text and pic_with_text_contain as separate layouts, and
		// collapsing both onto img_text would discard a per-message choice.
		expect( messages[ MARKER + '-legacy-pic_with_text' ].fit ).toBe( 'cover' );
		expect( messages[ MARKER + '-legacy-pic_with_text_contain' ].fit ).toBe(
			'contain'
		);
		expect( messages[ MARKER + '-legacy-pic_with_text_contain' ].layout ).toBe(
			'img_text'
		);
		expect( messages[ MARKER + '-legacy-pic_only' ].layout ).toBe( 'img_only' );
	} );

	test( 'carries invisible_on_tv over as the disabled flag', async () => {
		const messages = readMessages();

		expect( messages[ MARKER + '-legacy-pic_only' ].disabled ).toBe( true );
		expect( messages[ MARKER + '-legacy-pic_with_text' ].disabled ).toBe(
			false
		);
	} );

	test( 'turns off a message the block attributes had disabled', async () => {
		// This is the toggle that never reached the TV, because it lived in a
		// block attribute. After migration it is on the item.
		expect( readMessages()[ MARKER + '-row' ].disabled ).toBe( true );
	} );

	test( 'moves the block settings into the option', async () => {
		const option = wpEvalJson(
			"echo wp_json_encode( get_option( 'soli_tv_settings' ) );"
		);

		expect( option.delay ).toBe( 35 );
	} );

	test( 'leaves no legacy tv posts behind', async () => {
		const left = wpEvalJson(
			'global $wpdb; echo wp_json_encode( (int) $wpdb->get_var(' +
				' "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = \'tv\'" ) );'
		);

		expect( left ).toBe( 0 );
	} );

	test( 'writes no meta for an id whose post is gone', async () => {
		// The page disabled event 999999, which does not exist. Writing meta
		// against a missing post would leave an orphan row nothing reads.
		const orphan = wpEvalJson(
			"echo wp_json_encode( get_post_meta( 999999, '_soli_tv_disabled', true ) );"
		);

		expect( orphan ).toBe( '' );
	} );

	test( 'is idempotent', async () => {
		const before = Object.keys( readMessages() ).length;
		const output = runMigrate();

		// Again spec-owned: this run must not move this spec's row a second
		// time, and must not find a legacy post to convert. Totals would
		// count other specs' rows.
		expect( output ).not.toContain( MARKER + '-row" -> post' );
		expect( output ).toContain( 'Legacy tv posts: 0 converted' );
		expect( Object.keys( readMessages() ) ).toHaveLength( before );
	} );
} );
