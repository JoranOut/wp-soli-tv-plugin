import "./image-uploader.scss"
import {MediaUpload, MediaUploadCheck} from '@wordpress/block-editor';
import {useState, useEffect} from '@wordpress/element';
import {useSelect} from '@wordpress/data';
import {Button} from "@wordpress/components"
import cameraSVG from "../../assets/img/camera.svg";

function ImageUploader({defaultImageId, onChange}) {
    const [imageId, setImageId] = useState(defaultImageId);
    useEffect(() => {
        setImageId(defaultImageId);
    }, [defaultImageId]);

    const image = useSelect(
        (select) => imageId ? select('core').getMedia(imageId) : null,
        [imageId]
    );

    const onUpdateImage = (media) => {
        setImageId(media.id)
        onChange(media);
    }

    const onRemoveImage = () => {
        setImageId(0);
        onChange(null);
    };

    return (
        <>
            <MediaUploadCheck>
                <MediaUpload
                    onSelect={onUpdateImage}
                    allowedTypes={['image']}
                    value={imageId}
                    render={({open}) => (
                        <Button onClick={open} className="upload-image-button">
                            <div className="upload-icon"><img src={cameraSVG}/></div>
                            {image ?
                                <img src={image.source_url} alt={image.alt_text}/>
                                : <div className="empty"/>}
                        </Button>
                    )}
                />
            </MediaUploadCheck>

            {image && (
                <Button onClick={onRemoveImage} isDestructive>
                    Remove Featured Image
                </Button>
            )}
        </>
    );
}

export default ImageUploader;
