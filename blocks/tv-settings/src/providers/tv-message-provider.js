import { createContext, useState, useEffect, useMemo } from '@wordpress/element';
import apiFetch from '@wordpress/api-fetch';

export const TvMessageContext = createContext({
    messages: [],
    saveTVMessage: (message) => {},
});

export default function TvMessageProvider({ children }) {
    const [messages, setMessages] = useState([]);

    const saveTVMessage = (message) => {
        // The active window and the status come from the caller. They used to be
        // overwritten here with yesterday..+31 days and 'draft' on every save,
        // which meant the date range the editor collected was discarded and no
        // message could ever leave draft. Only fall back when a field is absent.
        const payload = {
            ...message,
            startDate: message.startDate || defaultStart(),
            endDate: message.endDate || defaultEnd(),
            status: message.status || 'draft',
        };

        apiFetch({
            path: 'soli_tv/v1/message/' + (message.id ? message.id : ''),
            method: 'POST',
            data: toTVMessageDto(payload)
        }).then(
            (response) => {
                let newMessage = fromTVMessageDto(response)
                if(messages.some(m => m.id === newMessage.id)){
                    setMessages(messages.map(m => m.id === newMessage.id ? newMessage : m))
                } else {
                    setMessages([...messages, fromTVMessageDto(newMessage)])
                }
            },
            (error) => {
                console.error(error)
            }
        );
    };

    const getTVMessages = () => {
        apiFetch({path: 'soli_tv/v1/messages'})
            .then(
                (tvMessages) => {
                    if(tvMessages){
                        setMessages(tvMessages.map(m => fromTVMessageDto(m)));
                    }
                },
                (error) => {
                    console.error(error)
                }
            );
    };

    useEffect(() => {
        getTVMessages();
    }, []);

    return (
        <TvMessageContext.Provider value={{ messages, saveTVMessage }}>
            {children}
        </TvMessageContext.Provider>
    );
}

function toTVMessageDto(message){
    return {
        id: message.id,
        title: message.title,
        type: message.type,
        content: message.content,
        start_date: toMysqlDateTime(message.startDate),
        end_date: toMysqlDateTime(message.endDate),
        img: message.img,
        status: message.status,
        link: message.link,
    }
}

/**
 * Formats a date as MySQL DATETIME in the browser's own timezone.
 *
 * A Date serializes to JSON as an ISO-8601 string with a `T` separator and a
 * `Z` suffix, which is not a DATETIME literal: MySQL rejects it, so the column
 * ended up zeroed. The site's timezone is what the editor is showing and what
 * the active-window query compares against via current_time('mysql'), so the
 * local components - not the UTC ones - are the right ones to send.
 *
 * @param {Date|string|null} value
 * @return {string|null} `YYYY-MM-DD HH:mm:ss`, or null when there is no date.
 */
function toMysqlDateTime(value){
    if (!value) {
        return null;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
        return null;
    }

    const pad = (n) => String(n).padStart(2, '0');

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
    ].join('-') + ' ' + [
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds()),
    ].join(':');
}

/** Fallback active window for a message saved without one: today until +31 days. */
function defaultStart(){
    return new Date();
}

function defaultEnd(){
    const d = new Date();
    d.setDate(d.getDate() + 31);
    return d;
}

function fromTVMessageDto(message){
    return {
        id: message.id,
        title: message.title,
        type: message.type,
        content: message.content,
        startDate: message.start_date ? new Date(message.start_date) : null,
        endDate: message.end_date ? new Date(message.end_date) : null,
        img: message.img,
        status: message.status,
        link: message.link,
    }

}


