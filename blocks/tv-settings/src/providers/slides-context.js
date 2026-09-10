import { createContext } from '@wordpress/element';

/**
 * The slides currently on the screen.
 *
 * Only the context lives here. It used to sit in `slides-provider.js`
 * alongside a provider that fetched from `soli_tv/v1` and read the block's
 * attributes, so importing the context pulled all of that in - which is how
 * the block-era providers survived every earlier step. `lib/kiosk.php` builds
 * the slides now, so the provider is gone and this is what remains.
 */
export const SlidesContext = createContext( {
	slides: [],
	enableSlide: () => {},
	getSlideByIndex: () => {},
	getEnabledEvents: () => [],
} );
