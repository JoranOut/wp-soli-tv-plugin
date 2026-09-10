<?php

namespace Soli\TV;

if (!defined('ABSPATH')) exit;

/**
 * `wp soli-tv migrate` - moves TV messages onto the soli_tv_message post type.
 *
 * Step 3 of PLAN-cpt-and-kiosk-route.md. Three sources, each idempotent, none
 * of them touched unless `--dry-run` is absent:
 *
 * 1. `{prefix}tv_message` rows become posts. The row id is recorded on the post
 *    as `_soli_tv_migrated_from`, so a second run skips what it already moved.
 * 2. Legacy `tv` posts from `wp-theme-soli` are converted in place: the
 *    post_type is rewritten and `tv_post_type` is mapped onto layout and fit.
 *    Converting rather than copying keeps ids, revisions and featured images.
 *    Nothing of type `tv` remains afterwards, which is what makes it idempotent.
 * 3. `soli/tv-settings` block attributes are read off any page carrying the
 *    block: `disabledSlides` onto the items, `settings` into the option.
 *    The page content itself is left alone and reported, so a person decides
 *    when the block comes out.
 *
 * Registered only under WP-CLI. Nothing runs this on a page load: a data
 * migration on `admin_init` would fire mid-request with no way to preview it.
 */

if (!defined('WP_CLI') || !WP_CLI) {
    return;
}

/** Legacy `tv_post_type` meta mapped onto layout plus fit. */
const LEGACY_LAYOUTS = array(
    'pic_with_text'         => array('img_text', 'cover'),
    'pic_with_text_contain' => array('img_text', 'contain'),
    'pic_only'              => array('img_only', 'cover'),
);

/** Table `status` mapped onto post_status. `archived` folds into draft. */
const STATUS_MAP = array(
    'PLANNED'   => 'draft',
    'draft'     => 'draft',
    'published' => 'publish',
    'archived'  => 'draft',
);

\WP_CLI::add_command('soli-tv migrate', 'Soli\TV\soli_tv_migrate_command');

/**
 * ## OPTIONS
 *
 * [--dry-run]
 * : Report what would change and write nothing.
 *
 * ## EXAMPLES
 *
 *     wp soli-tv migrate --dry-run
 *     wp soli-tv migrate
 */
function soli_tv_migrate_command($args, $assoc_args) {
    $dry_run = isset($assoc_args['dry-run']);

    if ($dry_run) {
        \WP_CLI::log('Dry run: nothing will be written.');
    }

    $moved   = soli_tv_migrate_table_rows($dry_run);
    $legacy  = soli_tv_migrate_legacy_posts($dry_run);
    $blocks  = soli_tv_migrate_block_attributes($dry_run, $moved['map']);

    \WP_CLI::log('');
    \WP_CLI::log(sprintf('Table rows:      %d moved, %d already migrated', $moved['moved'], $moved['skipped']));
    \WP_CLI::log(sprintf('Legacy tv posts: %d converted', $legacy['converted']));
    \WP_CLI::log(sprintf('Block toggles:   %d messages off, %d events off', $blocks['messages'], $blocks['events']));

    if ($blocks['carrying']) {
        \WP_CLI::log('');
        \WP_CLI::log(sprintf(
            '%d page(s) carry the soli/tv-settings block. Remove it by hand once the route is live.',
            $blocks['carrying']
        ));

        foreach ($blocks['pages'] as $page) {
            \WP_CLI::log(sprintf('  - %d: %s (carried data)', $page['id'], $page['title']));
        }
    }

    if ($dry_run) {
        \WP_CLI::success('Dry run complete. Re-run without --dry-run to apply.');
        return;
    }

    \WP_CLI::success('Migration complete.');
}

