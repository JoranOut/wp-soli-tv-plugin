# wp-soli-tv-plugin

WordPress plugin driving the automated TV display for Muziekvereniging Soli — the screen in the
Soli muziekcentrum that cycles through announcements and upcoming events.

## Purpose

The plugin owns two things:

1. **TV messages** — a custom table of scheduled announcements (title, content, image, QR link,
   active date range, status) managed from the block editor.
2. **The slideshow** — a block that renders those messages, interleaved with events from the
   event plugin, as a looping full-screen slideshow.

## Architecture

```
soli-tv-plugin.php          Bootstrap: constants, activation, textdomain, GitHub updater
├── lib/
│   ├── post_type.php              soli_tv_message CPT + registered meta (nothing reads it yet)
│   ├── migrate.php                wp soli-tv migrate - WP-CLI only
│   ├── message_panel.php          Enqueues the editor sidebar panel
│   ├── settings_page.php          Tv berichten -> Instellingen, soli_tv_settings option
│   ├── tv_message_table.php       TVMessageTableHandler - schema + queries
│   └── tv_message_endpoints.php   soli_tv/v1 REST routes
├── blocks/
│   ├── block.php                  Includes the block registrations
│   ├── settings.php               Placeholder, currently commented-out boilerplate
│   └── tv-settings/
│       ├── index.php              SoliTVSettingsBlock - registers soli/tv-settings
│       └── src/                   React source, bundled to build/ by wp-scripts
└── uninstall.php          Drops the table when the plugin is deleted
```

### Optional dependency on the event plugin

`SoliTVSettingsBlock` passes `SoliTVData.isSoliEventsPluginActive` to the front end. The event
slides are only populated when `wp-soli-event-plugin` is active; the slideshow works without it.

To load it locally, copy `.wp-env.override.json.example` to `.wp-env.override.json`. That file is
gitignored, and it must carry **no `_comment` key**: wp-env validates config files against a fixed
set of options and aborts with `"_comment" is not a configuration option`, so a commented example
cannot be copied as-is. The example shipped with a `_comment` until 2026-09-09, which meant the
documented way to load the event plugin broke `wp-env start` for anyone who followed it.

This is why `.wp-env.json` does **not** reference a sibling checkout — a relative path like
`../wp-soli-event-plugin` does not exist on a CI runner and would break `wp-env start` there.

## Database

One table, `{prefix}tv_message`, created via `dbDelta()` on activation:

| Column       | Type            | Notes                                    |
|--------------|-----------------|------------------------------------------|
| `id`         | BIGINT UNSIGNED | Primary key, auto increment              |
| `title`      | TEXT            |                                          |
| `type`       | VARCHAR(20)     | `img_only`, `img_text`, `text_only`      |
| `content`    | LONGTEXT        |                                          |
| `start_date` | DATETIME        | Start of the active window               |
| `end_date`   | DATETIME        | End of the active window                 |
| `status`     | VARCHAR(20)     | `PLANNED` default; API accepts `draft`, `published`, `archived` |
| `img`        | BIGINT(20)      | Attachment ID                            |
| `link`       | TEXT            | URL encoded into the slide's QR code     |

There is no migration runner yet. Adding one means following the `soli_tv_db_version` pattern in
the root `CLAUDE.md`; `uninstall.php` already cleans that option up.

## The soli_tv_message post type

Step 2 of `PLAN-cpt-and-kiosk-route.md`, registered in `lib/post_type.php`. **Nothing reads it
yet** — the slideshow still runs off `{prefix}tv_message` and `soli_tv/v1`. It exists so the
migration lands on a type whose schema is already enforced.

| Meta key | Type | Schema |
|----------|------|--------|
| `_soli_tv_layout` | string | enum `img_only`/`img_text`/`text_only`, default `img_text` |
| `_soli_tv_fit` | string | enum `cover`/`contain`, default `cover` |
| `_soli_tv_start` | string | `pattern` (empty, or `YYYY-MM-DDTHH:mm(:ss)`), default `''` |
| `_soli_tv_end` | string | same pattern, default `''` |
| `_soli_tv_link` | string | `format: uri`, default `''` |
| `_soli_tv_disabled` | boolean | default `false`, registered on `soli_tv_message` **and** `soli_event` |

