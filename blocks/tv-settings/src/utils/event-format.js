import { displayRooms } from './values';

/**
 * Date and time formatting for the screen, built once at module scope.
 *
 * Constructing an `Intl.DateTimeFormat` is the expensive part and formatting is
 * cheap, so these are shared rather than made per render.
 *
 * The locale is Dutch on purpose and does not follow the viewer: this screen
 * hangs in Driehuis and has one audience. The admin screens are the opposite
 * case and format in the admin's own locale.
 */
const DAY = new Intl.DateTimeFormat( 'nl-NL', { day: '2-digit' } );
const MONTH = new Intl.DateTimeFormat( 'nl-NL', { month: 'short' } );
const FULL_DATE = new Intl.DateTimeFormat( 'nl-NL', {
	weekday: 'long',
	day: 'numeric',
	month: 'long',
	year: 'numeric',
} );
const TIME = new Intl.DateTimeFormat( 'nl-NL', {
	hour: '2-digit',
	minute: '2-digit',
	hour12: false,
} );

export function toDate( value ) {
	if ( ! value ) {
		return null;
	}

	const date = value instanceof Date ? value : new Date( String( value ).replace( ' ', 'T' ) );

	return isNaN( date.getTime() ) ? null : date;
}

export function dayNumber( value ) {
	const date = toDate( value );

	return date ? DAY.format( date ) : '';
}

/** `sep`, without the trailing dot Dutch short months carry. */
export function monthLabel( value ) {
	const date = toDate( value );

	return date ? MONTH.format( date ).replace( '.', '' ) : '';
}

export function fullDate( value ) {
	const date = toDate( value );

	return date ? FULL_DATE.format( date ) : '';
}

export function time( value ) {
	const date = toDate( value );

	return date ? TIME.format( date ) : '';
}

/** `10:00 – 13:00`, or just the start when there is no end. */
export function timeRange( start, end ) {
	const from = time( start );
	const to = time( end );

	if ( ! from ) {
		return '';
	}

	return to && to !== from ? `${ from } – ${ to }` : from;
}

/**
 * Where an event happens.
 *
 * The location name is the event plugin's own; a date with no location but with
 * rooms is in the association's building, and the rooms themselves are detail
 * nobody reads from across a hall.
 */
export function venue( event, houseName ) {
	if ( event?.location ) {
		return event.location;
	}

	if ( event?.rooms && displayRooms( event.rooms ) ) {
		return houseName;
	}

	return '';
}

/**
 * The same place, spelled out.
 *
 * The event slide has room for the address and the rooms as well, and someone
 * standing in the hall reading about a concert elsewhere needs them. The agenda
 * panel beside it keeps the short form, where eight rows share the space.
 */
export function venueFull( event, houseName ) {
	const parts = [ venue( event, houseName ) ];

	if ( event?.location && event?.locationAddress ) {
		parts.push( event.locationAddress );
	}

	const rooms = displayRooms( event?.rooms );

	if ( rooms ) {
		parts.push( rooms );
	}

	return parts.filter( Boolean ).join( ', ' );
}
