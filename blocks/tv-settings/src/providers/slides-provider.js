import { createContext, useContext } from '@wordpress/element';
import { TvMessageContext } from '../providers/tv-message-provider';
import { EventsContext } from "./events-provider";

export const SlidesContext = createContext({
    slides: [],
    enableSlide: () => {},
    getSlideByIndex: () => {},
    getEnabledEvents: () => {},
});

export default function SlidesProvider({ disabledSlides, saveDisabledSlides, children }) {
    const { messages } = useContext(TvMessageContext);
    const { events } = useContext(EventsContext);

    const slides = [...messages.map(messageToSlide), ...events.map(eventToSlide) ]
        // hash the title and id and use this to sort the slides
        .sort((a, b) => {
            const hashA = hashCode(a.title + a.id);
            const hashB = hashCode(b.title + b.id);
            return hashA - hashB;
        })
        .map(addIndex)
        .map(slide => addEnabledProperty(slide, disabledSlides));

    const enableSlide = (index, enabled) => {
        slides[index].enabled = enabled;
        const newDisabledSlides = disabledSlides ? {...disabledSlides}
            : {
                messages: [],
                events: []
            };
        switch (slides[index].slide_type) {
            case 'message':
                if (enabled) {
                    newDisabledSlides.messages = disabledSlides.messages.filter(id => id !== slides[index].id);
                } else {
                    newDisabledSlides.messages.push(slides[index].id);
                }
                break;
            case 'event':
                if (enabled) {
                    newDisabledSlides.events = disabledSlides.events.filter(id => id !== slides[index].id);
                } else {
                    newDisabledSlides.events.push(slides[index].id);
                }
                break;
            default:
                throw Error(`Unknown slide type: ${slides[index].slide_type}`);
        }
        saveDisabledSlides(newDisabledSlides);
    }

    const getSlideByIndex = (index) => {
        return slides.find(slide => slide.index === index);
    }

    const getEnabledEvents = () => {
        return events.map(eventToSlide)
            .map(slide => addEnabledProperty(slide, disabledSlides))
            .filter(slide => slide.enabled)
    }

    return (
        <SlidesContext.Provider value={{ slides, enableSlide, getSlideByIndex, getEnabledEvents }}>
            {children}
        </SlidesContext.Provider>
    );
}

function addIndex(slide, index) {
    return {
        ...slide,
        index
    };
}

function addEnabledProperty(slide, disabledSlides) {
    return {
        ...slide,
        enabled: !disabledSlides
            || (slide.slide_type === "message" && !disabledSlides.messages.includes(slide.id))
            || (slide.slide_type === "event" && !disabledSlides.events.includes(slide.id))
    }
}

function messageToSlide(message) {
    return {
        ...message,
        id: message.id,
        slide_type: 'message',
        type: message.type,
        title: message.title,
        content: message.content,
        img: message.img,
        startDate: message.startDate,
        endDate: message.endDate,
        link: message.link
    };
}

function eventToSlide(event) {
    return {
        ...event,
        id: event.id,
        slide_type: 'event',
        title: event.post_title,
        img: event.featured_image_id,
        startDate: event.start_date,
        endDate: event.end_date,
        rooms: event.rooms ? JSON.parse(event.rooms) : null,
        location: event.location_name ? {
            name: event.location_name,
            address: event.location_address
        } : null,
        excerpt: event.post_excerpt,
        link: event.guid
    };
}

/**
 * Returns a hash code from a string
 * @param  {String} str The string to hash.
 * @return {Number}    A 32bit integer
 * @see http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
 */
function hashCode(str) {
    let hash = 0;
    for (let i = 0, len = str.length; i < len; i++) {
        let chr = str.charCodeAt(i);
        hash = (hash << 5) - hash + chr;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}