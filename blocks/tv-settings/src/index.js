import "./index.scss"
import EventsProvider from "./providers/events-provider";
import SettingsProvider from "./providers/settings-provider";
import TvMessageProvider from "./providers/tv-message-provider";
import Settings from "./settings/settings";
import SlidesProvider from "./providers/slides-provider";
import SlideSelector from "./slides/slide-selector";
import SlidePreview from "./slides/slide-preview";

wp.blocks.registerBlockType("soli/tv-settings", {
    title: "Soli TV Settings",
    icon: "embed-photo",
    category: "Soli",
    supports: {
        // Declare support for block's alignment.
        // This adds support for all the options:
        // left, center, right, wide, and full.
        align: true
    },
    attributes: {
        settings: {
            delay: 20
        },
        disabledSlides: {
            events: {
                type: 'array',
                default: []
            },
            messages: {
                type: 'array',
                default: []
            }
        },
        lock: {
            move: 'true',
            remove: 'true',
        }
    },
    edit: EditComponent,
    save: () => {
    },
})

function EditComponent({attributes, setAttributes}) {
    const saveSettings = (settings) => {
        setAttributes({ ...attributes, settings });
    }

    const saveDisabledSlides = (disabledSlides) => {
        setAttributes({
            ...attributes,
            disabledSlides
        });
    }

    return (
        <SettingsProvider settings={attributes.settings} saveSettings={saveSettings}>
            <EventsProvider>
                <TvMessageProvider>
                    <SlidesProvider disabledSlides={attributes.disabledSlides} saveDisabledSlides={saveDisabledSlides}>
                        <SlideSelector>
                            <SlidePreview/>
                        </SlideSelector>
                        <Settings/>
                    </SlidesProvider>
                </TvMessageProvider>
            </EventsProvider>
        </SettingsProvider>
    );
}


