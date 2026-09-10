import "./settings-page.scss";
import {
  createRoot,
  useEffect,
  useState,
  useCallback,
} from "@wordpress/element";
import apiFetch from "@wordpress/api-fetch";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Notice,
  RangeControl,
  Spinner,
  ToggleControl,
} from "@wordpress/components";
import { __, sprintf } from "@wordpress/i18n";

/**
 * The `Instellingen` overview screen.
 *
 * Step 5 of PLAN-cpt-and-kiosk-route.md. Every message and upcoming event in
 * one list with an on/off switch, plus the settings that used to be block
 * attributes.
 *
 * The on/off switch writes `_soli_tv_disabled` on the item itself. In the block
 * it was an attribute serialised into a page's content, which meant the toggle
 * needed a page edit to change, two pages holding the block diverged, and -
 * measured before this change - it never reached the TV at all, because the
 * render callback passed only `selectedGroups` to the front end.
 */

const MESSAGES_ROUTE = "/wp/v2/soli_tv_message";
const EVENTS_ROUTE = "/soli_event/v1/events/future/1/20";
const SETTINGS_ROUTE = "/wp/v2/settings";

const globals =
  typeof window !== "undefined" && window.SoliTVSettingsPage
    ? window.SoliTVSettingsPage
    : {};

function SettingsPage() {
  const [messages, setMessages] = useState(null);
  const [events, setEvents] = useState([]);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch({
      // context=edit for two reasons: `title.raw` exists only there, and
      // the page already requires edit_posts anyway.
      path:
        MESSAGES_ROUTE +
        "?per_page=100&status=publish,draft&orderby=menu_order&order=asc&context=edit",
    })
      .then(setMessages)
      .catch((e) => {
        setMessages([]);
        setError(e.message || __("Berichten laden mislukte.", "soli-tv"));
      });

    apiFetch({ path: SETTINGS_ROUTE })
      .then((all) => setSettings(all.soli_tv_settings))
      .catch((e) =>
        setError(e.message || __("Instellingen laden mislukte.", "soli-tv")),
      );

    // The event plugin is optional, so a failure here is not an error the
    // screen should report: the list simply has no events in it.
    if (globals.eventsPluginActive) {
      apiFetch({ path: EVENTS_ROUTE })
        // The endpoint answers { events, totalEvents, totalPages }, not
        // a bare array.
        .then((result) => withEventMeta(result?.events || []))
        .then(setEvents)
        .catch(() => setEvents([]));
    }
  }, []);

  const saveSettings = useCallback((next) => {
    setSettings(next);

    apiFetch({
      path: SETTINGS_ROUTE,
      method: "POST",
      data: { soli_tv_settings: next },
    }).catch((e) =>
      setError(e.message || __("Instellingen opslaan mislukte.", "soli-tv")),
    );
  }, []);

  if (messages === null || settings === null) {
    return (
      <div className="soli-tv-settings">
        <h1>{__("Tv instellingen", "soli-tv")}</h1>
        <Spinner />
      </div>
    );
  }

  return (
    <div className="soli-tv-settings">
      <h1>{__("Tv instellingen", "soli-tv")}</h1>

      {error && (
        <Notice status="error" onRemove={() => setError("")}>
          {error}
        </Notice>
      )}

      <Card className="soli-tv-settings__card">
        <CardHeader>
          <h2>{__("Weergave", "soli-tv")}</h2>
        </CardHeader>
        <CardBody>
          <RangeControl
            label={__("Seconden per slide", "soli-tv")}
            value={settings.delay}
            min={5}
            max={120}
            onChange={(delay) => saveSettings({ ...settings, delay })}
          />
          <ToggleControl
            label={__("Alleen concerten uit de agenda", "soli-tv")}
            checked={!!settings.onlyConcerts}
            onChange={(onlyConcerts) =>
              saveSettings({ ...settings, onlyConcerts })
            }
          />
        </CardBody>
      </Card>

      <SlideList
        title={__("Tv berichten", "soli-tv")}
        items={messages.map(messageToItem)}
        empty={__("Nog geen tv berichten.", "soli-tv")}
        action={
          globals.newMessageUrl && (
            <Button variant="secondary" href={globals.newMessageUrl}>
              {__("Nieuw bericht", "soli-tv")}
            </Button>
          )
        }
        onError={setError}
      />

      <SlideList
        title={__("Agenda", "soli-tv")}
        items={dedupeById(events.map(eventToItem))}
        empty={
          globals.eventsPluginActive
            ? __("Geen komende activiteiten.", "soli-tv")
            : __(
                "De agenda-plugin is niet actief, dus er staan geen activiteiten op het scherm.",
                "soli-tv",
              )
        }
        onError={setError}
      />
    </div>
  );
}

