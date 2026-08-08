import './slide-selector.scss';
import { useContext, createContext, useState } from '@wordpress/element';
import {SlidesContext} from "../providers/slides-provider";
import visibilityIcon from "../../../tv-settings/assets/img/visibility.svg";
import visibilityOffIcon from "../../../tv-settings/assets/img/visibility off.svg";
import editIcon from "../../../tv-settings/assets/img/add post.svg";
import addIcon from "../../../tv-settings/assets/img/add_circle.svg";
import ImageButton from "../image-button/image-button";
import MessageEditorModal from "../message-editor/message-editor-modal";

export const SlideSelectorContext = createContext({
    currentSlide: 0
});

export default function SlideSelector({children}) {
    const { slides, enableSlide } = useContext(SlidesContext);
    const [currentSlide, setCurrentSlide] = useState(0);

    const goToEventEditor = (event_id) => {
        window.open(`/wp-admin/post.php?post=${event_id}&action=edit`, "_blank");
    }

    return (
        <div className="soli-tv-block-slide-selector">
            <div className="slide-selector">
                {
                    // Render the slide selector items
                    slides.map((slide) => {
                        const start = new Date(slide.startDate).toLocaleDateString()
                        const end = new Date(slide.endDate).toLocaleDateString();
                        const isCurrentSlide = slide.index === currentSlide ? 'current' : '';

                        return (
                            <div key={slide.index}
                                 className={`soli-tv-block-slide-selector-item ${slide.slide_type} ${isCurrentSlide} ${slide.enabled ? 'enabled' : 'disabled'}`}
                                 onClick={() => setCurrentSlide(slide.index)}>
                                <ImageButton
                                    className="visibility-button"
                                    onClick={() => enableSlide(slide.index, !slide.enabled)}
                                    src={slide.enabled ? visibilityIcon : visibilityOffIcon}/>

                                <p className="slide-type">{slide.slide_type}</p>
                                <p className="slide-title">{slide.title}</p>
                                <p className="slide-dates">{start} { start !== end && `- ${end}`}</p>

                                {slide.slide_type === 'event' &&
                                    <ImageButton
                                        className="edit-button"
                                        onClick={() => goToEventEditor(slide.id)}
                                        src={editIcon}/>
                                }
                                {
                                    slide.slide_type === 'message' &&
                                    <MessageEditorModal
                                        slide={slide}
                                    />
                                }
                            </div>
                        );
                    })
                }
                <div className="soli-tv-block-slide-selector-item add-new-slide">
                    <MessageEditorModal
                        icon={addIcon}/>
                </div>
            </div>
            <SlideSelectorContext.Provider value={{ currentSlide }}>
                {children}
            </SlideSelectorContext.Provider>
        </div>
    );
}
