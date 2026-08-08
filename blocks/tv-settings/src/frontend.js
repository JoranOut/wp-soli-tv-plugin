import './frontend.scss'
import { createRoot } from '@wordpress/element';
import SlideShow from "./slides/slide-show";
import EventsProvider from "./providers/events-provider";
import TvMessageProvider from "./providers/tv-message-provider";
import SlidesProvider from "./providers/slides-provider";

const divsToUpdate = document.querySelectorAll(".block-tv-settings")

divsToUpdate.forEach(function(div) {
    const root = createRoot(div);
    root.render(
        <EventsProvider>
            <TvMessageProvider>
                <SlidesProvider>
                    <SlideShow/>
                </SlidesProvider>
            </TvMessageProvider>
        </EventsProvider>
        )
    div.classList.remove("block-tv-settings")
})

