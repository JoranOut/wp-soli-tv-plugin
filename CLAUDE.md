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
| `_soli_tv_start` | string | `format: date-time` |
| `_soli_tv_end` | string | `format: date-time` |
| `_soli_tv_link` | string | `format: uri` |
| `_soli_tv_disabled` | boolean | default `false`, registered on `soli_tv_message` **and** `soli_event` |

Three things about this are not obvious, each measured on 2026-09-09 and each covered by
`e2e/post-type.spec.js`:

**`custom-fields` is required in `supports`.** `WP_REST_Posts_Controller` only adds the `meta`
field to a post type that declares it. Without it the response carries no `meta` key at all —
no error, just silence — and the editor can neither read nor write any registered meta.

**Only the enum fields carry a `default`.** WordPress validates a default against the whole
schema, `format` included, so `'default' => ''` on a `date-time` or `uri` field raises
`register_meta was called incorrectly`. That notice prints before headers, which blocks the login
cookie and locks you out of wp-admin with "Cookies are blocked due to unexpected output" — a
schema slip in meta registration takes down login in any environment with `WP_DEBUG_DISPLAY` on.

**The `auth_callback` is load-bearing but cannot be stricter than the post.** Returning false
blocks an administrator's write. It cannot deny anyone the post capability already allows, because
`edit_post_meta` maps through `edit_post` first.

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