Four things about this are not obvious, each measured and each covered by `e2e/post-type.spec.js`:

**The window bounds use a `pattern`, not `format: date-time`.** That format rejects `''` with
"Invalid date." and `null` with "not of type string". The editor sends every registered key on
every save, so a message that left a bound blank could not be saved at all — the whole request
answered 400 and no field in the panel could be edited. A pattern accepts `''`, accepts both
precisions (the editor emits minutes, the migration writes seconds) and still rejects garbage.
Declaring `default => ''` alongside it is what makes a blank bound read back as `''` rather than
`null`, which the schema would refuse on the next save. `format: uri` does accept `''`, so the
link needs no pattern.

**`custom-fields` is required in `supports`.** `WP_REST_Posts_Controller` only adds the `meta`
field to a post type that declares it. Without it the response carries no `meta` key at all —
no error, just silence — and the editor can neither read nor write any registered meta.

**A default is only declared where the schema accepts it.** WordPress validates the default
against the whole schema, so `'default' => ''` under `format: date-time` raises
`register_meta was called incorrectly`. That notice prints before headers, which blocks the login
cookie and locks you out of wp-admin with "Cookies are blocked due to unexpected output" — a
schema slip in meta registration takes down login in any environment with `WP_DEBUG_DISPLAY` on.

**The `auth_callback` is load-bearing but cannot be stricter than the post.** Returning false
blocks an administrator's write. It cannot deny anyone the post capability already allows, because
`edit_post_meta` maps through `edit_post` first.

## The message sidebar panel

`blocks/tv-settings/src/message-panel.js`, enqueued by `lib/message_panel.php`. Step 4 of
`PLAN-cpt-and-kiosk-route.md`: layout, fit, window, QR link and the disabled flag, on the
`soli_tv_message` editor screen only.

`enqueue_block_editor_assets` fires for every editor, so the PHP checks
`get_current_screen()->post_type` and the component checks `getCurrentPostType()` as well — the
second check is the one that still holds if something else enqueues the handle.

The window uses native `datetime-local` inputs rather than core's `DateTimePicker`. Neither costs
bundle weight (`wp-components` is already loaded), but the native input emits exactly the string
the schema accepts, needs no timezone reasoning, and stays compact where `DateTimePicker` renders
a full inline calendar. Control spacing is an explicit grid `gap`: these controls carry no bottom
margin in the document sidebar, and unspaced the help text of one ran into the label of the next.

### Driving the editor from a test

Three things cost time here, all measured 2026-09-10:

- **`waitUntil: 'networkidle'` never resolves** in the editor — it keeps connections open, so the
  navigation times out on a page that is perfectly usable. Use `domcontentloaded`.
- **`Ctrl+S` does not reach the editor from a sidebar input.** It fired no REST request at all.
  Click the save control instead.
- **The save control is two different elements.** While the post is clean the header holds
  `.editor-post-saved-state` reading "Saved"; once dirty, that element is *replaced* by a
  "Save draft" button. Asserting that `.editor-post-saved-state` is visible proves nothing, since
  it is visible in the clean state — wait for its text.

`PluginDocumentSettingPanel` also renders collapsed, so its controls are absent from the DOM until
the panel's toggle is clicked.

**Editor state that lives in user preferences will pass locally and fail on CI.** Two caught this
way on 2026-09-10, both stored in the `wp_persisted_preferences` user meta:

- the **welcome guide** covers the editor as a modal for a new user, and every click times out. It
  had been dismissed by hand in the local environment months earlier, so the spec passed here and
  failed on both CI legs.
- **`openPanels`** remembers which document panels are expanded. Locally the panel was already
  open from manual use, hiding the fact that a fresh user gets it closed.

