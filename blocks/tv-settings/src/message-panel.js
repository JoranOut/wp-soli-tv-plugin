import { registerPlugin } from "@wordpress/plugins";
import { PluginDocumentSettingPanel } from "@wordpress/editor";
import { useSelect } from "@wordpress/data";
import { useEntityProp } from "@wordpress/core-data";
import {
  SelectControl,
  TextControl,
  ToggleControl,
} from "@wordpress/components";
import { __ } from "@wordpress/i18n";

const POST_TYPE = "soli_tv_message";

/**
 * Sidebar panel for a soli_tv_message's own fields.
 *
 * Step 4 of PLAN-cpt-and-kiosk-route.md. Title, body and image are the post's
 * own, handled by the editor; everything here is registered meta from
 * lib/post_type.php, so the enum and format checks come from the schema rather
 * than from this component.
 *
 * The window uses native `datetime-local` inputs rather than core's
 * DateTimePicker. Both are free of extra bundle weight (wp-components is
 * already loaded in the editor), but a datetime-local input emits exactly the
 * `YYYY-MM-DDTHH:mm(:ss)` the `format: date-time` schema accepts, needs no
 * timezone reasoning, and stays compact in a sidebar. DateTimePicker renders a
 * full inline calendar, which WordPress itself hides behind a dropdown.
 */
function MessagePanel() {
  const postType = useSelect(
    (select) => select("core/editor").getCurrentPostType(),
    [],
  );

  // registerPlugin has no per-post-type filter, so the panel bails on any
  // other editor screen. Without this it would appear on posts and pages.
  if (postType !== POST_TYPE) {
    return null;
  }

  return <MessageFields />;
}

function MessageFields() {
  const [meta, setMeta] = useEntityProp("postType", POST_TYPE, "meta");

  const update = (key) => (value) => setMeta({ ...meta, [key]: value });

  const layout = meta?._soli_tv_layout || "img_text";
  const showsImage = layout === "img_only" || layout === "img_text";

  return (
    <PluginDocumentSettingPanel
      name="soli-tv-message"
      title={__("Tv bericht", "soli-tv")}
      className="soli-tv-message-panel"
    >
      {/* Spacing is set here rather than left to the components. These
          controls render with no bottom margin in the document sidebar, so
          unspaced the help text of one ran straight into the label of the
          next. A grid gap is version-proof: it does not depend on whichever
          margin default @wordpress/components currently ships. */}
      {/* Each control carries a stable class. Tests must not select on label
          text: this plugin ships nl_NL and en_US, so a selector like
          getByLabel("Zichtbaar vanaf") holds only in one locale - and broke
          the moment the en_US translations were filled in. */}
      <div style={{ display: "grid", gap: "16px" }}>
        {/* Default control margins are kept deliberately: with
			     __nextHasNoMarginBottom the help text of one control collided
			     with the label of the next in the sidebar's narrow column. */}
        <SelectControl
          className="soli-tv-field--layout"
          label={__("Layout", "soli-tv")}
          value={layout}
          options={[
            { value: "img_text", label: __("Afbeelding + tekst", "soli-tv") },
            { value: "img_only", label: __("Alleen afbeelding", "soli-tv") },
            { value: "text_only", label: __("Alleen tekst", "soli-tv") },
          ]}
          onChange={update("_soli_tv_layout")}
          help={
            showsImage
              ? __("De uitgelichte afbeelding wordt gebruikt.", "soli-tv")
              : __("Deze slide gebruikt geen afbeelding.", "soli-tv")
          }
        />

        {/* Fit only means something when the slide shows an image. Hidden
			     rather than disabled: a control that can never apply is noise. */}
        {showsImage && (
          <SelectControl
            className="soli-tv-field--fit"
            label={__("Afbeelding vullend of passend", "soli-tv")}
            value={meta?._soli_tv_fit || "cover"}
            options={[
              { value: "cover", label: __("Vullend", "soli-tv") },
              { value: "contain", label: __("Passend", "soli-tv") },
            ]}
            onChange={update("_soli_tv_fit")}
          />
        )}

        <TextControl
          type="datetime-local"
          className="soli-tv-field--start"
          label={__("Zichtbaar vanaf", "soli-tv")}
          value={meta?._soli_tv_start || ""}
          onChange={update("_soli_tv_start")}
        />

        <TextControl
          type="datetime-local"
          className="soli-tv-field--end"
          label={__("Zichtbaar tot", "soli-tv")}
          value={meta?._soli_tv_end || ""}
          onChange={update("_soli_tv_end")}
          help={__(
            "Buiten deze periode staat de slide niet op het scherm.",
            "soli-tv",
          )}
        />

        <TextControl
          type="url"
          className="soli-tv-field--link"
          label={__("URL voor QR-code", "soli-tv")}
          value={meta?._soli_tv_link || ""}
          onChange={update("_soli_tv_link")}
          placeholder="https://soli.nl/..."
        />

        <ToggleControl
          className="soli-tv-field--disabled"
          label={__("Nu niet tonen", "soli-tv")}
          checked={!!meta?._soli_tv_disabled}
          onChange={update("_soli_tv_disabled")}
          help={__(
            "Houdt de slide van het scherm, ongeacht de periode.",
            "soli-tv",
          )}
        />
      </div>
    </PluginDocumentSettingPanel>
  );
}

registerPlugin("soli-tv-message-panel", { render: MessagePanel });
