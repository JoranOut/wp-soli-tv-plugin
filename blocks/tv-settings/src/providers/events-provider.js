import {createContext, useState, useEffect, useMemo} from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

export const EventsContext = createContext({
    events: [],
});

export default function EventsProvider({children}) {
    const [events, setEvents] = useState([]);
    const {isSoliEventsPluginActive} = window.SoliTVData ?? {isSoliEventsPluginActive: false};

    if (!window.SoliTVData) {
        console.warn('SoliTVData is not defined. Make sure the Soli Events plugin is active and properly configured.');
    }

    const getSoliEvents = () => {
        if (!!isSoliEventsPluginActive) {
            const page = 1;
            const loadPerPage = 6;
            apiFetch({path: `soli_event/v1/events/future/${page}/${loadPerPage}/`})
                .then(
                    (soliEvents) => {
                        if (soliEvents) {
                            setEvents(soliEvents.events || []);
                        }
                    },
                    (error) => {
                        console.error(error)
                    }
                );
        }
    };

    useEffect(() => {
        getSoliEvents()
    }, []);

    return (
        <EventsContext.Provider value={{events}}>
            {children}
        </EventsContext.Provider>
    );
}

