<?php

namespace Soli\TV;

if (!defined('ABSPATH')) exit;

/**
 * The `soli_tv_message` post type and its meta.
 *
 * Step 2 of PLAN-cpt-and-kiosk-route.md. Nothing reads any of this yet: the
 * slideshow still runs off `{prefix}tv_message` and the `soli_tv/v1` routes.
 * Registering first keeps the migration in step 3 from having to create the
 * type and move the data in one change.
 *
 * Every field is registered meta with a REST schema rather than a column
 * validated by hand. Four of the six defects fixed on 2026-09-08 were
 * hand-rolled validation in `lib/tv_message_endpoints.php`; `enum`, `type` and
 * `format` here are checked by WordPress before a handler runs.
 */

/** Layout values a message may take. */
const LAYOUTS = array('img_only', 'img_text', 'text_only');

/** How the image fills its half of the slide. */
const FITS = array('cover', 'contain');

add_action('init', 'Soli\TV\soli_tv_register_post_type', 5);
add_action('init', 'Soli\TV\soli_tv_register_meta', 6);

function soli_tv_register_post_type() {
    $labels = array(
        'name'               => __('Tv berichten', 'soli-tv'),
        'singular_name'      => __('Tv bericht', 'soli-tv'),
        'add_new'            => __('Nieuw bericht', 'soli-tv'),
        'add_new_item'       => __('Nieuw tv bericht', 'soli-tv'),
        'edit_item'          => __('Tv bericht bewerken', 'soli-tv'),
        'new_item'           => __('Nieuw tv bericht', 'soli-tv'),
        'view_item'          => __('Tv bericht bekijken', 'soli-tv'),
        'view_items'         => __('Tv berichten bekijken', 'soli-tv'),
        'search_items'       => __('Tv berichten zoeken', 'soli-tv'),
        'not_found'          => __('Geen tv berichten gevonden', 'soli-tv'),
        'not_found_in_trash' => __('Geen tv berichten in de prullenbak', 'soli-tv'),
        'all_items'          => __('Alle tv berichten', 'soli-tv'),
        'menu_name'          => __('Tv berichten', 'soli-tv'),
    );

    register_post_type('soli_tv_message', array(
        'labels'       => $labels,
        'description'  => __('Berichten voor het tv-scherm in het muziekcentrum', 'soli-tv'),
        // Not public: a message is a slide on one screen, not a URL. No
        // archive, no single template, nothing for a search engine to find.
        'public'       => false,
        'show_ui'      => true,
        'show_in_menu' => true,
        'menu_icon'    => 'dashicons-desktop',
        'menu_position' => 4,
        'has_archive'  => false,
        'rewrite'      => false,
        'hierarchical' => false,
        // page-attributes is what carries menu_order, which replaces sorting
        // slides by hashCode(title + id) - a hash that reshuffles the running
        // order whenever someone renames a message.
        //
        // custom-fields is not optional here despite nothing using the custom
        // fields UI: WP_REST_Posts_Controller only adds the `meta` field to a
        // post type that declares it. Without it every registered meta below
        // is invisible over REST - the response simply has no `meta` key, no
        // error - and the editor cannot read or write any of it either.
        'supports'     => array(
            'title',
            'editor',
            'thumbnail',
            'revisions',
            'page-attributes',
            'custom-fields',
        ),
        'show_in_rest' => true,
        'rest_base'    => 'soli_tv_message',
        'capability_type' => 'post',
        'map_meta_cap' => true,
    ));
}

function soli_tv_register_meta() {
    $fields = array(
        '_soli_tv_layout' => array(
            'type'    => 'string',
            'default' => 'img_text',
            'enum'    => LAYOUTS,
            'description' => __('Which layout the slide uses', 'soli-tv'),
        ),
        '_soli_tv_fit' => array(
            'type'    => 'string',
            'default' => 'cover',
            'enum'    => FITS,
            // The legacy theme had pic_with_text and pic_with_text_contain as
            // separate layouts (tv.php's .left.wide against .left.contain).
            // Keeping fit separate preserves that choice per message instead of
            // collapsing both onto one layout.
            'description' => __('Whether the image covers or fits inside its area', 'soli-tv'),
        ),
        '_soli_tv_start' => array(
            'type'   => 'string',
            'format' => 'date-time',
            'description' => __('Start of the window in which the slide shows', 'soli-tv'),
        ),
        '_soli_tv_end' => array(
            'type'   => 'string',
            'format' => 'date-time',
            'description' => __('End of the window in which the slide shows', 'soli-tv'),
        ),
        '_soli_tv_link' => array(
            'type'   => 'string',
            'format' => 'uri',
            'description' => __('URL encoded into the slide QR code', 'soli-tv'),
        ),
    );

    foreach ($fields as $key => $field) {
        $schema = array('type' => $field['type']);

        if (isset($field['enum'])) {
            $schema['enum'] = $field['enum'];
        }

        if (isset($field['format'])) {
            $schema['format'] = $field['format'];
        }

        $args = array(
            'single'            => true,
            'type'              => $field['type'],
            'description'       => $field['description'],
            'sanitize_callback' => 'sanitize_text_field',
            'auth_callback'     => 'Soli\TV\soli_tv_can_edit_meta',
            'show_in_rest'      => array('schema' => $schema),
        );

        // Only the enum fields carry a default. WordPress validates a default
        // against the whole schema, `format` included, so declaring `''` for a
        // `date-time` or `uri` field raises "the data must match the type
        // provided" - and that notice prints before headers, which blocks the
        // login cookie and locks you out of wp-admin entirely. Absent meta
        // already reads back as '' for single string meta, so there is nothing
        // to gain from a default here.
        if (isset($field['default'])) {
            $args['default'] = $field['default'];
        }

        register_post_meta('soli_tv_message', $key, $args);
    }

    // The kill switch, registered on messages and on events alike so the
    // overview screen writes one key whatever it is toggling. Registering it
    // for soli_event costs nothing when the event plugin is inactive.
    foreach (array('soli_tv_message', 'soli_event') as $post_type) {
        register_post_meta($post_type, '_soli_tv_disabled', array(
            'single'            => true,
            'type'              => 'boolean',
            'default'           => false,
            'description'       => __('Keep this slide off the screen regardless of its window', 'soli-tv'),
            'sanitize_callback' => 'rest_sanitize_boolean',
            'auth_callback'     => 'Soli\TV\soli_tv_can_edit_meta',
            'show_in_rest'      => array('schema' => array('type' => 'boolean')),
        ));
    }
}

/**
 * Who may read and write this plugin's meta over REST.
 *
 * Every key is `_`-prefixed and therefore protected, so WordPress refuses the
 * write without an explicit callback: measured 2026-09-09, returning false here
 * blocks even an administrator.
 *
 * It cannot be stricter than the post's own capability in any observable way.
 * `edit_post_meta` maps through `edit_post` first, so a subscriber is already
 * refused before this runs. `edit_posts` rather than `manage_options` states the
 * intent behind the overview screen: committee editors turn a slide off without
 * being administrators.
 */
function soli_tv_can_edit_meta() {
    return current_user_can('edit_posts');
}