Set the preference in `beforeAll` rather than clicking the modal away, and write both the `core`
and `core/edit-post` scopes since the key has moved between them and this suite runs two WordPress
versions. Reproduce a fresh user with
`wp eval 'delete_user_meta( 1, "wp_persisted_preferences" );'` before trusting an editor spec.

## The Instellingen screen

`Tv berichten` -> `Instellingen`, registered in `lib/settings_page.php`, React app in
`blocks/tv-settings/src/settings-page.js`. Step 5 of `PLAN-cpt-and-kiosk-route.md`, and the shape
the legacy theme had.

Capability is `edit_posts`, not `manage_options`: turning a slide off is editorial work.

| State | Where it lives |
|-------|----------------|
| per-item on/off | `_soli_tv_disabled` meta on the message or event post |
| delay, onlyConcerts, selectedGroups | `soli_tv_settings` option, `register_setting` with `show_in_rest` |

The option's schema sets `additionalProperties: false`, so a stray key the migration picked up out
of a block attribute is dropped rather than stored forever.

### An event id is not a post id

`soli_event/v1/events/future/...` answers `{ events, totalEvents, totalPages }` — not an array —
and each event carries **both** `id` (a row in `{prefix}event_dates`) and `post_id`. The block
stored `id` in `disabledSlides.events`.

So this plugin's meta goes on `post_id`. Writing it against `id` lands on whatever unrelated post
happens to carry that number, which is what `wp soli-tv migrate` did until 2026-09-10; it now maps
the row id through `event_dates` and warns when no row matches.

One post can own several date rows, so the screen collapses them into one switch and the flag
covers every date of that event. The block could disable one date and not another; nothing in the
new model expresses that, and the loss is deliberate.

## Migration

`wp soli-tv migrate [--dry-run]` (`lib/migrate.php`), step 3 of
`PLAN-cpt-and-kiosk-route.md`. Registered only under WP-CLI: a data migration on `admin_init`
would run mid-request with no way to preview it. Three sources, each idempotent:

| Source | Becomes | Idempotent because |
|--------|---------|--------------------|
| `{prefix}tv_message` rows | new posts | the row id is stored as `_soli_tv_migrated_from` |
| legacy `tv` posts | converted in place | nothing of type `tv` is left afterwards |
| `soli/tv-settings` attributes | item meta + `soli_tv_settings` option | writing the same values again changes nothing |

Legacy posts are converted rather than copied, so ids, revisions and featured images survive.
Legacy `tv` is only a registered type while `wp-theme-soli` is active, so the query goes straight
at `$wpdb->posts` — `WP_Query` filters unregistered types out.

Dates move by substituting `T` for the space, never through `strtotime()`/`gmdate()`. The stored
value is already the wall-clock time the window means; reinterpreting it in PHP's timezone (UTC
inside WordPress) shifts every window by the site's offset.

Page content is never rewritten. The command reports which pages still carry the block so a person
decides when it comes out.

`e2e/migrate.spec.js` is the upgrade test. Two things about it:

**Assertions are spec-owned, never on the totals.** The migration is global and Playwright runs
spec files in parallel, so another spec's `tv_message` rows appear in the same report; a
`1 moved` assertion races them.

**Orphan meta has to be cleared in cleanup.** Meta for a post that does not exist survives
deleting posts, and the guard test asserts that exact row is absent — so one failing run otherwise
leaves residue that makes the next run fail for the previous run's reason. Measured while proving
the guard: disabling it wrote `_soli_tv_disabled` against a deleted event id, which then broke the
following proof.

## REST API

Namespace `soli_tv/v1`:

| Route            | Method | Capability   | Notes                                     |
|------------------|--------|--------------|-------------------------------------------|
| `/messages`      | GET    | public       | Messages whose window covers now. 204 when empty. |
| `/message/{id}`  | GET    | public       | Single message object. 204 when not found. |
| `/message[/{id}]`| POST   | `edit_posts` | Creates or updates. 400 on invalid body.  |

