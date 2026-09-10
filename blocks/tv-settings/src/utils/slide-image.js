import defaultBackground from '../../assets/img/default_background.jpg';

/**
 * The URL to show for a slide's image.
 *
 * Prefers `imgUrl`, the attachment's real file URL, which `lib/kiosk.php` puts
 * in the payload. The slides used to build `/?attachment_id=${slide.img}`
 * instead, and that is not an image: measured 2026-09-10 it answers `301` to a
 * `text/html` attachment page, so the browser had nothing to render and every
 * slide with a featured image showed a broken one.
 *
 * `slide.img` is still honoured as a fallback for the block's front end, which
 * has no `imgUrl` in its data and goes away with the block itself.
 *
 * @param {{imgUrl?: string, img?: number}} slide
 * @return {string} An image URL, never an empty one.
 */
export function imageUrl( slide ) {
	if ( slide?.imgUrl ) {
		return slide.imgUrl;
	}

	if ( slide?.img ) {
		return `/?attachment_id=${ slide.img }`;
	}

	return defaultBackground;
}
