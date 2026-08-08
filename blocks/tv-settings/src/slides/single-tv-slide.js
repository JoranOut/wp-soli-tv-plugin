import './single-tv-slide.scss';
import { useMemo, RawHTML, useState } from '@wordpress/element';
import defaultBackground from '../../assets/img/default_background.jpg';

export default function SingleTVSlide({slide, isActive}) {
    const showImage = slide.type === 'img_only' || slide.type === 'img_text';
    const showContent = slide.type === 'text_only' || slide.type === 'img_text';

    const QRsrc = useMemo( () => {
        return slide.link ? `https://quickchart.io/qr?text=${encodeURIComponent(slide.link)}` : null;
        },
        [slide.link]
    );

    return (
        <div
            className={`soli-tv-block-single-slide ${slide.slide_type} ${slide.type} ${isActive ? 'is-active' : 'is-inactive'}`}
        >
            {showImage && (
                slide.img ? <img className="content-image" src={`http://localhost:8888/?attachment_id=${slide.img}`}/>
                    : <img className="content-image" src={defaultBackground}/>)
            }
            {slide.content && showContent &&
                <div className="content">
                    <h2>{slide.title}</h2>
                    <RawHTML>{slide.content}</RawHTML>
                </div>
            }
            {slide.link &&
                <div className="qr-wrapper">
                    <p>Scan de QR!</p>
                    <img
                        src={QRsrc}
                        alt="QR code"
                        style={{ width: 160, height: 160 }}
                        loading="lazy"
                    />
                </div>
            }
        </div>
    );
}
