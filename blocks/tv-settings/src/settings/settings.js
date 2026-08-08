import { useContext } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import {SettingsContext} from "../providers/settings-provider";


export default function Settings(){
    const { saveDelay,
            delay } = useContext(SettingsContext);

    return (
        <div className="soli-tv-settings">
            <h2>{__('Settings', 'soli-tv')}</h2>
            <input type="number"
                   value={delay}
                   onChange={(e) => saveDelay(e.target.value)}
                   placeholder={__('Delay in seconds', 'soli-tv')}
                   className="delay-input"
            />
            <label htmlFor="delay-input">{__('Delay between slides (in seconds)', 'soli-tv')}</label>
        </div>
    );
}