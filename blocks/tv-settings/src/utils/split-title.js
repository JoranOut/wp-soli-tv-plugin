/**
 * A title split for the two-tone display: leading words, then the last one.
 *
 * The rule is `wp-soli-event-plugin`'s concert hero, which renders the leading
 * words in cream and the last word italic in gold. A one-word title is all
 * accent, which is what the hero does too.
 */
export function splitTitle( title ) {
	const words = String( title || '' )
		.trim()
		.split( /\s+/ )
		.filter( Boolean );

	if ( ! words.length ) {
		return { lead: '', accent: '' };
	}

	const accent = words.pop();

	return { lead: words.join( ' ' ), accent };
}
