import './selected-date.scss';
import calendarIcon from "../../assets/img/calendar.svg";
import locationIcon from "../../assets/img/pin-1.svg";
import { __ } from '@wordpress/i18n';
import {displayRooms, showVenue} from "../utils/values";

/**
 * Date and time formatters for the slideshow.
 *
 * These replace dayjs and `@mui/x-date-pickers`. The MUI `LocalizationProvider`
 * this component used to render wrapped plain text with no picker inside it, so
 * it did nothing but pull an adapter into the bundle the TV downloads.
 *
 * Built once at module scope rather than per render: constructing an
 * Intl.DateTimeFormat is the expensive part, and formatting is cheap.
 */
const DATE_FORMAT = new Intl.DateTimeFormat('nl-NL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
});

const WEEKDAY_FORMAT = new Intl.DateTimeFormat('nl-NL', { weekday: 'long' });

const TIME_FORMAT = new Intl.DateTimeFormat('nl-NL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

/** `09 september 2026 (woensdag)`, matching the previous dayjs format. */
function formatDate(date) {
    if (!isValid(date)) {
        return '';
    }

    return DATE_FORMAT.format(date) + ' (' + WEEKDAY_FORMAT.format(date) + ')';
}

/** `20:15`. */
function formatTime(date) {
    return isValid(date) ? TIME_FORMAT.format(date) : '';
}

function isValid(date) {
    return date instanceof Date && !isNaN(date.getTime());
}

function toDate(value) {
    if (!value) {
        return null;
    }

    return value instanceof Date ? value : new Date(value);
}

function isSameDay(d1, d2) {
    return isValid(d1) && isValid(d2) &&
        d1.getDate() === d2.getDate() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getFullYear() === d2.getFullYear();
}

function SelectedDate({date}) {
    // Derived straight from the prop. This used to be mirrored into state and
    // re-synced in an effect, which is what the effect existed for; computing it
    // is equivalent and drops the extra render.
    const startDate = toDate(date?.startDate);
    const endDate = toDate(date?.endDate);
    const location = date?.location;
    const rooms = date?.rooms;

    return (
        <div className="soli-tv-date-view">
            <div className="date">
                <img src={calendarIcon}/>
                <span>{formatDate(startDate)}</span>
                <span>{formatTime(startDate)}</span>
                <span> - </span>
                <span>{formatTime(endDate)}</span>
                <span>{!isSameDay(startDate, endDate) ? formatDate(endDate) : ""}</span>
            </div>
            <div className="location">
                <img src={locationIcon}/>
                <div>
                    {location &&
                        <>
                            <span>{location.name}</span>
                            <span>{location.address}</span>
                        </>
                    }
                    {rooms &&
                        <>
                            <a href="/muziekcentrum" target="_blank">{__('Muziekcentrum Soli', 'soli-tv')}</a>
                            <br/>
                            <span>{displayRooms(rooms)}</span>
                        </>
                    }
                </div>
            </div>
        </div>);
}

export default SelectedDate;
