import "./daterange-picker.scss"
import {useState, useEffect, useRef} from '@wordpress/element';
import {DatePicker} from '@mui/x-date-pickers/DatePicker';
import {AdapterDayjs} from "@mui/x-date-pickers/AdapterDayjs";
import {LocalizationProvider} from "@mui/x-date-pickers/LocalizationProvider";
import dayjs from "dayjs";
import 'dayjs/locale/nl';
import customParseFormat from "dayjs/plugin/customParseFormat";

function DateRangePicker({start, end, label, onChange, ...props}) {
    const [startDate, setStartDate] = useState(dayjs(start || getDefaultDate()))
    const [endDate, setEndDate] = useState(dayjs(end || getDefaultDate(1)))
    const [style, setStyle] = useState(props.style ? props.style : "grid")

    const [validStartDate, setValidStartDate] = useState(true);
    const [validEndDate, setValidEndDate] = useState(true);

    dayjs.extend(customParseFormat);

    const dateInput1 = useRef();
    const dateInput2 = useRef();

    const updateDate = (newStartDate, newEndDate) => {
        onChange({start: newStartDate.toDate(), end: newEndDate.toDate()})
    }

    const isSingleDay = () => {
        return startDate.date() === endDate.date() &&
            startDate.month() === endDate.month() &&
            startDate.year() === endDate.year();
    }

    const resizeInput = (ref) => {
        if (ref.current) {
            const input = ref.current.querySelector('input');
            input.style.width = input.value?.length + "ch";
        }
    }

    const isDateInValid = (date) => {
        return isNaN(date.year());
    }

    useEffect(() => {
        setStartDate(dayjs(start || getDefaultDate()))
        setEndDate(dayjs(end || getDefaultDate(1)))
    }, [props.date])

    useEffect(() => {
        resizeInput(dateInput1);
    }, [startDate, props.date])

    useEffect(() => {
        resizeInput(dateInput2);
    }, [endDate, props.date])

    return (
        <>
            <div className={["date-range-picker", isSingleDay() ? "single-day" : "multi-day", style].join(' ')}>
                {label && <label>{label}</label>}
                <LocalizationProvider
                    dateAdapter={AdapterDayjs}
                    adapterLocale={'nl'}
                >
                    <div className={["start-date", validStartDate ? "" : "invalid"].join(" ")}>
                        <span className="weekday"
                              onClick={() => {
                                  dateInput1.current.querySelector('input').focus()
                              }}
                        >{startDate.locale("nl").format("dddd")}</span>
                        <DatePicker
                            ref={dateInput1}
                            value={startDate}
                            onChange={(newStartDate) => {
                                if (isDateInValid(newStartDate)) {
                                    setValidStartDate(false);
                                    return;
                                }

                                let newEndDate = endDate;
                                if (isSingleDay()) {
                                    newEndDate = newEndDate
                                        .year(newStartDate.year())
                                        .month(newStartDate.month())
                                        .date(newStartDate.date());
                                }
                                setValidStartDate(true);
                                setStartDate(newStartDate);
                                setEndDate(newEndDate);
                                updateDate(newStartDate, newEndDate);
                            }}
                            format=" D MMMM, YYYY"
                        />
                    </div>
                    <div className="tot">tot</div>
                    <div className={["end-date", validEndDate ? "" : "invalid"].join(" ")}>
                        <span className="weekday"
                              onClick={() => {
                                  dateInput2.current.querySelector('input').focus()
                              }}
                        >{endDate.locale("nl").format("dddd")}</span>
                        <DatePicker
                            value={endDate}
                            ref={dateInput2}
                            onChange={(newEndDate) => {
                                if (isDateInValid(newEndDate)) {
                                    setValidEndDate(false);
                                    return;
                                }

                                setValidEndDate(true);
                                setEndDate(newEndDate);
                                updateDate(startDate, newEndDate);
                            }}
                            minDate={startDate}
                            format=" D MMMM, YYYY"
                        />
                    </div>
                </LocalizationProvider>
            </div>
        </>
    )
}

function addHours(date, hours) {
    if (hours) {
        date.setTime(date.getTime() + (hours * 60 * 60 * 1000));
    }
    return date;
}

function getDefaultDate(h) {
    return addHours(new Date(), h).toISOString();
}

export default DateRangePicker;
