import './slide-preview.scss';
import { useContext, useLayoutEffect, useEffect, useState, useRef } from '@wordpress/element';
import SingleSlide from "./single-slide";
import {SlideSelectorContext} from "./slide-selector";
import {SlidesContext} from "../providers/slides-provider";

export default function SlidePreview() {
    const {currentSlide} = useContext(SlideSelectorContext);
    const { getSlideByIndex } = useContext(SlidesContext);

    const slide = getSlideByIndex(currentSlide);

    const baseHeight = 1080;
    const baseWidth = 1920;

    const outerRef = useRef(null);
    const [scale, setScale] = useState(1);

    const setScaleFromSize = (w, h) => {
        const s = Math.min(w / baseWidth, h / baseHeight);
        setScale(Number.isFinite(s) && s > 0 ? s : 1);
    };

    useLayoutEffect(() => {
        if (outerRef.current) {
            setScaleFromSize(
                outerRef.current.clientWidth,
                outerRef.current.clientHeight
            );
        }
    }, [baseWidth, baseHeight]);

    useEffect(() => {
        const el = outerRef.current;
        if (!el) return;

        const ro = new ResizeObserver((entries) => {
            const cr = entries[0].contentRect;
            setScaleFromSize(cr.width, cr.height);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [baseWidth, baseHeight]);


    return (
        <div
            ref={outerRef}
            className="soli-tv-block-slide-preview"
            style={{
                aspectRatio: `${baseWidth} / ${baseHeight}`, // locks 16:9 by default
            }}
        >
            <div
                className="tv-content"
                style={{
                    width: baseWidth,
                    height: baseHeight,
                    transform: `scale(${scale})`
                }}
            >
                {slide && <SingleSlide slide={slide}/>}
            </div>
        </div>
    );
}
