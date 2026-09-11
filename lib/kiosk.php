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
 * This is the whole of the screen's agenda: these dates get a slide each *and*
 * they are the list on the panel beside every event slide. One number, so the
 * rotation can never run past what the panel says is coming.
 *
 * Eight is what fits that panel on a 1080-high screen. Raising it lengthens the
 * loop and clips the panel, so raise the row budget with it.
 *
 * The `Instellingen` list reaches much further (see `SETTINGS_EVENT_HORIZON`),
 * because an event has to be switchable off before it ever comes into view.
 * That list is not what the screen shows.
 */
const KIOSK_EVENT_LIMIT = 8;

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

/** Published messages whose window covers today and which are not switched off. */
function soli_tv_kiosk_messages() {
    $today = substr(current_time('mysql'), 0, 10);

    $posts = get_posts(array(
        'post_type'      => 'soli_tv_message',
        'post_status'    => 'publish',
        'posts_per_page' => -1,
        'orderby'        => array('menu_order' => 'ASC', 'title' => 'ASC'),
    ));

    $slides = array();

    foreach ($posts as $post) {
        if (get_post_meta($post->ID, '_soli_tv_disabled', true)) {
            continue;
        }

        if (!soli_tv_window_covers_day(
            get_post_meta($post->ID, '_soli_tv_start', true),
            get_post_meta($post->ID, '_soli_tv_end', true),
            $today
        )) {
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
 * Whether a window covers `$day`, both bounds inclusive and whole days.
 *
 * The time part of a bound is deliberately ignored. "tot 11 september" means
 * the whole of the 11th, and the editor's `datetime-local` inputs always emit
 * some time - so a bound picked as a date came through as midnight and dropped
 * the message for that entire day, which is how a window ending today looked
 * exclusive.
 *
 * An empty or absent bound is open in that direction, so a message with no
 * window at all is always on. This is a PHP filter rather than a meta_query:
 * an absent bound has no meta row, so each side needed an OR of NOT EXISTS,
 * empty and the comparison - and the comparison itself was a string compare in
 * SQL, which cannot express "same day" without slicing the value first.
 */
function soli_tv_window_covers_day($start, $end, $day) {
    $from = substr((string) $start, 0, 10);
    $to   = substr((string) $end, 0, 10);

    if ($from !== '' && $from > $day) {
        return false;
    }

    if ($to !== '' && $to < $day) {
        return false;
    }

    return true;
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

    // The location name is a second table of the event plugin's, and a site can
    // have event_dates without it. Joining a missing table fails the whole
    // query, so the join is only added once it is known to be there.
    $locations = $wpdb->prefix . 'event_location';
    $has_locations = $wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $locations)) === $locations;

    $location_select = $has_locations
        ? ', l.name AS location_name, l.address AS location_address'
        : '';
    $location_join = $has_locations
        ? "LEFT JOIN {$locations} l ON l.id = d.location"
        : '';

    // The screen hangs in a public hall, so it shows PUBLIC dates and nothing
    // else - an option, a date awaiting approval or a private booking is not
    // for that audience. This is the same rule the event plugin applies to its
    // own iCal feed, and stricter than its REST endpoint, which widens what an
    // editor sees.
    //
    // The column is checked rather than assumed: an unknown column fails the
    // whole query, which would empty the agenda instead of narrowing it.
    $has_status = (bool) $wpdb->get_var($wpdb->prepare(
        "SHOW COLUMNS FROM {$table} LIKE %s",
        'status'
    ));

    $status_where = $has_status ? "AND d.status = 'PUBLIC'" : '';

    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT d.id, d.post_id, d.start_date, d.end_date, d.rooms, d.is_concert{$location_select}
         FROM {$table} d
         INNER JOIN {$wpdb->posts} p ON p.ID = d.post_id
         {$location_join}
         WHERE p.post_status = 'publish'
           {$status_where}
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
            'location'        => isset($row['location_name']) ? $row['location_name'] : '',
            'locationAddress' => isset($row['location_address']) ? $row['location_address'] : '',
            'link'       => get_permalink($post),
        );
    }

    return $slides;
}
