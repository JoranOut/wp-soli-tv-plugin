import { Modal, Popover, ComboboxControl, TextControl } from '@wordpress/components';
import { useState, useCallback, useContext, useMemo } from '@wordpress/element';
import { select } from '@wordpress/data';
import { __ } from '@wordpress/i18n';
import {
    BlockEditorProvider,
    BlockList,
    BlockTools,
    WritingFlow,
    ObserveTyping,
    BlockEditorKeyboardShortcuts,
    RichText,
} from '@wordpress/block-editor';
import { parse, serialize } from '@wordpress/blocks';

import editIcon from "../../../tv-settings/assets/img/add post.svg";
import ImageButton from "../image-button/image-button";
import ImageUploader from "../image-uploader/image-uploader";
import {TvMessageContext} from "../providers/tv-message-provider";
import {Button} from "@mui/material";
import DateRangePicker from "../daterange-picker/daterange-picker";

export default function MessageEditorModal({slide, icon}) {
    const [showPopup, setShowPopup] = useState(false);
    const [title, setTitle] = useState(slide?.title || '');
    const [type, setType] = useState(slide?.type || "img_text");
    const [blocks, setBlocks] = useState(() => parse(slide?.content || ''));
    const [imgId, setImgId] = useState(slide?.img || null);
    const [link, setLink] = useState(slide?.link || '');

    const {saveTVMessage} = useContext(TvMessageContext);

    const openPopup = () => {
        setShowPopup(true);
    }

    const closePopup = () => {
        setShowPopup(false);
    }

    const updateBlocks = useCallback( ( nextBlocks ) => {
        setBlocks( nextBlocks );
    }, []);

    const allowedBlockCategories = ['text', 'design'];

    const textBlockNames = useMemo(() => {
        const types = select('core/blocks').getBlockTypes() || [];
        return types
            .filter( (type) => allowedBlockCategories.includes(type.category))
            .map( (type) => type.name );
    }, []);

    const settings = useMemo(() => ({
        allowedBlockTypes: textBlockNames
    }), [textBlockNames]);

    const showImageUploader = type === 'img_only' || type === 'img_text';
    const showContentEditor = type === 'text_only' || type === 'img_text';

    const save = () => {
        saveTVMessage({
            ...slide,
            title: title,
            type: type,
            img: imgId,
            link: link?.trim() || null,
            content: serialize(blocks),
        })
        closePopup()
    }

    return (
        <div className="message-editor-modal">
            <ImageButton
                onClick={   openPopup}
                src={icon || editIcon}/>
            {showPopup && (
                <Modal
                    title={__('Edit TV Message', 'soli-tv')}
                    size={"small"}
                    onRequestClose={closePopup}
                    focusOnMount={true}
                    isDismissible={true}
                    shouldCloseOnEsc={true}
                    shouldCloseOnClickOutside={true}
                    __experimentalHideHeader={false}
                >
                    <RichText
                        tagName="h1"
                        value={title}
                        onChange={setTitle}
                        placeholder={__('Add a title…', 'soli-tv')}
                        allowedFormats={[]}         // keep it plain text
                        aria-label={__('Message title', 'soli-tv')}
                        className="message-editor__title"
                        style={{
                            margin: '0 0 12px',
                            fontSize: 28,
                            lineHeight: 1.25,
                            fontWeight: 700,
                        }}
                    />

                    <DateRangePicker
                        label={__('Active Date Range', 'soli-tv')}
                        start={( d => new Date(d.setDate(d.getDate()-1)) )(new Date)} // yesterday
                        end={( d => new Date(d.setDate(d.getDate()+31)) )(new Date)} // next month
                        onChange={range => console.log(range)}
                        />

                    <ComboboxControl
                        label={__('TV Type', 'soli-tv')}
                        value={type}
                        onChange={setType}
                        options={[
                            { value: "img_only", label: __('Image Only', 'soli-tv') },
                            { value: "img_text", label: __('Image + Text', 'soli-tv') },
                            { value: "text_only", label: __('Text Only', 'soli-tv') }
                        ]}
                    />

                    <TextControl
                        label={__('URL for QR (optional)', 'soli-tv')}
                        value={link}
                        type="url"
                        placeholder="https://example_link_for_QR.com"
                        onChange={setLink}
                    />

                    {
                        showImageUploader &&
                        <ImageUploader
                            defaultImageId={imgId}
                            onChange={media => {
                                return media ? setImgId(media.id) : setImgId(null)
                            }}
                        />
                    }

                    {
                        showContentEditor && (
                        <div style={{ marginTop: '20px' }}>
                            <BlockEditorProvider value={blocks} onInput={updateBlocks} onChange={updateBlocks} settings={settings}>
                                <BlockEditorKeyboardShortcuts />
                                <BlockTools>
                                    <WritingFlow>
                                        <ObserveTyping>
                                            <BlockList />
                                        </ObserveTyping>
                                    </WritingFlow>
                                </BlockTools>
                            </BlockEditorProvider>
                        </div>
                    )}

                    <Button
                        style={{marginTop: '20px'}}
                        onClick={save}>
                        Save Message
                    </Button>

                    {/* Important: popovers/toolbars portal target */}
                    <Popover.Slot />
                </Modal>
            )}

        </div>

    )
}
