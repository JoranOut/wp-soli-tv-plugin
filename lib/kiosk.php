<?php

namespace Soli\TV;

if (!defined('ABSPATH')) exit;

/**
 * `/tv/` - the screen itself.
 *
 * Step 7 of PLAN-cpt-and-kiosk-route.md. A plugin-owned route rather than a
 * page carrying a block, because the page cost around 55 KB of theme and core
 * scaffolding the slideshow never used: measured 2026-09-09, 97,518 bytes of
 * HTML of which 38,992 was inline CSS (`global-styles` alone 18 KB) and 39,979
 * was the theme's header, nav and footer.
 *
 * The URL is always `/tv/`. That needs pretty permalinks: with the plain
 * structure the path 404s at Apache before WordPress runs, which is why
 * `.wp-env.json` sets a permalink structure on start. The `soli_tv` query var
 * exists only as what the rewrite rule maps onto - it is not a second public
 * address for the screen.
 *
 * The slides are printed into the document as one JSON payload rather than
 * fetched. The screen then paints on first load without waiting on REST, and
 * keeps showing the last render if a later poll fails.
 */

const KIOSK_QUERY_VAR = 'soli_tv';
const KIOSK_PATH = 'tv';

/** Bumped whenever the rewrite rule changes, to force one flush. */
const KIOSK_REWRITE_VERSION = '1';

/**
 * How many upcoming event dates the screen carries.
 *
 * The `Instellingen` list deliberately reaches further than this (see
 * `SETTINGS_EVENT_HORIZON`) so an event can be switched off before it ever
 * comes into view. The screen itself stays short: at 20 seconds a slide, 20
 * dates is already a seven-minute loop.
 */
const KIOSK_EVENT_LIMIT = 20;

add_action('init', 'Soli\TV\soli_tv_add_kiosk_route', 8);
add_filter('query_vars', 'Soli\TV\soli_tv_register_kiosk_query_var');
add_action('template_redirect', 'Soli\TV\soli_tv_maybe_render_kiosk');

function soli_tv_add_kiosk_route() {
    add_rewrite_rule('^' . KIOSK_PATH . '/?$', 'index.php?' . KIOSK_QUERY_VAR . '=1', 'top');

    // A rule added on init does nothing until the rules are rebuilt, and an
    // activation hook only fires on activation - not on a plugin update. So the
    // version is stored and one flush happens when it changes.
    if (get_option('soli_tv_rewrite_version') !== KIOSK_REWRITE_VERSION) {
        flush_rewrite_rules(false);
        update_option('soli_tv_rewrite_version', KIOSK_REWRITE_VERSION);
    }
}

function soli_tv_register_kiosk_query_var($vars) {
    $vars[] = KIOSK_QUERY_VAR;

    return $vars;
}

function soli_tv_maybe_render_kiosk() {
    if (!get_query_var(KIOSK_QUERY_VAR)) {
        return;
    }

    // Nothing below calls wp_head() or a theme template on purpose. The
    // document is the whole point of the route.
    status_header(200);
    nocache_headers();
    header('Content-Type: text/html; charset=' . get_bloginfo('charset'));

    echo soli_tv_kiosk_document();
    exit;
}

