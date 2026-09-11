<?php
/**
 * Runs when the plugin is deleted from wp-admin.
 *
 * WordPress prefers this file over register_uninstall_hook(), and it is the
 * only cleanup path the plugin registers.
 *
 * @package Soli\TV
 */

// Exit if not called by WordPress during uninstall.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// A second copy of this plugin may still be active - for instance when another
// version is installed alongside this one and this folder is the one being
// deleted. Removing shared data would break that active copy, so bail out.
$soli_tv_active = (array) get_option( 'active_plugins', array() );
if ( is_multisite() ) {
	$soli_tv_active = array_merge( $soli_tv_active, array_keys( (array) get_site_option( 'active_sitewide_plugins', array() ) ) );
}
foreach ( $soli_tv_active as $soli_tv_active_file ) {
	if ( basename( $soli_tv_active_file ) === 'soli-tv-plugin.php' && dirname( $soli_tv_active_file ) !== basename( __DIR__ ) ) {
		return;
	}
}
unset( $soli_tv_active, $soli_tv_active_file );

global $wpdb;

// The legacy messages table. Nothing reads it since the move to the
// soli_tv_message post type, and `wp soli-tv migrate` copies it across, but the
// data is left in place until a site has been migrated - so the drop belongs
// here, on delete, and nowhere else. Inlined because the handler class that
// used to own it is gone.
$wpdb->query( 'DROP TABLE IF EXISTS ' . $wpdb->prefix . 'tv_message' );

delete_option( 'soli_tv_db_version' );
delete_option( 'soli_tv_settings' );
delete_option( 'soli_tv_rewrite_version' );

// Per-item state on the posts themselves. Deleting the posts is the user's
// call; these keys are this plugin's and go with it.
foreach ( array(
	'_soli_tv_layout',
	'_soli_tv_fit',
	'_soli_tv_start',
	'_soli_tv_end',
	'_soli_tv_link',
	'_soli_tv_disabled',
	'_soli_tv_migrated_from',
) as $soli_tv_meta_key ) {
	delete_post_meta_by_key( $soli_tv_meta_key );
}
