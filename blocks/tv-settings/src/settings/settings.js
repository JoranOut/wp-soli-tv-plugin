import { useContext } from '@wordpress/element';
import {SettingsContext} from "../providers/settings-provider";


export default function Settings(){
    const { saveDelay,
            delay } = useContext(SettingsContext);

    return (
        <div className="soli-tv-settings">
            <h2>Settings</h2>
            <input type="number"
                   value={delay}
                   onChange={(e) => saveDelay(e.target.value)}
                   placeholder="Delay in seconds"
                   className="delay-input"
            />
            <label htmlFor="delay-input">Delay between slides (in seconds)</label>
        </div>
    );
}