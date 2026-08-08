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

require_once plugin_dir_path( __FILE__ ) . 'lib/tv_message_table.php';

$soli_tv_message_table_handler = new \Soli\TV\TVMessageTableHandler();
$soli_tv_message_table_handler->dropTVMessageTable();

delete_option( 'soli_tv_db_version' );
