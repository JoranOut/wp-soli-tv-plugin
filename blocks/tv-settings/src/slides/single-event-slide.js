import './single-event-slide.scss';
import { useContext, useMemo } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { SlidesContext } from '../providers/slides-context';
import { imageUrl as slideImageUrl } from '../utils/slide-image';
import { splitTitle } from '../utils/split-title';
import logo from '../../assets/img/soli-logo-white.svg';
import { CalendarIcon, ClockIcon, PinIcon } from '../icons';
import {
	dayNumber,
	fullDate,
	monthLabel,
	timeRange,
	venue,
	venueFull,
} from '../utils/event-format';

/** How many dates the agenda panel lists beside the event on show. */
const AGENDA_LENGTH = 8;

export default function SingleEventSlide( { slide, isActive } ) {
	const { getEnabledEvents } = useContext( SlidesContext );

	const house = __( 'Muziekcentrum Soli', 'soli-tv' );
	const { lead, accent } = useMemo(
		() => splitTitle( slide.title ),
		[ slide.title ]
	);

	// The same list on every event slide: the next few dates, from the front.
	// It used to start at the event on show and run forward, which made the
	// panel change under the viewer on each slide and pushed the earliest dates
	// off it. The event on show is marked where it appears instead.
	const agenda = useMemo(
		() => ( getEnabledEvents() || [] ).slice( 0, AGENDA_LENGTH ),
		[ getEnabledEvents ]
	);

	return (
		<div
			className={ `soli-tv-block-single-slide ${ slide.slide_type } ${
				isActive ? 'is-active' : 'is-inactive'
			}` }
		>
			<div className="soli-tv-event__feature">
				<div className="soli-tv-slide__bg">
					<img
						className="soli-tv-slide__bg-img"
						src={ slideImageUrl( slide ) }
						alt=""
					/>
					<div className="soli-tv-slide__scrim" aria-hidden="true" />
				</div>

				<img
					className="soli-tv-event__logo"
					src={ logo }
					alt=""
					aria-hidden="true"
				/>

				<div className="soli-tv-slide__inner soli-tv-event__inner">
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

						<dl className="soli-tv-event__meta">
							<div className="soli-tv-event__meta-item">
								<dt>
									<CalendarIcon className="soli-tv-event__icon" />
									<span className="screen-reader-text">
										{ __( 'Datum', 'soli-tv' ) }
									</span>
								</dt>
								<dd>{ fullDate( slide.startDate ) }</dd>
							</div>

							<div className="soli-tv-event__meta-item">
								<dt>
									<ClockIcon className="soli-tv-event__icon" />
									<span className="screen-reader-text">
										{ __( 'Tijd', 'soli-tv' ) }
									</span>
								</dt>
								<dd>
									{ timeRange(
										slide.startDate,
										slide.endDate
									) }
								</dd>
							</div>

							{ venueFull( slide, house ) && (
								<div className="soli-tv-event__meta-item">
									<dt>
										<PinIcon className="soli-tv-event__icon" />
										<span className="screen-reader-text">
											{ __( 'Locatie', 'soli-tv' ) }
										</span>
									</dt>
									<dd>{ venueFull( slide, house ) }</dd>
								</div>
							) }
						</dl>
					</div>
				</div>
			</div>

			<aside className="soli-tv-agenda">
				<h2 className="soli-tv-agenda__heading">
					{ __( 'Evenementen', 'soli-tv' ) }
				</h2>

				<ul className="soli-tv-agenda__list">
					{ agenda.map( ( event ) => (
						<li
							className={ `soli-tv-agenda__item${
								event.id === slide.id
									? ' is-current'
									: ''
							}` }
							key={ event.id }
						>
							<div className="soli-tv-agenda__when">
								<span className="soli-tv-agenda__day">
									{ dayNumber( event.startDate ) }
								</span>
								<span className="soli-tv-agenda__month">
									{ monthLabel( event.startDate ) }
								</span>
							</div>

							<div className="soli-tv-agenda__what">
								<h3 className="soli-tv-agenda__title">
									{ event.title }
								</h3>
								{ /* One line, not two: eight rows have to fit the
								     panel, and a second line per row is what
								     pushed the last of them off the screen. */ }
								<p className="soli-tv-agenda__detail">
									{ [
										timeRange(
											event.startDate,
											event.endDate
										),
										venue( event, house ),
									]
										.filter( Boolean )
										.join( ' · ' ) }
								</p>
							</div>
						</li>
					) ) }
				</ul>
			</aside>
		</div>
	);
}
