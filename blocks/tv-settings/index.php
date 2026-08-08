<?php

/*
  Description: Block which shows TV settings.
*/
class SoliTVSettingsBlock {
  function __construct() {
    add_action('init', array($this, 'adminAssets'));
  }

  /**
   * Reads the dependency list webpack generated for a bundle.
   *
   * Keeps the registered dependencies in step with what the source actually
   * imports, instead of a hand-maintained list that drifts. Falls back to the
   * minimum needed to boot when the bundle has not been built yet.
   */
  private function assetFor($handle, $fallback) {
    $asset_path = plugin_dir_path(__FILE__) . 'build/' . $handle . '.asset.php';

    if (file_exists($asset_path)) {
      $asset = include $asset_path;
      if (is_array($asset) && !empty($asset['dependencies'])) {
        return array(
          'dependencies' => $asset['dependencies'],
          'version' => isset($asset['version']) ? $asset['version'] : SOLI_TV__PLUGIN_VERSION,
        );
      }
    }

    return array('dependencies' => $fallback, 'version' => SOLI_TV__PLUGIN_VERSION);
  }

  function adminAssets() {
    if (!function_exists('is_plugin_active')) {
      include_once(ABSPATH . 'wp-admin/includes/plugin.php');
    }

    $editor_asset = $this->assetFor('index', array('wp-blocks', 'wp-element', 'wp-editor', 'wp-api-fetch', 'wp-i18n'));

    wp_register_style('block-tv-settings-css', plugin_dir_url(__FILE__) . 'build/index.css', array(), SOLI_TV__PLUGIN_VERSION);
    wp_register_script('block-tv-settings-js', plugin_dir_url(__FILE__) . 'build/index.js', $editor_asset['dependencies'], $editor_asset['version']);
    wp_set_script_translations('block-tv-settings-js', 'soli-tv', SOLI_TV__PLUGIN_DIR_PATH . 'languages');
    wp_localize_script('block-tv-settings-js', 'SoliTVData', array(
        'isSoliEventsPluginActive' => is_plugin_active('wp-soli-event-plugin/soli-event-plugin.php'),
    ));

    register_block_type('soli/tv-settings', array(
      'editor_script' => 'block-tv-settings-js',
      'editor_style' => 'block-tv-settings-css',
      'render_callback' => array($this, 'theHTML'),
      'attributes' => array(
        'selectedGroups' => array(
          'type' => 'array',
          'default' => array(),
        ),
      ),
    ));

  }

  function theHTML($attributes) {
    $frontend_asset = $this->assetFor('frontend', array('wp-blocks', 'wp-element', 'wp-api-fetch', 'wp-i18n'));

    wp_enqueue_script('block-tv-settings-frontend', plugin_dir_url(__FILE__) . 'build/frontend.js', $frontend_asset['dependencies'], $frontend_asset['version'], true);
    wp_set_script_translations('block-tv-settings-frontend', 'soli-tv', SOLI_TV__PLUGIN_DIR_PATH . 'languages');
    wp_enqueue_style('block-tv-settings-frontend-styles', plugin_dir_url(__FILE__) . 'build/frontend.css');
    wp_localize_script('block-tv-settings-frontend', 'SoliTVData', array(
        'isSoliEventsPluginActive' => is_plugin_active('wp-soli-event-plugin/soli-event-plugin.php'),
    ));


      ob_start(); ?>
      <div class="block-tv-settings"
           data-attributes="<?php echo htmlspecialchars(json_encode($attributes['selectedGroups']), ENT_QUOTES, 'UTF-8'); ?>"></div>
    <?php return ob_get_clean();
  }
}

$soliBlockIssueTracker = new SoliTVSettingsBlock();

function modify_post_type_args($args, $post_type) {
  if ('post' === $post_type || 'page' === $post_type) {
    $args['template'] = array(
      array('soli/tv-settings', array(
        'lock' => array(
          'move' => true,
          'remove' => true
        )
      )),
      // You can add more blocks to the template here if needed
    );
//    $args['template_lock'] = 'all'; // Optional: Lock the template to prevent users from removing default blocks
  }
  return $args;
}

add_filter('register_post_type_args', 'modify_post_type_args', 10, 2);

function register_soli_groups_meta() {
  $post_types = array('post', 'page', 'soli_event');

  foreach ($post_types as $post_type) {
    register_post_meta($post_type, 'soli_groups', array(
      'show_in_rest' => array(
        'schema' => array(
          'type' => 'array',
          'items' => array(
            'type' => 'string',
          ),
        ),
      ),
      'single' => true,
      'type' => 'array',
      'auth_callback' => function () use ($post_type) {
        return ($post_type === 'post') ? current_user_can('edit_posts') : current_user_can('edit_pages');
      },
    ));
  }
}

add_action('init', 'register_soli_groups_meta');

function soli_tv_block_excerpt_elipsis_more( $more ) {
    return '...';
}
add_filter( 'excerpt_more', 'soli_tv_block_excerpt_elipsis_more' );