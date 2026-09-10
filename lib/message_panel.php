<?php

namespace Soli\TV;

if (!defined('ABSPATH')) exit;

/**
 * Loads the sidebar panel for editing a soli_tv_message.
 *
 * Step 4 of PLAN-cpt-and-kiosk-route.md. The bundle is enqueued only on this
 * post type's editor screen: `enqueue_block_editor_assets` fires for every
 * editor, including posts and pages, so without the screen check the panel's
 * JavaScript would load everywhere.
 *
 * The panel also bails in JS on any other post type, because that check is the
 * one that still holds when something else enqueues the handle.
 */

add_action('enqueue_block_editor_assets', 'Soli\TV\soli_tv_enqueue_message_panel');

function soli_tv_enqueue_message_panel() {
    if (!function_exists('get_current_screen')) {
        return;
    }

    $screen = get_current_screen();

    if (!$screen || $screen->post_type !== 'soli_tv_message') {
        return;
    }

    $dir = SOLI_TV__PLUGIN_DIR_PATH . 'blocks/tv-settings/build/';
    $url = SOLI_TV__PLUGIN_DIR_URL . 'blocks/tv-settings/build/';

    if (!file_exists($dir . 'message-panel.js')) {
        // The bundle is gitignored build output. Saying so beats a silently
        // missing panel that looks like a registration bug.
        if (defined('WP_DEBUG') && WP_DEBUG) {
            \_doing_it_wrong(
                __FUNCTION__,
                'blocks/tv-settings/build/message-panel.js is missing. Run `npm run build`.',
                '0.1.0'
            );
        }
        return;
    }

    // Dependencies come from the file webpack writes, never a hand-kept list:
    // this panel's imports have already changed once and a stale array fails
    // as an undefined global at runtime rather than as a build error.
    $asset = include $dir . 'message-panel.asset.php';

    wp_enqueue_script(
        'soli-tv-message-panel',
        $url . 'message-panel.js',
        isset($asset['dependencies']) ? $asset['dependencies'] : array(),
        isset($asset['version']) ? $asset['version'] : SOLI_TV__PLUGIN_VERSION,
        true
    );

    wp_set_script_translations(
        'soli-tv-message-panel',
        'soli-tv',
        SOLI_TV__PLUGIN_DIR_PATH . 'languages'
    );
}
