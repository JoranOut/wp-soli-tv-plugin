import './kiosk.scss';
import { createRoot, useState, useEffect } from '@wordpress/element';
import SlideShow from './slides/slide-show';
import { SlidesContext } from './providers/slides-context';

/**
 * The screen at `/tv/`.
 *
 * Step 7 of PLAN-cpt-and-kiosk-route.md. The slides arrive printed into the
 * document by `lib/kiosk.php`, so the first paint waits on nothing. A poll
 * refreshes them, and a failed poll changes nothing on screen - the TV keeps
 * showing what it has, which matters for a display nobody is watching over.
 */

const REFRESH_MS = 5 * 60 * 1000;

function readPayload() {
	const node = document.getElementById( 'soli-tv-payload' );

	if ( ! node ) {
		return { slides: [], delayMs: 20000 };
	}

	try {
		return JSON.parse( node.textContent );
	} catch ( e ) {
		return { slides: [], delayMs: 20000 };
	}
}

function Kiosk( { initial } ) {
	const [ payload, setPayload ] = useState( initial );

	useEffect( () => {
		const timer = setInterval( () => {
			// Same URL as the page. The document carries the payload, so the
			// refresh re-reads the route rather than calling an endpoint - one
			// code path produces the slides, not two that can disagree.
			fetch( window.location.href, { cache: 'no-store' } )
				.then( ( response ) => response.text() )
				.then( ( html ) => {
					const parsed = new DOMParser().parseFromString(
						html,
						'text/html'
					);
					const node = parsed.getElementById( 'soli-tv-payload' );

					if ( node ) {
						setPayload( JSON.parse( node.textContent ) );
					}
				} )
				// Deliberately silent: a failed refresh leaves the current
				// slides in place, which is the right behaviour for a screen.
				.catch( () => {} );
		}, REFRESH_MS );

		return () => clearInterval( timer );
	}, [] );

	const slides = ( payload.slides || [] ).map( ( slide, index ) => ( {
		...slide,
		index,
		enabled: true,
	} ) );

	// The slide components read these off the context that used to be backed by
	// REST calls and block attributes. Supplying the same shape is what let them
	// stay untouched.
	const context = {
		slides,
		agendaUrl: payload.agendaUrl || '',
		enableSlide: () => {},
		getSlideByIndex: ( index ) =>
			slides.find( ( slide ) => slide.index === index ),
		getEnabledEvents: () =>
			slides.filter( ( slide ) => slide.slide_type === 'event' ),
	};

	if ( ! slides.length ) {
		return (
			<div className="soli-tv-kiosk__empty">
				<div className="soli-tv-kiosk__notes">♪ ♫ ♬</div>
			</div>
		);
	}

	return (
		<SlidesContext.Provider value={ context }>
			<SlideShow intervalMs={ payload.delayMs || 20000 } />
		</SlidesContext.Provider>
	);
}

const root = document.getElementById( 'soli-tv-kiosk' );

if ( root ) {
	createRoot( root ).render( <Kiosk initial={ readPayload() } /> );
}
