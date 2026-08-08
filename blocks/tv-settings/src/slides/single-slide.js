import SingleEventSlide from "./single-event-slide";
import SingleTVSlide from "./single-tv-slide";

export default function SingleSlide({slide, isActive}) {
    switch (slide.slide_type){
        case "event":
            return (<SingleEventSlide slide={slide} isActive={isActive}/>);
        case "message":
            return (<SingleTVSlide slide={slide} isActive={isActive}/>)
        default:
            throw new Error("NOT SUPPORTED");
    }
}