/** `{prefix}tv_message` rows to posts. */
function soli_tv_migrate_table_rows($dry_run) {
    global $wpdb;

    $table = $wpdb->prefix . 'tv_message';

    // The table is gone once step 6 lands; a run after that has nothing to do.
    if ($wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $table)) !== $table) {
        \WP_CLI::log('No tv_message table; skipping row migration.');
        return array('moved' => 0, 'skipped' => 0, 'map' => array());
    }

    $rows = $wpdb->get_results("SELECT * FROM {$table} ORDER BY id ASC", ARRAY_A);
    $moved = 0;
    $skipped = 0;

    // row id => post id, so the block phase can resolve a disabled message id
    // to the post it became. In a dry run the post does not exist yet, so the
    // row is mapped to -1: "would exist", which is enough to keep the phase
    // from reporting a resolution failure that only a dry run would see.
    $map = array();

    foreach ($rows as $row) {
        $existing = soli_tv_find_migrated_post($row['id']);
        if ($existing) {
            $map[(int) $row['id']] = $existing;
            $skipped++;
            continue;
        }

        $status = isset(STATUS_MAP[$row['status']]) ? STATUS_MAP[$row['status']] : 'draft';

        \WP_CLI::log(sprintf(
            'row %d "%s" -> post (%s, layout %s, %s .. %s)',
            $row['id'],
            $row['title'],
            $status,
            $row['type'] ?: 'img_text',
            $row['start_date'],
            $row['end_date']
        ));

        if ($dry_run) {
            $map[(int) $row['id']] = -1;
            $moved++;
            continue;
        }

        $post_id = wp_insert_post(array(
            'post_type'    => 'soli_tv_message',
            'post_status'  => $status,
            'post_title'   => $row['title'],
            'post_content' => $row['content'],
        ), true);

        if (is_wp_error($post_id)) {
            \WP_CLI::warning(sprintf('row %d could not be inserted: %s', $row['id'], $post_id->get_error_message()));
            continue;
        }

        update_post_meta($post_id, '_soli_tv_layout', $row['type'] ?: 'img_text');
        update_post_meta($post_id, '_soli_tv_fit', 'cover');
        update_post_meta($post_id, '_soli_tv_migrated_from', (int) $row['id']);

        foreach (array('_soli_tv_start' => 'start_date', '_soli_tv_end' => 'end_date') as $meta_key => $column) {
            $value = soli_tv_to_iso8601($row[$column]);
            if ($value) {
                update_post_meta($post_id, $meta_key, $value);
            }
        }

        if (!empty($row['link'])) {
            update_post_meta($post_id, '_soli_tv_link', $row['link']);
        }

        if (!empty($row['img'])) {
            set_post_thumbnail($post_id, (int) $row['img']);
        }

        $map[(int) $row['id']] = $post_id;
        $moved++;
    }

    return array('moved' => $moved, 'skipped' => $skipped, 'map' => $map);
}

/** Legacy `tv` posts converted in place. */
function soli_tv_migrate_legacy_posts($dry_run) {
    // post_type is queried directly rather than through WP_Query, because `tv`
    // is only a registered type while wp-theme-soli is active and WP_Query
    // filters unregistered types out.
    global $wpdb;

    $ids = $wpdb->get_col($wpdb->prepare(
        "SELECT ID FROM {$wpdb->posts} WHERE post_type = %s ORDER BY ID ASC",
        'tv'
    ));

    $converted = 0;

    foreach ($ids as $id) {
        $legacy_layout = get_post_meta($id, 'tv_post_type', true);
        // Legacy pre-selected the first radio button, so an empty meta means
        // pic_with_text rather than "no layout".
        $mapped = isset(LEGACY_LAYOUTS[$legacy_layout])
            ? LEGACY_LAYOUTS[$legacy_layout]
            : LEGACY_LAYOUTS['pic_with_text'];

        $disabled = (bool) get_post_meta($id, 'invisible_on_tv', true);

        \WP_CLI::log(sprintf(
            'tv post %d "%s" -> soli_tv_message (layout %s, fit %s%s)',
            $id,
            get_the_title($id),
            $mapped[0],
            $mapped[1],
            $disabled ? ', off' : ''
        ));

        if ($dry_run) {
            $converted++;
            continue;
        }

        set_post_type($id, 'soli_tv_message');
        update_post_meta($id, '_soli_tv_layout', $mapped[0]);
        update_post_meta($id, '_soli_tv_fit', $mapped[1]);

        if ($disabled) {
            update_post_meta($id, '_soli_tv_disabled', true);
        }

        // Legacy carried no active window, so a converted message is open.
        delete_post_meta($id, 'tv_post_type');
        delete_post_meta($id, 'invisible_on_tv');

        $converted++;
    }

    return array('converted' => $converted);
}

