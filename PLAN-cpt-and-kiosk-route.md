# Plan: move TV messages to a CPT, render the screen off-page

Status: proposal, not started. Written 2026-09-09 against `soli-tv-plugin` 0.1.0.

Three changes, in this order:

1. Replace the `{prefix}tv_message` table with a `soli_tv_message` custom post type.
2. Move the overview UI to an admin page under that CPT, and retire the block.
3. Serve the screen from a plugin-owned route instead of a WordPress page carrying the block.

The first changes what the data looks like, the second changes who edits it and where the
settings live, the third changes how it reaches the TV.

The block currently does three unrelated jobs: it is the admin UI, the store for settings and
toggles, and the front-end renderer. Each one moves somewhere that fits it better, and the block
itself goes away.

## Why

Six defects were fixed on the write path on 2026-09-08 (see `git log`, "Fix the TV message save
path"). Five of them existed only because the data does not live in `wp_posts`:

| Defect | What a CPT provides instead |
|--------|------------------------------|
| `status` enum validated by hand; `PLANNED` rejected by the API that stored it | `post_status` |
| Dates sent as ISO-8601 into a `DATETIME` column, which MySQL rejects | `post_date`, a `DATETIME` handled in both directions |
| `img` bound as `%s`, so "no image" stored `0` instead of `NULL` | featured image, a real attachment relation |
| `WP_REST_Server::INVALID_ARGUMENT` did not exist, so the 400 branch raised a fatal | `register_post_meta()` with a schema: `type`, `enum`, `format` checked before the handler runs |
| `getSingleTVMessage()` dropped its `return`, so every existing id answered 204 | `wp/v2/soli_tv_message/{id}` |

The plugin also has no migration runner, which `CLAUDE.md` already records as a gap: schema
changes reach fresh activations and nothing else. Meta has no schema to migrate.

Legacy content is another argument. Production messages today live in the `tv` CPT in
`wp-theme-soli` with a `tv_post_type` meta. Into a CPT that is a `post_type` rewrite plus a
meta-key map. Into the custom table it is a bespoke import written to reach a worse model.

The custom table would earn its place at volume, or for rows that do not fit the post shape.
Soli runs a handful of slides.

### The on/off buttons do not reach the TV

`theHTML()` (`blocks/tv-settings/index.php:75`) passes only `selectedGroups` to the front end.
`frontend.js:13` renders `<SlidesProvider>` with no `disabledSlides` prop, so
`addEnabledProperty()` reads `undefined`, `!disabledSlides` evaluates true, and every slide
renders. Turning a slide off works in the editor preview and does nothing on the screen.

Storing the flag in a block attribute causes this. The attribute is serialised into the post
content of whichever page holds the block, which also means the toggle needs a page edit and
publish, two pages carrying the block diverge silently, and event ids end up inside page HTML.
The legacy theme put `invisible_on_tv` on the item itself. Do that.

The attribute declarations are also split across two files that disagree. `index.php:52`
registers `selectedGroups` and nothing else. `index.js:20` declares `settings`, `disabledSlides`
and `lock`, none of them valid: the outer objects carry no `type`, and `lock` is a block-level
setting rather than an attribute. Neither side declares the full set.

## Part 1: the `soli_tv_message` CPT

Supports `title`, `editor`, `thumbnail`, `revisions`. `show_in_rest` on, `public` false with a
`rest_base` of `soli_tv_message`.

### Field map

| Today | Becomes |
|-------|---------|
| `title` | `post_title` |
| `content` | `post_content` |
| `img` (BIGINT) | featured image (`_thumbnail_id`) |
| `type` | `_soli_tv_layout`, enum `img_only` / `img_text` / `text_only` |
| `start_date` | `_soli_tv_start`, `format: date-time` |
| `end_date` | `_soli_tv_end`, `format: date-time` |
| `status` | `post_status`: `PLANNED`/`draft` → `draft`, `published` → `publish`, `archived` → `draft` (see below) |
| `link` | `_soli_tv_link`, `format: uri` |
| `disabledSlides` block attribute | `_soli_tv_disabled` on the item |
| (new) | `_soli_tv_fit`, `cover` / `contain` |

Every meta gets `register_post_meta()` with `single`, `type`, `show_in_rest` carrying a schema,
`sanitize_callback` and an `auth_callback` requiring `edit_posts`. The schema replaces the
hand-rolled `isset()` chain in `lib/tv_message_endpoints.php`, which is where four of the six
defects lived.

### `archived` goes away

`status` is written and validated today and never read. `loadCurrentTVMessages()` filters on the
date window alone, nothing in the editor sets a status, and no code path has ever written
`archived`: it has been a value in the validation list since `abd665f` and nothing else. An
expired window already says a message is done.

`draft` against `publish` survives the cut, because it answers a different question than the
window does. Three axes, none of them restating another:

| | Answers | Set by |
|---|---|---|
| `post_status` | Is this message finished? | the editor, free with the CPT |
| `_soli_tv_start` / `_soli_tv_end` | When should it show? | the date picker |
| `_soli_tv_disabled` | Off right now, whatever the window says | the overview toggles |

An old message worth keeping is a `draft` with an expired window, or trash. Neither needs a
registered status, so migrate `archived` to `draft` and register nothing.

Keep the window in meta rather than reusing `post_date`. `post_date` drives publication and the
editor's own scheduling UI; overloading it as "visible on the TV from" ties two unrelated
decisions together.

`_soli_tv_disabled` uses the same key on a `soli_tv_message` and on a `soli_event`
(`wp-soli-event-plugin` registers `soli_event` as a real CPT in `events/lib/post_type.php:55`),
so the overview screen writes one key whatever it is toggling.

### `_soli_tv_fit` exists to avoid losing a distinction

Legacy offers three layouts, and they are not the plugin's three. `pic_with_text` and
`pic_with_text_contain` hold the same content with a different image fit, visible in `tv.php` as
`.left.wide` against `.left.contain`. Mapping both onto `img_text` discards a choice someone made
per message. Splitting fit out of layout keeps it and drops a layout value.

### Ordering

The provider currently sorts slides by `hashCode(title + id)` (`slides-provider.js:18`), which is
arbitrary and reshuffles the running order whenever a message is renamed. A CPT brings
`menu_order`; register `page-attributes` and sort on it.

### What gets deleted

- `lib/tv_message_table.php`
- `lib/tv_message_endpoints.php` and the whole `soli_tv/v1` namespace
- the `{prefix}tv_message` table, dropped by `uninstall.php` after the migration has run
- `toMysqlDateTime()` in `tv-message-provider.js`, once dates are meta with a `date-time` schema

The providers then read `wp/v2/soli_tv_message` through `@wordpress/core-data` or `apiFetch`.

## Part 2: the admin pages

Two screens under one menu, following what the legacy theme did with
`add_submenu_page('edit.php?post_type=tv', 'Instellingen', ...)`.

### `Tv berichten`: the CPT list

Create and edit a message in the ordinary post editor. Title, content and featured image come
free. Layout, fit, window and link go in a `PluginDocumentSettingPanel` in the sidebar, reading
the registered meta.

This retires `message-editor-modal.js` and the modal it opens: the RichText title, the
`ComboboxControl` for type and the QR `TextControl` all become editor-native.

Use core's `DateTimePicker` from `@wordpress/components` for the window. Together with dropping
MUI from the event slide (Part 3) that removes `@mui/x-date-pickers` and dayjs from the repo.

### `Tv berichten` → `Instellingen`: the overview

`add_submenu_page('edit.php?post_type=soli_tv_message', __('Instellingen', 'soli-tv'), ...)`,
with the React app mounted on it. Keeps what the block's edit view already does well: every
message and upcoming event in one list, on/off per item, delay, group filter, and the preview.

The screen writes post meta, so `edit_posts` is the capability I would use rather than legacy's
`manage_options`, so committee editors can turn a slide off without full admin. Say if you want
it tighter.

### Where the settings go

| Today | Becomes |
|-------|---------|
| `settings.delay` block attribute | `soli_tv_settings` option, `register_setting()` with a schema and `show_in_rest` |
| `selectedGroups` block attribute | the same option |
| `disabledSlides` block attribute | `_soli_tv_disabled` meta per item |

With `show_in_rest`, the screen reads and writes the option through `wp/v2/settings` and needs no
endpoint of its own.

### What else gets deleted

- `register_block_type('soli/tv-settings')`, `theHTML()` and the empty `save`
- the attribute declarations in `index.php` and `index.js`
- `message-editor-modal.js`

Nothing then places a block in a page, so no page needs editing to change what the TV shows.

## Part 3: the kiosk route

### What a page costs today

Measured 2026-09-09 in wp-env on the default theme, one page holding the block. Production runs
the Soli block theme, so the mix shifts and the shape does not.

| | bytes |
|---|---|
| page HTML | 97,518 |
| inline CSS, 16 blocks (`global-styles` 18,047, `wp-block-library` 7,410, columns, paragraph, navigation) | 38,992 |
| inline JS, 19 blocks | 15,172 |
| markup, mostly theme header, nav and footer | 39,979 |
| `frontend.css` + `frontend.js` | 6,452 + 68,516 |

Around 55 KB wraps a slideshow that uses none of it. On the Pi the parse and paint of
`global-styles` plus the block library costs more than the transfer.

### Shape

- A `soli_tv` query var, handled on `template_redirect`: emit the document, `exit`. No
  `wp_head()`, no `wp_footer()`, no theme template, no admin bar, no emoji script, no oEmbed.
- The URL is `/tv/`, always, and `/tv` redirects to it. This overrides the earlier note in this
  plan that made `?soli_tv=1` canonical: the query var is only the rewrite target. `/tv/` needs
  pretty permalinks, because with the plain structure it 404s at Apache before WordPress runs —
  the same trap that made `/scanner/{slug}` fail in `wp-soli-ticket-scanner-plugin`. `.wp-env.json`
  therefore sets a permalink structure on start, so the tests exercise the real URL.
- Inline the slide payload as one `wp_json_encode()` blob instead of fetching at boot. The screen
  paints without waiting on REST, then polls for changes.
- Separate webpack entries: `admin` for the two screens, `tv` for the kiosk, so editor-only code
  cannot reach the TV.

`wp-soli-ticket-scanner-plugin` already serves a public plugin-owned route this way, and is the
reference for the permalink handling.

### Trim the kiosk bundle

`frontend.js` carries an MUI date adapter. `single-event-slide.js:5` imports `SelectedDate`, and
`selected-date.js:7-8` imports `LocalizationProvider` and `AdapterDayjs` from
`@mui/x-date-pickers`, to format one date. `Intl.DateTimeFormat` does that with no dependency.
Dropping MUI and dayjs from the event slide is worth more than anything else in this section, and
it is independent of both parts of this plan.

For comparison: `index.js` is 400,489 bytes against `frontend.js`'s 68,516, and the difference is
mostly the editor's pickers.

### Then cache it

Once the route renders a self-contained document, store it (transient or a file on disk)
invalidated on `save_post`. The screen keeps working while WordPress is slow or down, which for a
display in the building matters more than the bytes.

A plugin-owned route also detaches the TV from the theme. `wp-theme-soli` is deprecated and
`wp-soli-gutenberg-theme` is still moving; neither can break a route the plugin owns.

## Migration

One idempotent WP-CLI command, `wp soli-tv migrate`, with `--dry-run`, reading both sources:

- `{prefix}tv_message` rows, mapped per the table above.
- the legacy `tv` CPT: `post_type` rewrite, `tv_post_type` → `_soli_tv_layout` plus
  `_soli_tv_fit` (`pic_with_text` → `img_text`/`cover`, `pic_with_text_contain` →
  `img_text`/`contain`, `pic_only` → `img_only`/`cover`), `invisible_on_tv` → `_soli_tv_disabled`.
  Legacy holds no active window, so migrated messages get an open one.
- `disabledSlides` out of the block attributes on any page carrying `soli/tv-settings`, written
  onto the items; `settings.delay` and `selectedGroups` from the same attributes into the
  `soli_tv_settings` option. Report every page the command found, so someone can delete the block
  from them by hand rather than the command editing page content.

Record a completion flag so a second run does nothing, and drop the table only after a run has
been verified against production data.

Cover it with the upgrade test in `CLAUDE.md`: install the previous version, seed rows, upgrade,
assert the posts and meta that come out. Prove each assertion fails before the migration runs, the
way `e2e/message-persistence.spec.js` was proved on 2026-09-08.

## Order of work

1. Drop MUI and dayjs from `selected-date.js`. Independent, immediate, shrinks the kiosk bundle.
2. Register the CPT and the meta. Nothing reads them yet.
3. Write `wp soli-tv migrate` with `--dry-run`, and the upgrade test.
4. Add the sidebar panel for layout, fit, window and link. **Done 2026-09-10, minus the modal.**
   Retiring `message-editor-modal.js` moved to step 6: until the `Instellingen` screen exists,
   the modal is the only way to create a message from the block's edit view, and removing it
   first would leave a release where nothing can. MUI therefore also leaves in step 6, with
   `daterange-picker.js`, rather than here.
5. Add the `Instellingen` submenu, move the app onto it, move settings into the option and the
   toggles onto items. **Done 2026-09-10.** Also the fix for the toggles never reaching the screen.
   One capability lost on the way: an event's switch is post meta, so it covers every date row of
   that event, where the block could disable one date and not another.
6. Delete the block registration, `lib/tv_message_table.php`, `lib/tv_message_endpoints.php` and
   the table. **Done 2026-09-10, except the table itself.** The rows stay: stopping the reads is
   reversible and `DROP TABLE` is not, production has not cut over, and `uninstall.php` already
   drops it on delete. MUI, dayjs and the 398 KB editor bundle went with the block.

   Verified that `has_block()` and `parse_blocks()` still work on a page whose block is no longer
   registered, which is what lets the migration read old attributes off a real site after this
   lands.
7. Add the kiosk route and its own entry point. **Done 2026-09-10, before step 6.** The order is
   inverted deliberately: the route is additive, so it can land and be verified while the block
   still works. Deleting the block first would leave a release with no screen at all.
8. Cache the rendered document, invalidated on `save_post`.

Steps 1 to 6 are one release, and a major one: the block goes away and any page holding it stops
rendering. The route in step 7 changes the URL the Pi points at, so it wants its own release and
a note of the new address.

## Open questions

- Nothing outside this plugin reads `{prefix}tv_message`. Checked 2026-09-09 across every repo in
  `/git/soli`: the only PHP or JS naming the table lives in `wp-soli-tv-plugin`.
- The Pi's current URL, and who changes it.
