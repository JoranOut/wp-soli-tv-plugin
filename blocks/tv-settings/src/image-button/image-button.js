import './image-button.scss';

export default function ImageButton({src, label, onClick, className}){
    return (
        <button type="button" className={"image-button components-button " + (className != null ? className : "") + " " + (label != null ? "label" : "")} onClick={onClick}>
            <img src={src}/>
            {label && <span>{label}</span>}
        </button>
    );
}