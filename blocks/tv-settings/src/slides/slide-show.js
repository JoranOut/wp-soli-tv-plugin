import './slide-show.scss';
import './qr-wrapper.scss';
import {useContext, useState, useEffect, useRef} from '@wordpress/element';
import {SlidesContext} from "../providers/slides-provider";
import SingleSlide from "./single-slide";
import {ArrowKeyNavigator} from "../utils/ArrowKeyNavigator";

export default function SlideShow({intervalMs = 50000, onIndexChange = null}) {
    const {slides} = useContext(SlidesContext);
    const [index, setIndex] = useState(0);
    const timerRef = useRef(null);

    const nextSlide = () => {
        setIndex((prev) => {
            const nextIdx = prev + 1 < slides.length ? prev + 1 : 0;
            if (onIndexChange) onIndexChange(nextIdx);
            return nextIdx;
        });
    };

    const prevSlide = () => {
        setIndex((prevIdx) => {
            const nextIdx = prevIdx - 1 >= 0 ? prevIdx - 1 : slides.length - 1;
            if (onIndexChange) onIndexChange(nextIdx);
            return nextIdx;
        });
    };

    const restartInterval = () => {
        if (slides.length <= 1) return;
        const delay = Math.max(intervalMs, 10000);
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = setInterval(nextSlide, delay);
    };

    useEffect(() => {
        if (slides.length <= 1) return;
        restartInterval();

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [intervalMs, slides.length]);

    return (
        <ArrowKeyNavigator leftKeyPress={() => prevSlide()} rightKeyPress={() => nextSlide()}>
            <div className="soli-tv-slide-show" aria-roledescription="carousel" aria-live="off">
                {
                    slides && slides.map((slide, i) => {
                        const isActive = i === index;
                        return (
                            <SingleSlide
                                key={slide.index}
                                slide={slide}
                                isActive={isActive}
                            />
                        );
                    })
                }
            </div>
        </ArrowKeyNavigator>

    );
}
