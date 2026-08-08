<?php

namespace Soli\TV;

/*
  Plugin Name: Soli TV Plugin
  Description: Drives the automated TV display for Muziekvereniging Soli.
  Version: 0.1.0
  Author: Joran Out
  License: GPL-2.0-or-later
  License URI: https://www.gnu.org/licenses/gpl-2.0.html
  Text Domain: soli-tv
  Domain Path: /languages
*/

if (!defined('ABSPATH')) exit; // Exit if accessed directly

require_once 'updater.php';
require_once 'lib/tv_message_table.php';
require_once 'lib/tv_message_endpoints.php';
require_once 'blocks/block.php';

define('SOLI_TV__PLUGIN_DIR_PATH', plugin_dir_path(__FILE__));
define('SOLI_TV__PLUGIN_DIR_URL', plugin_dir_url(__FILE__));
define('SOLI_TV__PLUGIN_VERSION', "0.1.0");

add_action('init', 'Soli\TV\loadTextdomain');
function loadTextdomain() {
    load_plugin_textdomain('soli-tv', false, dirname(plugin_basename(__FILE__)) . '/languages');
}

register_activation_hook(__FILE__, "Soli\TV\onActivate");
function onActivate() {
    $tvMessageTableHandler = new TVMessageTableHandler();
    $tvMessageTableHandler->createTVMessageTable();
    flush_rewrite_rules();
}

// Uninstall cleanup lives in uninstall.php, which WordPress prefers over
// register_uninstall_hook().

register_deactivation_hook(__FILE__, 'Soli\TV\onDeactivate');
function onDeactivate() {
    // don't do anything here, we don't need to unregister any post type
}


add_action('init', function () {

  include_once 'updater.php';

  if (!defined('WP_GITHUB_FORCE_UPDATE')) define('WP_GITHUB_FORCE_UPDATE', true);

  if (is_admin()) { // note the use of is_admin() to double check that this is happening in the admin

    $config = array(
      'slug' => plugin_basename(__FILE__), // this is the slug of your plugin
      'proper_folder_name' => plugin_basename(__FILE__), // this is the name of the folder your plugin lives in
      'api_url' => 'https://api.github.com/repos/JoranOut/wp-soli-tv-plugin', // the GitHub API url of your GitHub repo
      'raw_url' => 'https://raw.github.com/JoranOut/wp-soli-tv-plugin/main', // the GitHub raw url of your GitHub repo
      'github_url' => 'https://github.com/JoranOut/wp-soli-tv-plugin', // the GitHub url of your GitHub repo
      'zip_url' => 'https://github.com/JoranOut/wp-soli-tv-plugin/archive/wp-soli-tv-plugin.zip', // the zip url of the GitHub repo
      'sslverify' => true, // whether WP should check the validity of the SSL cert when getting an update, see https://github.com/jkudish/WordPress-GitHub-Plugin-Updater/issues/2 and https://github.com/jkudish/WordPress-GitHub-Plugin-Updater/issues/4 for details
      'requires' => '6.0.0', // which version of WordPress does your plugin require?
      'tested' => '6.3.1',  // which version of WordPress is your plugin tested up to?
      'readme' => 'README.md', // which file to use as the readme for the version number
    );

    new WP_GitHub_Updater($config);
  }

});

