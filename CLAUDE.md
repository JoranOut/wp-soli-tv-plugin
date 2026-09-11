# wp-soli-tv-plugin

WordPress plugin driving the automated TV display for Muziekvereniging Soli — the screen in the
Soli muziekcentrum that cycles through announcements and upcoming events.

## Purpose

The plugin owns two things:

1. **TV messages** — `soli_tv_message` posts carrying a layout, an image fit, an active window, a
   QR link and an on/off switch, edited in the post editor with an overview at
   `Tv berichten` → `Instellingen`.
2. **The screen** — `/tv/`, a plugin-owned route that renders those messages interleaved with
   events from the event plugin as a looping full-screen slideshow.

## Architecture

```
soli-tv-plugin.php          Bootstrap: constants, activation, textdomain, GitHub updater
├── lib/
│   ├── post_type.php              soli_tv_message CPT + registered meta
│   ├── migrate.php                wp soli-tv migrate - WP-CLI only
│   ├── message_panel.php          Enqueues the editor sidebar panel
│   ├── settings_page.php          Tv berichten -> Instellingen, soli_tv_settings option
│   └── kiosk.php                  /tv/ - the screen, payload printed into the document
├── blocks/tv-settings/src/    React source, bundled to build/ by wp-scripts
│   ├── kiosk.js                   The screen at /tv/
│   ├── settings-page.js           The Instellingen overview
│   ├── message-panel.js           The editor sidebar panel
│   └── slides/                    Slide components, shared by the screen
└── uninstall.php          Drops the legacy table and this plugin's options and meta

The `blocks/tv-settings` path is a leftover name: nothing here registers a block any more. It
still holds the React source because that is where the build tooling lives.
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

## The legacy tv_message table

`{prefix}tv_message` is no longer read by anything. `wp soli-tv migrate` copies its rows onto
`soli_tv_message` posts, and `uninstall.php` drops the table when the plugin is deleted.

**The data is deliberately left in place until a site has been migrated.** Stopping the reads is
reversible; `DROP TABLE` is not, and production still runs the legacy theme. Nothing in the
plugin's normal operation touches it.

Since the plugin no longer creates it, a fresh install has no such table, and
`e2e/migrate.spec.js` builds the legacy schema itself before seeding. That is deliberate rather
than skipping when the table is absent: the migration exists for sites that still have it, and CI
is precisely where a fresh install never does — so a skip there would quietly stop covering the
upgrade path. Guard any statement against this table with a `SHOW TABLES LIKE` check; an
unguarded one prints a `wpdb` error that breaks the next `wp eval` JSON read.

## The soli_tv_message post type

Registered in `lib/post_type.php`. Everything reads it: the screen at `/tv/`, the
`Instellingen` overview and the editor sidebar panel.

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

## The screen at /tv/

`lib/kiosk.php`, rendered by `blocks/tv-settings/src/kiosk.js`. Step 7 of
`PLAN-cpt-and-kiosk-route.md`.

**The URL is always `/tv/`.** `/tv` answers 301 to it. The `soli_tv` query var exists only as the
rewrite target and is not a second address.

That requires pretty permalinks: with the plain structure `/tv/` 404s **at Apache**, before
WordPress runs, so `.wp-env.json` now sets `/%postname%/` on start in both environments. Nothing
in the plugin can work around it — the request never reaches PHP.

A rule added on `init` does nothing until the rules are rebuilt, and an activation hook does not
fire on a plugin update, so `soli_tv_rewrite_version` is stored and one flush happens when it
changes. Bump it whenever the rule changes.

### What the document is, and is not

| | page carrying the block | `/tv/` |
|---|---|---|
| HTML | 97,518 bytes | ~3,700 |
| inline CSS | 38,992 (18 KB `global-styles`) | none |
| theme chrome | 39,979 | none |

No `wp_head()`, no theme template, no admin bar, no emoji script. `e2e/kiosk.spec.js` asserts the
absence of each, because that absence is the reason the route exists.

It caps the size of the document **minus its payload**, currently around 1,900 bytes. Capping the
whole document conflated "no theme" with "little content": with 65 messages the payload alone took
it past 20 KB and the assertion failed on a healthy site.

The slides are printed into the document as one JSON payload, so the first paint waits on nothing
and a failed refresh leaves the screen showing what it has. The refresh re-reads `/tv/` itself
rather than an endpoint, so one code path produces the slides.

**Scripts must be registered, not hand-written.** The bundle keeps `wp-element` and `wp-i18n` as
externals, so a bare `<script src>` loaded it with no dependencies and it died on
`Cannot read properties of undefined (reading 'element')`. `wp_scripts()->do_items( 'soli-tv-kiosk' )`
prints the handle and its dependency chain and nothing else — unlike `wp_print_footer_scripts()`,
which would also print whatever every other plugin queued for a page this document is not.

### An absent window means "always on"

The message query cannot compare `_soli_tv_start` alone: a message with no window has no meta row,
and a plain comparison drops it. Each bound is an OR of `NOT EXISTS`, empty, and the comparison.
The value compared is `T`-separated, matching how the meta is stored — it is a string comparison
in SQL, and `2026-09-10T19:00:00` sorts differently from `2026-09-10 19:00:00` around the
separator.

### Images were never rendering

The slides built `/?attachment_id=${slide.img}`, which answers **301 to a `text/html` attachment
page** — measured 2026-09-10 — so every slide with a featured image showed a broken one. The
payload carries `imgUrl` from `wp_get_attachment_image_url()` and
`blocks/tv-settings/src/utils/slide-image.js` prefers it, falling back to the old behaviour for
the block's front end until that goes.

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

### The list reaches further ahead than the screen

`KIOSK_EVENT_LIMIT` (20, in `lib/kiosk.php`) is how many upcoming event dates
`/tv/` carries. `SETTINGS_EVENT_HORIZON` (100, in `lib/settings_page.php`) is how
far the `Instellingen` list reaches. The gap is the point: an event that is still
beyond the screen's horizon has to be listed, or nobody can switch it off before
it appears. Both numbers are localised to the settings bundle so the two cannot
drift apart — the JS never hardcodes either.

A row past `KIOSK_EVENT_LIMIT` is marked rather than hidden, and so is any row
whose switch is on while the screen still will not show it:

| Marked | Because the screen |
|--------|--------------------|
| draft message | queries `post_status = publish` |
| window not started / passed | compares both bounds against now |
| event past the horizon | takes the first `KIOSK_EVENT_LIMIT` dates |
| non-concert while `onlyConcerts` is on | filters those out |

Without those markers a switch that is on and a slide that never appears read as
a broken screen. They are the first thing to look at when someone reports a
message missing from `/tv/`.

Two known mismatches are **not** marked, because the list and the screen ask
different questions of the event plugin: the endpoint filters on
`end_date >= now` and on the date's own `status`, while `soli_tv_kiosk_events()`
filters on `start_date >= now` and ignores `status` entirely. So an event that has
already begun, or one the agenda considers cancelled, can be listed and not shown
or shown and not listed.

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

## REST

There is no plugin-owned REST namespace. `soli_tv/v1` was removed with the block: the admin
surfaces use `wp/v2/soli_tv_message` and `wp/v2/settings`, and the screen is served HTML with its
data printed into the document.

Four of the six defects fixed in #15 were hand-rolled validation in those routes, which is the
argument that produced this whole migration.

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

JS translations need `wp_set_script_translations()`, wired for every handle: the screen, the
message panel and the settings page.

`make-pot` scans `build/` as well as `src/`, and that matters: `wp_set_script_translations()`
looks for `{domain}-{locale}-{md5(script path)}.json`, and the path it hashes is the **built**
file. A pot generated from `src/` alone produces JSON nobody loads.

**Rerun `npm run i18n:build` whenever strings change.** It was skipped through steps 4 and 5, and
about 50 new strings sat untranslated: an `en_US` admin read a Dutch interface while the
`.pot` still carried a 2026-08-08 timestamp.

**A `.po` entry with stale references is silently dropped from the JSON.** `make-json` only moves
strings whose references point at a JS file, so `Agenda` kept rendering untranslated even after its
`msgstr` was filled in — its references predated the current pot. `languages/` is now merged
against the pot (references rewritten, `msgstr` values carried over), which is what
`msgmerge` would do if it were available in the container.

The two locales are deliberately asymmetric. Source strings are a mix, so each locale only
translates the strings written in the other language and leaves the rest empty to fall back to the
source. `nl_NL` therefore has no JSON file for the panel or settings bundles at all: every string
in them is Dutch already, `make-json` writes no empty file, and WordPress falls back correctly.

### Never select on translated copy in a test

The suite runs against whatever locale the environment has, and filling in the `en_US`
translations broke five assertions at once — including two on WordPress's own UI, where
`Save draft` is `Concept opslaan` in Dutch.

Controls therefore carry stable class hooks (`soli-tv-field--start`,
`soli-tv-setting--delay`, `data-slide-type`/`data-slide-id` on a row) and specs select on those.
Same for core: use `button.editor-post-save-draft`, not its name. Dates are formatted in the
admin's locale, so assert on a year rather than a formatted date.

Both locales are worth running before trusting an admin-UI spec:

```bash
wp-env run tests-cli -- wp language core install nl_NL
wp-env run tests-cli -- wp site switch-language nl_NL   # then en_US
```

### The event plugin is absent on CI

`wp-soli-event-plugin` is loaded locally through `.wp-env.override.json` and is not installed on
CI, so `{prefix}event_dates` does not exist there. Agenda assertions that seed into it passed
locally and failed on both CI legs with `Table 'wp_event_dates' doesn't exist`. Guard such tests
with `test.skip()` on a check of both the active plugin and the table, and guard cleanup deletes
too — an unguarded `DELETE` against a missing table prints a `wpdb` error that then breaks the
next `wp eval` JSON read.

## Releases

Follows the standard Soli flow in the root `CLAUDE.md`. Version lives in four places:

1. `soli-tv-plugin.php` plugin header
2. `SOLI_TV__PLUGIN_VERSION`
3. `README.md` — `~Current Version: x.y.z~`
4. `package.json`

`publish.js` reads the plugin name from `README.md` and the exclusion list from `.zipignore`. The
built `build/` directory must exist before packaging, so `npm run publish` builds first.

## Known gaps

- The screen re-reads `/tv/` every five minutes and rebuilds the payload each time. Step 8 of
  `PLAN-cpt-and-kiosk-route.md` caches the document, which also keeps the screen working while
  WordPress is slow or down.
- An event's on/off switch is post meta, so it covers every date row of that event. The old block
  could disable one date and not another.
- `blocks/tv-settings` is a directory name that no longer describes its contents.
