import './single-event-slide.scss'
import { useContext } from '@wordpress/element';
import {SlidesContext} from "../providers/slides-provider";
import SelectedDate from "../selected-date/selected-date";
import defaultBackground from '../../assets/img/default_background.jpg';

export default function SingleEventSlide({slide, isActive}) {
    const {getEnabledEvents} = useContext(SlidesContext);

    return (
        <div className={`soli-tv-block-single-slide ${slide.slide_type} ${isActive ? 'is-active' : 'is-inactive'}`}>

            <div
                className="single-event"
            >
                {(
                    slide.img ? <img className="content-image" src={`/?attachment_id=${slide.img}`}/>
                        : <img className="content-image" src={defaultBackground}/>)
                }
                <div className="content">
                    <h2>{slide.title}</h2>
                    {slide.location && <p>Location: {slide.location}</p>}
                    <SelectedDate date={slide} />
                    {slide.excerpt && <p className="excerpt">{slide.excerpt}</p>}
                </div>
            </div>
            <div className="featured-events">
                <div className="central-border wavy-border"/>
                <h1>Agenda</h1>
                {getEnabledEvents() && getEnabledEvents().map( event => {
                    const startDate = new Date(event.startDate);
                    const dayFormat = { day: '2-digit', month: 'short' };
                    const timeFormat = { hour: '2-digit', minute: '2-digit', hour12: false };
                    const formattedDate = startDate.toLocaleDateString('nl-NL', dayFormat);
                    const formattedTime = startDate.toLocaleTimeString('nl-NL', timeFormat);
                    return (
                        <div key={event.id} className="featured-event">
                            <p className="startdate">{formattedDate}</p>
                            <p className="starttime">{formattedTime}</p>
                            <h3 className="title">{event.title}</h3>
                            <div className="line"/>
                            {event.location && <p className="location">{event.location}</p>}
                            {event.rooms && <p className="location">SOLI muziekcentrum</p>}
                        </div>
                    );
                })}
            </div>

        </div>
    );
}
