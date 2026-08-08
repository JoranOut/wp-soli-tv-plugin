import { useEffect } from "react";

export function ArrowKeyNavigator({ leftKeyPress, rightKeyPress, children, disabled = false }) {
    useEffect(() => {
        if (disabled) return;
        const onKey = (e) => {
            if (e.defaultPrevented) return;
            const tag = (e.target && e.target.tagName) || '';
            const isTyping = ['INPUT','TEXTAREA','SELECT'].includes(tag) || (e.target && e.target.isContentEditable);
            if (isTyping) return;
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                rightKeyPress && rightKeyPress(e);
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                leftKeyPress && leftKeyPress(e);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [leftKeyPress, rightKeyPress, disabled]);


    return children || null;
}