<?php

namespace Soli\TV;

if (!defined('ABSPATH')) exit;

/**
 * `Tv berichten` -> `Instellingen`: the overview screen.
 *
 * Step 5 of PLAN-cpt-and-kiosk-route.md, and the shape the legacy theme had
 * (`add_submenu_page('edit.php?post_type=tv', 'Instellingen', ...)`).
 *
 * This replaces the block's edit view as the place to decide what the screen
 * shows. The two things that view stored in block attributes now live where
 * they belong: the per-item on/off flag is `_soli_tv_disabled` meta on the item,
 * and the rest is the `soli_tv_settings` option.
 *
 * Capability is `edit_posts`, not `manage_options`: turning a slide off is
 * editorial work, and the point of the screen is that a committee member can do
 * it without being an administrator.
 */

const SETTINGS_OPTION = 'soli_tv_settings';

/**
 * How far ahead the `Instellingen` list reaches, in event dates.
 *
 * Deliberately larger than `KIOSK_EVENT_LIMIT`: the point of the list is to
 * switch an event off *before* it reaches the screen, which is impossible when
 * the list stops exactly where the screen does. Rows past the screen's own
 * horizon are marked rather than hidden.
 */
const SETTINGS_EVENT_HORIZON = 100;

const SETTINGS_DEFAULT = array(
    'delay'          => 20,
    'onlyConcerts'   => true,
    'selectedGroups' => array(),
);

add_action('admin_menu', 'Soli\TV\soli_tv_add_settings_page');
add_action('init', 'Soli\TV\soli_tv_register_settings', 7);

function soli_tv_add_settings_page() {
    add_submenu_page(
        'edit.php?post_type=soli_tv_message',
        __('Instellingen', 'soli-tv'),
        __('Instellingen', 'soli-tv'),
        'edit_posts',
        'soli-tv-settings',
        'Soli\TV\soli_tv_render_settings_page'
    );
}

/**
 * The option, exposed over `wp/v2/settings`.
 *
 * `show_in_rest` with a schema is what lets the screen read and write it
 * without an endpoint of its own. `default` has to be given here too, or a site
 * that has never saved gets `false` back rather than the shape below.
 */
function soli_tv_register_settings() {
    register_setting('soli_tv', SETTINGS_OPTION, array(
        'type'         => 'object',
        'default'      => SETTINGS_DEFAULT,
        'show_in_rest' => array(
            'name'   => SETTINGS_OPTION,
            'schema' => array(
                'type'       => 'object',
                'properties' => array(
                    'delay' => array(
                        'type'    => 'integer',
                        'minimum' => 1,
                        'maximum' => 600,
                    ),
                    'onlyConcerts' => array('type' => 'boolean'),
                    'selectedGroups' => array(
                        'type'  => 'array',
                        'items' => array('type' => 'string'),
                    ),
                ),
                // Anything not described above is dropped rather than stored:
                // the migration merges whatever a block attribute happened to
                // carry, and an unknown key would then round-trip forever.
                'additionalProperties' => false,
            ),
        ),
    ));
}

function soli_tv_render_settings_page() {
    if (!current_user_can('edit_posts')) {
        wp_die(esc_html__('Je hebt geen toegang tot deze pagina.', 'soli-tv'));
    }

    echo '<div class="wrap"><div id="soli-tv-settings-root"></div></div>';
}

add_action('admin_enqueue_scripts', 'Soli\TV\soli_tv_enqueue_settings_page');

function soli_tv_enqueue_settings_page($hook_suffix) {
    // The hook for a submenu of a post type's own menu, not 'settings_page_*'.
    if ($hook_suffix !== 'soli_tv_message_page_soli-tv-settings') {
        return;
    }

    $dir = SOLI_TV__PLUGIN_DIR_PATH . 'blocks/tv-settings/build/';
    $url = SOLI_TV__PLUGIN_DIR_URL . 'blocks/tv-settings/build/';

    if (!file_exists($dir . 'settings-page.js')) {
        echo '<div class="notice notice-error"><p>'
            . esc_html__('De build ontbreekt. Voer `npm run build` uit.', 'soli-tv')
            . '</p></div>';
        return;
    }

    $asset = include $dir . 'settings-page.asset.php';

    wp_enqueue_script(
        'soli-tv-settings-page',
        $url . 'settings-page.js',
        isset($asset['dependencies']) ? $asset['dependencies'] : array(),
        isset($asset['version']) ? $asset['version'] : SOLI_TV__PLUGIN_VERSION,
        true
    );

    wp_set_script_translations(
        'soli-tv-settings-page',
        'soli-tv',
        SOLI_TV__PLUGIN_DIR_PATH . 'languages'
    );

    if (file_exists($dir . 'settings-page.css')) {
        wp_enqueue_style(
            'soli-tv-settings-page',
            $url . 'settings-page.css',
            array('wp-components'),
            isset($asset['version']) ? $asset['version'] : SOLI_TV__PLUGIN_VERSION
        );
    } else {
        wp_enqueue_style('wp-components');
    }

    wp_localize_script('soli-tv-settings-page', 'SoliTVSettingsPage', array(
        'eventsPluginActive' => is_plugin_active('wp-soli-event-plugin/soli-event-plugin.php'),
        'newMessageUrl'      => admin_url('post-new.php?post_type=soli_tv_message'),
        // Both horizons come from PHP so the screen and this list cannot drift
        // apart: one of them is what /tv/ actually queries.
        'eventHorizon'       => SETTINGS_EVENT_HORIZON,
        'kioskEventLimit'    => KIOSK_EVENT_LIMIT,
    ));
}