/** `soli/tv-settings` attributes onto items and into the option. */
function soli_tv_migrate_block_attributes($dry_run, $row_to_post = array()) {
    $result = array('messages' => 0, 'events' => 0, 'pages' => array(), 'settings_from' => 0, 'carrying' => 0);

    $pages = get_posts(array(
        'post_type'      => 'any',
        'post_status'    => 'any',
        'posts_per_page' => -1,
        's'              => 'soli/tv-settings',
    ));

    foreach ($pages as $page) {
        if (!has_block('soli/tv-settings', $page)) {
            continue;
        }

        $result['carrying']++;


        foreach (parse_blocks($page->post_content) as $block) {
            if (empty($block['blockName']) || $block['blockName'] !== 'soli/tv-settings') {
                continue;
            }

            $attributes = isset($block['attrs']) ? $block['attrs'] : array();

            $disabled = isset($attributes['disabledSlides']) ? $attributes['disabledSlides'] : array();
            $disabled_seen = false;

            foreach (array('messages' => 'messages', 'events' => 'events') as $key => $counter) {
                if (empty($disabled[$key]) || !is_array($disabled[$key])) {
                    continue;
                }

                foreach ($disabled[$key] as $id) {
                    // A message id here is a tv_message row id, so it has to be
                    // resolved to the post the row became.
                    if ($key === 'messages') {
                        $target = isset($row_to_post[(int) $id])
                            ? $row_to_post[(int) $id]
                            : soli_tv_find_migrated_post((int) $id);
                    } else {
                        $target = (int) $id;
                    }

                    if (!$target) {
                        \WP_CLI::warning(sprintf(
                            'page %d turns %s %d off, but no migrated post was found for it',
                            $page->ID,
                            $key,
                            $id
                        ));
                        continue;
                    }

                    // -1 is the dry-run placeholder for a post the row phase
                    // would have created. Anything else has to exist: an id
                    // from a block attribute may name an event that has since
                    // been deleted, and writing meta against a missing post
                    // creates an orphan row nothing will ever read.
                    if ($target !== -1 && !get_post($target)) {
                        \WP_CLI::warning(sprintf(
                            'page %d turns %s %d off, but post %d no longer exists',
                            $page->ID,
                            $key,
                            $id,
                            $target
                        ));
                        continue;
                    }

                    \WP_CLI::log(sprintf(
                        'page %d: %s %d stays off -> post %s',
                        $page->ID,
                        $key,
                        $id,
                        $target === -1 ? '(to be created)' : $target
                    ));

                    if (!$dry_run) {
                        update_post_meta($target, '_soli_tv_disabled', true);
                    }

                    $result[$counter]++;
                    $disabled_seen = true;
                }
            }

            $settings = array();

            if (isset($attributes['settings']) && is_array($attributes['settings'])) {
                $settings = $attributes['settings'];
            }

            if (isset($attributes['selectedGroups'])) {
                $settings['selectedGroups'] = $attributes['selectedGroups'];
            }

            $contributed = false;

            if ($settings) {
                // Only the first page to carry settings is worth reporting: the
                // option is merged, so later pages change nothing, and a site
                // with a hundred stale fixture pages would otherwise print a
                // hundred identical lines.
                if (empty($result['settings_from'])) {
                    $result['settings_from'] = $page->ID;
                    \WP_CLI::log(sprintf('page %d: settings -> soli_tv_settings option', $page->ID));
                    $contributed = true;
                }

                if (!$dry_run) {
                    // Merged, not replaced: several pages may carry the block,
                    // and losing one page's delay to another's is worse than
                    // keeping the first value that was found.
                    $existing = get_option('soli_tv_settings', array());
                    update_option('soli_tv_settings', array_merge($settings, is_array($existing) ? $existing : array()));
                }
            }

            if ($disabled_seen) {
                $contributed = true;
            }

            if ($contributed) {
                $result['pages'][] = array('id' => $page->ID, 'title' => $page->post_title);
            }
        }
    }

    return $result;
}

/** The post a given tv_message row became, or 0. */
function soli_tv_find_migrated_post($row_id) {
    $found = get_posts(array(
        'post_type'      => 'soli_tv_message',
        'post_status'    => 'any',
        'posts_per_page' => 1,
        'fields'         => 'ids',
        'meta_key'       => '_soli_tv_migrated_from',
        'meta_value'     => (int) $row_id,
    ));

    return $found ? (int) $found[0] : 0;
}

/**
 * `Y-m-d H:i:s` to the RFC3339-ish local string the meta schema accepts.
 *
 * No timezone suffix: WordPress stores post dates in site-local time and the
 * `_soli_tv_start`/`_soli_tv_end` schema is `format: date-time`, which accepts
 * a local date-time. Appending `Z` would silently shift every window.
 */
function soli_tv_to_iso8601($value) {
    if (empty($value) || $value === '0000-00-00 00:00:00') {
        return '';
    }

    // A straight substitution, deliberately: the stored value is already the
    // wall-clock time the window means. Running it through strtotime()/gmdate()
    // would reinterpret it in PHP's timezone (UTC inside WordPress) and shift
    // every window by the site's offset.
    $value = str_replace(' ', 'T', trim($value));

    return preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/', $value) ? $value : '';
}
