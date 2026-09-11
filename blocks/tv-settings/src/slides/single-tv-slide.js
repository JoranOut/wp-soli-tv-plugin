import './single-tv-slide.scss';
import { useMemo, RawHTML, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import defaultBackground from '../../assets/img/default_background.jpg';
import { imageUrl as slideImageUrl } from '../utils/slide-image';

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
                // The image sits in a frame of its own rather than being sized
                // by the grid cell: the frame takes the whole pane and clips,
                // and `object-fit` decides whether the image fills it (the
                // slide's `Vullend`) or fits inside it (`Passend`). Sizing the
                // <img> directly left the pane part background on any photo
                // whose aspect ratio was not the pane's.
                <div className="content-image-frame">
                    <img
                        className="content-image"
                        src={slideImageUrl(slide)}
                        style={{ objectFit: slide.fit === 'contain' ? 'contain' : 'cover' }}
                        alt=""
                    />
                </div>
            )}
            {slide.content && showContent &&
                <div className="content">
                    <h2>{slide.title}</h2>
                    <RawHTML>{slide.content}</RawHTML>
                </div>
            }
            {slide.link &&
                <div className="qr-wrapper">
                    <p>{__('Scan de QR!', 'soli-tv')}</p>
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