Accepted `status` values live in `SOLI_TV_MESSAGE_STATUSES`: `PLANNED` (the column default),
`draft`, `published`, `archived`. `PLANNED` is in the list so a row created by a direct insert can
be saved again through the API.

Writes go through `wpdb::insert()`/`wpdb::update()` with an explicit format per column, not
hand-built SQL, because `wpdb::prepare()` renders a null bound to `%s` as `''` - measured, that
stored a missing `img` as `0` rather than `NULL`. `e2e/message-persistence.spec.js` asserts this
and was confirmed to fail against the old statement.

Dates cross the wire as MySQL `DATETIME` literals in site-local time (`toMysqlDateTime()` in
`tv-message-provider.js`). A `Date` serialized to JSON is ISO-8601 with `T`/`Z`, which MySQL will
not accept for a `DATETIME` column.

The GET routes are deliberately public — the TV display polls them without a session.

## Development

```bash
npm install
npm run env:start      # dev on :8898, tests on :8899
npm run build          # bundles blocks/tv-settings/src into build/
npm run test:e2e       # Playwright against the tests environment
npm run env:stop
```

Ports are pinned to 8898/8899 because several Soli plugins run wp-env side by side and would
otherwise fight over the 8888/8889 defaults.

`lifecycleScripts.afterStart` runs `wp core update-db` and pushes `admin_email_lifespan` into the
future, so a started environment is immediately usable — without it WordPress interrupts login with
the admin-email interstitial and redirects wp-admin to `upgrade.php`.

### Tests

**The suite runs with one worker, on CI and locally.** Every spec drives the same WordPress
instance, so parallel spec files collide on global state — three times so far: another spec's
`tv_message` rows joined the migration's report, orphan postmeta from one run failed the next, and
deleting `soli_tv_settings` in one file broke an assertion about it in another. Each presented as
a result unrelated to the change under test. The suite goes from roughly 30s to 1m40s for it.

`seedTvBlockPage()` must be paired with `deleteTvBlockPage()` in an `afterAll`. Unpaired it leaks
one page per run: 148 had accumulated locally by 2026-09-10, and since `wp soli-tv migrate` reports
every page carrying the block, the litter made its output unreadable.

`e2e/auth.setup.js` logs in once and stores the session in `e2e/.auth/admin.json`; the chromium
project depends on it. Logging in per test raced and produced intermittent redirects back to
`wp-login.php`. Specs asserting anonymous access opt out with `test.use({ storageState: ... })`.

Assert on `#wpadminbar` rather than a `/wp-admin/` URL match — a rejected login lands on
`wp-login.php?redirect_to=...%2Fwp-admin%2F`, which matches a naive URL regex.

### Blocks

`blocks/tv-settings/index.php` reads the webpack-generated `build/*.asset.php` for script
dependencies and version, falling back to a hardcoded list when the bundle has not been built.
Do not hand-maintain the dependency array — it drifts from what `src/` imports.

### Translations

Text domain `soli-tv`, files in `languages/`, locales `nl_NL` and `en_US`. Source strings are a
mix of English and Dutch, so each locale translates the opposite direction.

```bash
npm run i18n:build     # pot + mo + json, requires a running wp-env
```

JS translations need `wp_set_script_translations()`, already wired for both the editor and
front-end handles.

## Releases

Follows the standard Soli flow in the root `CLAUDE.md`. Version lives in four places:

1. `soli-tv-plugin.php` plugin header
2. `SOLI_TV__PLUGIN_VERSION`
3. `README.md` — `~Current Version: x.y.z~`
4. `package.json`

`publish.js` reads the plugin name from `README.md` and the exclusion list from `.zipignore`. The
built `build/` directory must exist before packaging, so `npm run publish` builds first.

## Known gaps

- `blocks/settings.php` is entirely commented-out boilerplate copied from the featured-image
  plugin, still `require_once`d by `blocks/block.php`.
- Nothing in the editor sets `status` yet; the provider defaults a new message to `draft`, so
  `published` and `archived` are reachable only over the API.
- No migration runner; schema changes currently only reach fresh activations.