/**
 * One list of items with a switch each.
 *
 * The switch is optimistic and reverts on failure, because the alternative is a
 * spinner per row for a write that normally takes a moment.
 */
function SlideList({ title, items, empty, action, onError }) {
  const [overrides, setOverrides] = useState({});

  const toggle = (item) => (enabled) => {
    const key = item.type + ":" + item.id;

    setOverrides((current) => ({ ...current, [key]: enabled }));

    apiFetch({
      path: `/wp/v2/${item.restBase}/${item.id}`,
      method: "POST",
      data: { meta: { _soli_tv_disabled: !enabled } },
    }).catch((e) => {
      setOverrides((current) => ({ ...current, [key]: !enabled }));
      onError(
        e.message ||
          sprintf(
            /* translators: %s: title of the slide. */
            __("%s kon niet worden bijgewerkt.", "soli-tv"),
            item.title,
          ),
      );
    });
  };

  return (
    <Card className="soli-tv-settings__card">
      <CardHeader>
        <h2>{title}</h2>
        {action}
      </CardHeader>
      <CardBody>
        {!items.length && <p>{empty}</p>}

        {items.map((item) => {
          const key = item.type + ":" + item.id;
          const enabled = key in overrides ? overrides[key] : item.enabled;

          return (
            <div className="soli-tv-settings__row" key={key}>
              <ToggleControl
                label={item.title || __("(zonder titel)", "soli-tv")}
                checked={enabled}
                onChange={toggle(item)}
              />
              <span className="soli-tv-settings__meta">{item.detail}</span>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

/**
 * Adds `_soli_tv_disabled` to events from the event plugin's own endpoint.
 *
 * That endpoint knows which events are upcoming, which `wp/v2` cannot express
 * (the date is meta), but it returns the event plugin's own shape and knows
 * nothing about this plugin's meta. One extra `wp/v2/soli_event?include=` call
 * fetches the flag for exactly the ids already in hand, rather than a request
 * per row.
 */
function withEventMeta(events) {
  // post_id, never id: `id` is the row id of the event plugin's date table,
  // and one post can own several date rows. This plugin's flag lives on the
  // post, so it covers every date of that event.
  const ids = [
    ...new Set(events.map((event) => Number(event.post_id)).filter(Boolean)),
  ];

  if (!ids.length) {
    return Promise.resolve(events);
  }

  return (
    apiFetch({
      path:
        "/wp/v2/soli_event?context=edit&per_page=100&include=" + ids.join(","),
    })
      .then((records) => {
        const disabled = {};

        records.forEach((record) => {
          disabled[record.id] = !!record.meta?._soli_tv_disabled;
        });

        return events.map((event) => ({
          ...event,
          disabled_on_tv: !!disabled[Number(event.post_id)],
        }));
      })
      // A failure here costs the flags, not the list: showing the events as
      // enabled beats showing no agenda at all.
      .catch(() => events)
  );
}

function messageToItem(message) {
  const window = [message.meta?._soli_tv_start, message.meta?._soli_tv_end]
    .filter(Boolean)
    .map(formatDate);

  return {
    id: message.id,
    type: "message",
    restBase: "soli_tv_message",
    title: message.title?.raw || message.title?.rendered || "",
    enabled: !message.meta?._soli_tv_disabled,
    detail: window.length
      ? window.join(" – ")
      : __("altijd zichtbaar", "soli-tv"),
  };
}

function eventToItem(event) {
  return {
    // The switch writes to the post, so the post id is what identifies the
    // row here too. Several dates of one event therefore share a switch.
    id: Number(event.post_id),
    type: "event",
    restBase: "soli_event",
    title: event.post_title || "",
    enabled: !event.disabled_on_tv,
    detail: event.start_date ? formatDate(event.start_date) : "",
  };
}

/**
 * Collapses several date rows of one event into one switch.
 *
 * Without this an event with three dates shows three identical switches that
 * all write the same post meta, so two of them look broken the moment the
 * first is used.
 */
function dedupeById(items) {
  const seen = new Set();

  return items.filter((item) => {
    if (!item.id || seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
}

const DATE_FORMAT = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDate(value) {
  const date = new Date(String(value).replace(" ", "T"));

  return isNaN(date.getTime()) ? String(value) : DATE_FORMAT.format(date);
}

const root = document.getElementById("soli-tv-settings-root");

if (root) {
  createRoot(root).render(<SettingsPage />);
}
