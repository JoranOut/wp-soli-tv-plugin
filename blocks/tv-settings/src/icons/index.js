/**
 * The three marks the event slide needs, inline.
 *
 * Inline rather than the SVG files in `assets/img`: these are 20px marks that
 * have to take the colour of the text beside them, and `currentColor` only
 * works when the SVG is part of the document. As files they were <img> tags
 * with their own fill baked in.
 */
const base = {
	fill: 'none',
	stroke: 'currentColor',
	strokeWidth: 1.8,
	strokeLinecap: 'round',
	strokeLinejoin: 'round',
	viewBox: '0 0 24 24',
	'aria-hidden': 'true',
	focusable: 'false',
};

export function CalendarIcon( { className } ) {
	return (
		<svg { ...base } className={ className }>
			<rect x="3" y="5" width="18" height="16" rx="2" />
			<path d="M16 3v4M8 3v4M3 11h18" />
		</svg>
	);
}

export function ClockIcon( { className } ) {
	return (
		<svg { ...base } className={ className }>
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v5l3.5 2" />
		</svg>
	);
}

export function PinIcon( { className } ) {
	return (
		<svg { ...base } className={ className }>
			<path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
			<circle cx="12" cy="10" r="2.5" />
		</svg>
	);
}
