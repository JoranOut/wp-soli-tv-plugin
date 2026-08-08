import { createContext, useState } from '@wordpress/element';

export const SettingsContext = createContext({
    onlyConcerts: true,
    saveOnlyConcerts: () => {},
    delay: [],
    saveDelay: () => {}
});

export default function SettingsProvider({ children, settings, saveSettings }) {
    const [onlyConcerts, setOnlyConcerts] = useState(settings?.onlyConcerts || true);
    const [delay, setDelay] = useState(settings?.delay || []);

    const saveOnlyConcerts = (value) => {
        setOnlyConcerts(value);
    };

    const saveDelay = (value) => {
        setDelay(value);
        saveSettings({...settings, delay: value})
    };

    return (
        <SettingsContext.Provider value={{
            onlyConcerts, saveOnlyConcerts,
            delay, saveDelay
        }}>
            {children}
        </SettingsContext.Provider>
    );
}