/** The complete document for the screen. */
function soli_tv_kiosk_document() {
    $dir = SOLI_TV__PLUGIN_DIR_PATH . 'blocks/tv-settings/build/';
    $url = SOLI_TV__PLUGIN_DIR_URL . 'blocks/tv-settings/build/';

    $payload = soli_tv_kiosk_payload();

    $asset = file_exists($dir . 'kiosk.asset.php')
        ? include $dir . 'kiosk.asset.php'
        : array('dependencies' => array(), 'version' => SOLI_TV__PLUGIN_VERSION);

    $version = isset($asset['version']) ? $asset['version'] : SOLI_TV__PLUGIN_VERSION;

    // Registered rather than written as a bare <script src>. The bundle keeps
    // wp-element and wp-i18n as externals - it expects `wp.element` to exist -
    // so a hand-written tag loaded the app with none of its dependencies and it
    // died on "Cannot read properties of undefined (reading 'element')".
    //
    // `do_items( handle )` prints exactly this handle and the chain it depends
    // on, unlike wp_print_footer_scripts(), which would also print whatever
    // every other active plugin queued for the footer of a page this document
    // is not.
    wp_register_style(
        'soli-tv-kiosk',
        $url . 'kiosk.css',
        array(),
        $version
    );

    wp_register_script(
        'soli-tv-kiosk',
        $url . 'kiosk.js',
        isset($asset['dependencies']) ? $asset['dependencies'] : array(),
        $version,
        true
    );

    wp_set_script_translations(
        'soli-tv-kiosk',
        'soli-tv',
        SOLI_TV__PLUGIN_DIR_PATH . 'languages'
    );

    wp_enqueue_style('soli-tv-kiosk');
    wp_enqueue_script('soli-tv-kiosk');

    ob_start();
    ?><!DOCTYPE html>
<html <?php language_attributes(); ?>>
<head>
<meta charset="<?php bloginfo('charset'); ?>">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?php echo esc_html(sprintf(
    /* translators: %s: site name. */
    __('%s op het scherm', 'soli-tv'),
    get_bloginfo('name')
)); ?></title>
<?php wp_styles()->do_items('soli-tv-kiosk'); ?>
<style>
html, body { margin: 0; padding: 0; overflow: hidden; background: #fff; cursor: none; }
</style>
</head>
<body class="soli-tv-kiosk">
<div id="soli-tv-kiosk"></div>
<script id="soli-tv-payload" type="application/json"><?php
    // wp_json_encode with the tag-unescaping flags off: this sits inside a
    // JSON script block, so a "</script>" in a message body must not be able
    // to close it.
    echo wp_json_encode($payload, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE);
?></script>
<?php wp_scripts()->do_items('soli-tv-kiosk'); ?>
</body>
</html>
<?php
    return ob_get_clean();
}

/**
 * Everything the screen needs, in the shape the slide components already read.
 *
 * Deliberately the same field names `slides-provider.js` produced, so the
 * slideshow components did not have to change when the data stopped coming
 * from `soli_tv/v1` and block attributes.
 */
function soli_tv_kiosk_payload() {
    $settings = wp_parse_args(
        (array) get_option(SETTINGS_OPTION, array()),
        SETTINGS_DEFAULT
    );

    return array(
        'delayMs' => max(5, (int) $settings['delay']) * 1000,
        'slides'  => array_merge(soli_tv_kiosk_messages(), soli_tv_kiosk_events($settings)),
    );
}

/** Published messages whose window covers now and which are not switched off. */
function soli_tv_kiosk_messages() {
    $now = current_time('mysql');

    $posts = get_posts(array(
        'post_type'      => 'soli_tv_message',
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'orderby'        => array('menu_order' => 'ASC', 'title' => 'ASC'),
        // A message with no window is always on, so the comparison cannot be a
        // plain meta_query on the bound alone: an absent key has to pass too.
        'meta_query'     => array(
            'relation' => 'AND',
            array(
                'relation' => 'OR',
                array('key' => '_soli_tv_start', 'compare' => 'NOT EXISTS'),
                array('key' => '_soli_tv_start', 'value' => '', 'compare' => '='),
                array('key' => '_soli_tv_start', 'value' => soli_tv_to_meta_datetime($now), 'compare' => '<='),
            ),
            array(
                'relation' => 'OR',
                array('key' => '_soli_tv_end', 'compare' => 'NOT EXISTS'),
                array('key' => '_soli_tv_end', 'value' => '', 'compare' => '='),
                array('key' => '_soli_tv_end', 'value' => soli_tv_to_meta_datetime($now), 'compare' => '>='),
            ),
        ),
    ));

    $slides = array();

    foreach ($posts as $post) {
        if (get_post_meta($post->ID, '_soli_tv_disabled', true)) {
            continue;
        }

        $image_id = (int) get_post_thumbnail_id($post->ID);

        $slides[] = array(
            'id'         => $post->ID,
            'slide_type' => 'message',
            'type'       => get_post_meta($post->ID, '_soli_tv_layout', true) ?: 'img_text',
            'fit'        => get_post_meta($post->ID, '_soli_tv_fit', true) ?: 'cover',
            'title'      => $post->post_title,
            'content'    => apply_filters('the_content', $post->post_content),
            'img'        => $image_id ?: null,
            'imgUrl'     => $image_id ? wp_get_attachment_image_url($image_id, 'full') : null,
            'startDate'  => get_post_meta($post->ID, '_soli_tv_start', true),
            'endDate'    => get_post_meta($post->ID, '_soli_tv_end', true),
            'link'       => get_post_meta($post->ID, '_soli_tv_link', true),
        );
    }

    return $slides;
}

/**
 * Upcoming events, when the event plugin is here.
 *
 * The dates come from that plugin's own table, because "upcoming" is a
 * comparison on a column it owns. Its `id` is a row in `event_dates` and its
 * `post_id` is the post - the switch lives on the post, so one switched-off
 * event removes all of its dates.
 */
function soli_tv_kiosk_events($settings) {
    global $wpdb;

    $table = $wpdb->prefix . 'event_dates';

    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) !== $table) {
        return array();
    }

    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT d.id, d.post_id, d.start_date, d.end_date, d.rooms, d.is_concert
         FROM {$table} d
         INNER JOIN {$wpdb->posts} p ON p.ID = d.post_id
         WHERE p.post_status = 'publish'
           AND d.start_date >= %s
         ORDER BY d.start_date ASC
         LIMIT %d",
        current_time('mysql'),
        KIOSK_EVENT_LIMIT
    ), ARRAY_A);

    $slides = array();

    foreach ($rows as $row) {
        if (!empty($settings['onlyConcerts']) && empty($row['is_concert'])) {
            continue;
        }

        if (get_post_meta($row['post_id'], '_soli_tv_disabled', true)) {
            continue;
        }

        $post = get_post($row['post_id']);

        if (!$post) {
            continue;
        }

        $image_id = (int) get_post_thumbnail_id($post->ID);

        $slides[] = array(
            'id'         => (int) $row['id'],
            'postId'     => (int) $row['post_id'],
            'slide_type' => 'event',
            'title'      => $post->post_title,
            'excerpt'    => $post->post_excerpt,
            'img'        => $image_id ?: null,
            'imgUrl'     => $image_id ? wp_get_attachment_image_url($image_id, 'full') : null,
            'startDate'  => $row['start_date'],
            'endDate'    => $row['end_date'],
            'rooms'      => $row['rooms'] ? json_decode($row['rooms'], true) : null,
            'link'       => get_permalink($post),
        );
    }

    return $slides;
}

/**
 * `Y-m-d H:i:s` as the `T`-separated string the window meta is stored in.
 *
 * The comparison has to happen in the stored format, because it is a string
 * comparison in SQL: `2026-09-10T19:00:00` and `2026-09-10 19:00:00` sort
 * differently around the separator.
 */
function soli_tv_to_meta_datetime($mysql_datetime) {
    return str_replace(' ', 'T', $mysql_datetime);
}
