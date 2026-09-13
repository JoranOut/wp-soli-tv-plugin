import './single-tv-slide.scss';
import { useMemo } from '@wordpress/element';
import { RawHTML } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { imageUrl as slideImageUrl } from '../utils/slide-image';
import { splitTitle } from '../utils/split-title';

/**
 * A message slide.
 *
 * The photo runs full bleed behind everything and a scrim carries the text,
 * rather than the image and the text each owning half the slide. Same
 * treatment as `wp-soli-event-plugin`'s concert hero, down to the two-tone
 * title, so the screen in the hall and the website look like one association.
 *
 * `img_only` and `text_only` are the same layout with one half left out: no
 * text over the photo, or no photo behind the text.
 */
export default function SingleTVSlide( { slide, isActive } ) {
	const showImage = slide.type === 'img_only' || slide.type === 'img_text';
	const showContent = slide.type === 'text_only' || slide.type === 'img_text';

	const { lead, accent } = useMemo(
		() => splitTitle( slide.title ),
		[ slide.title ]
	);

	const qrSrc = useMemo(
		() =>
			slide.link
				? `https://quickchart.io/qr?text=${ encodeURIComponent(
						slide.link
				  ) }`
				: null,
		[ slide.link ]
	);

	return (
		<div
			className={ `soli-tv-block-single-slide ${ slide.slide_type } ${
				slide.type
			} ${ isActive ? 'is-active' : 'is-inactive' }` }
		>
			{ showImage && (
				<div className="soli-tv-slide__bg">
					<img
						className="soli-tv-slide__bg-img"
						src={ slideImageUrl( slide ) }
						style={ {
							objectFit:
								slide.fit === 'contain' ? 'contain' : 'cover',
						} }
						alt=""
					/>
					{ showContent && (
						<div
							className="soli-tv-slide__scrim"
							aria-hidden="true"
						/>
					) }
				</div>
			) }

			{ showContent && (
				<div className="soli-tv-slide__inner">
					<div className="soli-tv-slide__content">
						<h1 className="soli-tv-slide__title">
							{ lead && (
								<span className="soli-tv-slide__title-lead">
									{ lead }{ ' ' }
								</span>
							) }
							<span className="soli-tv-slide__title-accent">
								{ accent }
							</span>
						</h1>
						<span
							className="soli-tv-slide__rule"
							aria-hidden="true"
						/>
						{ slide.content && (
							<div className="soli-tv-slide__lead">
								<RawHTML>{ slide.content }</RawHTML>
							</div>
						) }
					</div>
				</div>
			) }

			{ slide.link && (
				<div className="qr-wrapper">
					<p>{ __( 'Scan de QR!', 'soli-tv' ) }</p>
					<img
						src={ qrSrc }
						alt={ __( 'QR code', 'soli-tv' ) }
						style={ { width: 160, height: 160 } }
						loading="lazy"
					/>
				</div>
			) }
		</div>
	);
}
