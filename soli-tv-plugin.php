<?php

namespace Soli\TV;

/*
  Plugin Name: Soli TV Plugin
  Version: 0.0.1
  Author: Joran Out
*/

require_once 'updater.php';
require_once 'lib/tv_message_table.php';
require_once 'lib/tv_message_endpoints.php';
require_once 'blocks/block.php';

if (!defined('ABSPATH')) exit; // Exit if accessed directly
define('SOLI_TV__PLUGIN_DIR_PATH', plugin_dir_path(__FILE__));
define('SOLI_TV__PLUGIN_DIR_URL', plugin_dir_url(__FILE__));
define('SOLI_TV__PLUGIN_VERSION', "0.0.1");

register_activation_hook(__FILE__, "Soli\TV\onActivate");
function onActivate() {
    $tvMessageTableHandler = new TVMessageTableHandler();
    $tvMessageTableHandler->createTVMessageTable();
    flush_rewrite_rules();
}

register_uninstall_hook(__FILE__, 'Soli\TV\onUninstall');
function onUninstall() {
    $tvMessageTableHandler = new TVMessageTableHandler();
    $tvMessageTableHandler->dropEventTable();
}

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
      'raw_url' => 'https://raw.github.com/JoranOut/wp-soli-tv-plugin/master', // the GitHub raw url of your GitHub repo
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

