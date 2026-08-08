import './selected-date.scss';
import calendarIcon from "../../assets/img/calendar.svg";
import locationIcon from "../../assets/img/pin-1.svg";
import dayjs from "dayjs";
import {useState, useEffect} from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import {LocalizationProvider} from "@mui/x-date-pickers/LocalizationProvider";
import {AdapterDayjs} from "@mui/x-date-pickers/AdapterDayjs";
import {displayRooms, showVenue} from "../utils/values";


function SelectedDate({date}) {
    dayjs.locale("nl");
    const [startDate, setStartDate] = useState(dayjs(date?.startDate));
    const [endDate, setEndDate] = useState(dayjs(date?.endDate));
    const [location, setLocation] = useState(date?.location);
    const [rooms, setRooms] = useState(date?.rooms);


    const isSameDay = (d1, d2) => {
        return d1.date() === d2.date() &&
            d1.month() === d2.month() &&
            d1.year() === d2.year();
    }

    let today = dayjs();

    useEffect(() => {
        setStartDate(dayjs(date?.startDate));
        setEndDate(dayjs(date?.endDate));
        setLocation(date?.location);
        setRooms(date?.rooms);
        today = dayjs();
    }, [date]);

    return (
        <div className="soli-tv-date-view">
            <LocalizationProvider
                dateAdapter={AdapterDayjs}
                adapterLocale={'nl'}
            >
                <div className="date">
                    <img src={calendarIcon}/>
                    <span>{startDate.format("DD MMMM YYYY (dddd)")}</span>
                    <span>{startDate.format("HH:mm")}</span>
                    <span> - </span>
                    <span>{endDate.format("HH:mm")}</span>
                    <span>{!isSameDay(startDate, endDate) ? endDate.format("DD MMMM YYYY (dddd)") : ""}</span>
                </div>
            </LocalizationProvider>
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
