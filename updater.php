<?php
namespace Soli\Tv;

// Prevent loading this file directly and/or if the class is already defined
if ( ! defined( 'ABSPATH' ) || class_exists( 'WPGitHubUpdater' ) || class_exists( 'WP_GitHub_Updater' ) )
	return;

/**
 *
 *
 * @version 1.7
 * @author Joachim Kudish <info@jkudish.com>
 * @link http://jkudish.com
 * @package WP_GitHub_Updater
 * @license http://www.gnu.org/copyleft/gpl.html GNU Public License
 * @copyright Copyright (c) 2011-2013, Joachim Kudish
 *
 * GNU General Public License, Free Software Foundation
 * <http://creativecommons.org/licenses/GPL/2.0/>
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
 */
class WP_GitHub_Updater {

	/**
	 * GitHub Updater version
	 */
	const VERSION = 1.9;

	/**
	 * @var $config the config for the updater
	 * @access public
	 */
	var $config;

	/**
	 * @var $missing_config any config that is missing from the initialization of this instance
	 * @access public
	 */
	var $missing_config;

	/**
	 * @var $github_data temporiraly store the data fetched from GitHub, allows us to only load the data once per class instance
	 * @access private
	 */
	private $github_data;

	/**
	 * @var $releases_data temporarily store the releases fetched from GitHub, allows us to only load the data once per class instance
	 * @access private
	 */
	private $releases_data;

	/**
	 * @var $channel_release temporarily store the resolved release for the installed version's channel
	 * @access private
	 */
	private $channel_release;

	/**
	 * @var $remote_resolved whether the GitHub lookups have already run this request
	 * @access private
	 */
	private $remote_resolved = false;


	/**
	 * Class Constructor
	 *
	 * @since 1.0
	 * @param array $config the configuration required for the updater to work
	 * @see has_minimum_config()
	 * @return void
	 */
	public function __construct( $config = array() ) {

		$defaults = array(
			'slug' => plugin_basename( __FILE__ ),
			'proper_folder_name' => dirname( plugin_basename( __FILE__ ) ),
			'sslverify' => true,
			'access_token' => '',
		);

		$this->config = wp_parse_args( $config, $defaults );

		// if the minimum config isn't set, issue a warning and bail
		if ( ! $this->has_minimum_config() ) {
			$message = 'The GitHub Updater was initialized without the minimum required configuration, please check the config in your plugin. The following params are missing: ';
			$message .= implode( ',', $this->missing_config );
			_doing_it_wrong( __CLASS__, $message , self::VERSION );
			return;
		}

		$this->set_defaults();

		add_filter( 'pre_set_site_transient_update_plugins', array( $this, 'api_check' ) );

		// Hook into the plugin details screen. Run late: every sibling Soli
		// plugin still on updater 1.7 hooks this filter at 10 and returns a
		// literal false for any slug but its own, discarding whatever an
		// earlier filter built. WordPress then asks wordpress.org, which
		// answers "Plugin not found" and wp_die()s with a 500. At this
		// priority the legacy filters have all run before ours.
		add_filter( 'plugins_api', array( $this, 'get_plugin_info' ), 1000, 3 );
		add_action( 'in_plugin_update_message-' . $this->config['slug'], array( $this, 'update_message' ), 10, 2 );
		add_filter( 'upgrader_post_install', array( $this, 'upgrader_post_install' ), 10, 3 );

		// set timeout
		add_filter( 'http_request_timeout', array( $this, 'http_request_timeout' ) );

		// set sslverify for zip download
		add_filter( 'http_request_args', array( $this, 'http_request_sslverify' ), 10, 2 );
	}

	public function has_minimum_config() {

		$this->missing_config = array();

		$required_config_params = array(
			'api_url',
			'raw_url',
			'github_url',
			'zip_url',
			'requires',
			'tested',
			'readme',
		);

		foreach ( $required_config_params as $required_param ) {
			if ( empty( $this->config[$required_param] ) )
				$this->missing_config[] = $required_param;
		}

		return ( empty( $this->missing_config ) );
	}


	/**
	 * Check wether or not the transients need to be overruled and API needs to be called for every single page load
	 *
	 * @return bool overrule or not
	 */
	public function overrule_transients() {
		return ( defined( 'WP_GITHUB_FORCE_UPDATE' ) && WP_GITHUB_FORCE_UPDATE );
	}


	/**
	 * Set defaults
	 *
	 * @since 1.2
	 * @return void
	 */
	public function set_defaults() {
		if ( !empty( $this->config['access_token'] ) ) {

			// See Downloading a zipball (private repo) https://help.github.com/articles/downloading-files-from-the-command-line
			extract( parse_url( $this->config['zip_url'] ) ); // $scheme, $host, $path

			$zip_url = $scheme . '://api.github.com/repos' . $path;
			$zip_url = add_query_arg( array( 'access_token' => $this->config['access_token'] ), $zip_url );

			$this->config['zip_url'] = $zip_url;
		}

		// Local data only - nothing here may touch the network, see
		// resolve_remote(). Reading the installed version is what lets that
		// later lookup pick a channel, so it has to happen first.
		$plugin_data = $this->get_plugin_data();
		if ( ! isset( $this->config['plugin_name'] ) )
			$this->config['plugin_name'] = $plugin_data['Name'];

		if ( ! isset( $this->config['version'] ) )
			$this->config['version'] = $plugin_data['Version'];

		if ( ! isset( $this->config['author'] ) )
			$this->config['author'] = $plugin_data['Author'];

		// The details modal's "Plugin Homepage" link is the one place a user
		// can reach GitHub from, so send them to the release list.
		if ( ! isset( $this->config['homepage'] ) )
			$this->config['homepage'] = $this->get_releases_url();

		if ( ! isset( $this->config['readme'] ) )
			$this->config['readme'] = 'README.md';

	}


	/**
	 * Resolve everything that needs a call to GitHub
	 *
	 * Deliberately not called from the constructor. set_defaults() runs on
	 * `init` for every wp-admin request, so resolving there cost two API calls
	 * per admin page view - against GitHub's unauthenticated limit of 60 per
	 * hour, counted per source IP rather than per site or per plugin. That is
	 * roughly 30 page views an hour for a single plugin, and about 2.5 once a
	 * dozen plugins on the same host each do it, at which point every site on
	 * that IP starts reading stale data it cannot refresh.
	 *
	 * WordPress only needs any of this when it actually checks for updates -
	 * every 12 hours, or on an explicit force-check - so resolve on first use
	 * and memoise for the rest of the request.
	 *
	 * @since 1.7
	 * @return void
	 */
	public function resolve_remote() {
		if ( $this->remote_resolved )
			return;

		$this->remote_resolved = true;

		$release = $this->get_channel_release();

		if ( ! isset( $this->config['new_version'] ) )
			$this->config['new_version'] = ( false === $release ) ? false : $release['version'];

		// Point the download at the release's built zip asset rather than at a
		// branch archive, so the update installs what CI actually packaged.
		if ( false !== $release && ! empty( $release['package'] ) )
			$this->config['zip_url'] = $release['package'];

		if ( ! isset( $this->config['last_updated'] ) )
			$this->config['last_updated'] = $this->get_date();

		if ( ! isset( $this->config['description'] ) )
			$this->config['description'] = $this->get_description();
	}


	/**
	 * Callback fn for the http_request_timeout filter
	 *
	 * @since 1.0
	 * @return int timeout value
	 */
	public function http_request_timeout() {
		return 2;
	}

	/**
	 * Callback fn for the http_request_args filter
	 *
	 * @param unknown $args
	 * @param unknown $url
	 *
	 * @return mixed
	 */
	public function http_request_sslverify( $args, $url ) {
		// The download happens in a later request than the update check, so
		// config['zip_url'] may still hold the unresolved fallback by then -
		// match any URL on the repo instead. Never resolve from inside this
		// filter: it runs on every HTTP request, including our own, and would
		// recurse.
		if ( $this->config[ 'zip_url' ] == $url
			|| ( ! empty( $this->config['github_url'] ) && 0 === strpos( $url, $this->config['github_url'] ) ) )
			$args[ 'sslverify' ] = $this->config[ 'sslverify' ];

		return $args;
	}


	/**
	 * Whether a version string belongs to the nightly channel
	 *
	 * Nightly builds are versioned `{stable}-nightly.{YYYYMMDD}` by
	 * .github/workflows/nightly.yml, which stamps that version into the
	 * plugin header of the zip it ships. A site is therefore on the nightly
	 * channel exactly when its installed version carries that suffix.
	 *
	 * @since 1.7
	 * @param string $version the version to classify
	 * @return bool
	 */
	public function is_nightly_version( $version ) {
		return (bool) preg_match( '/-nightly\./i', (string) $version );
	}


	/**
	 * Get the repository's releases from the GitHub API
	 *
	 * @since 1.7
	 * @return array|false $releases the releases, or false when unavailable
	 */
	public function get_releases() {
		if ( isset( $this->releases_data ) && ! empty( $this->releases_data ) )
			return $this->releases_data;

		$transient_key = md5( $this->config['slug'] ) . '_releases';
		$cached = get_site_transient( $transient_key );

		if ( ! $this->overrule_transients() && ! empty( $cached ) ) {
			$this->releases_data = $cached;
			return $cached;
		}

		// GitHub pages at 30 by default. Nightlies are retained now, so a
		// first page could hold nothing but nightlies and hide every stable
		// release from a stable install.
		$response = $this->remote_get( add_query_arg( 'per_page', 100, trailingslashit( $this->config['api_url'] ) . 'releases' ) );

		// An API failure - a rate limit above all, since the unauthenticated
		// limit is 60/hour and WP_GITHUB_FORCE_UPDATE re-checks on every admin
		// page load - must not be reported as "no update available". Fall back
		// to the last known good list instead.
		if ( is_wp_error( $response ) || 200 != wp_remote_retrieve_response_code( $response ) )
			return empty( $cached ) ? false : $cached;

		$releases = json_decode( wp_remote_retrieve_body( $response ) );

		if ( ! is_array( $releases ) )
			return empty( $cached ) ? false : $cached;

		// refresh every 6 hours
		set_site_transient( $transient_key, $releases, 60*60*6 );

		$this->releases_data = $releases;

		return $releases;
	}


	/**
	 * Resolve the newest release within the installed version's channel
	 *
	 * A stable install only ever sees stable releases and a nightly install
	 * only ever sees nightlies, so a site cannot cross channels by accident.
	 * Without this filter a nightly install would be offered the stable build
	 * as an "update", because version_compare() sorts `2.0.3-nightly.20260809`
	 * below `2.0.3`.
	 *
	 * @since 1.7
	 * @return array|false $release with keys 'version' and 'package', or false
	 */
	public function get_channel_release() {
		if ( isset( $this->channel_release ) )
			return $this->channel_release;

		$releases = $this->get_releases();

		if ( empty( $releases ) )
			return false;

		$want_nightly = $this->is_nightly_version( $this->config['version'] );
		$best = false;

		foreach ( $releases as $release ) {

			if ( ! empty( $release->draft ) )
				continue;

			$version = ltrim( isset( $release->tag_name ) ? $release->tag_name : '', 'vV' );

			if ( '' === $version )
				continue;

			if ( $this->is_nightly_version( $version ) !== $want_nightly )
				continue;

			// Only a release carrying a built zip asset is installable; the
			// GitHub source zipball is an unbuilt tree and would ship a plugin
			// without its compiled block assets.
			$package = '';

			if ( ! empty( $release->assets ) ) {
				foreach ( $release->assets as $asset ) {
					if ( ! empty( $asset->name ) && '.zip' === strtolower( substr( $asset->name, -4 ) ) ) {
						$package = $asset->browser_download_url;
						break;
					}
				}
			}

			if ( '' === $package )
				continue;

			// GitHub returns releases newest-created first, but order by
			// version so a re-published older tag cannot win.
			if ( false === $best || 1 === version_compare( $version, $best['version'] ) )
				$best = array( 'version' => $version, 'package' => $package );
		}

		$this->channel_release = $best;

		return $best;
	}


	/**
	 * URL of the repository's release list on GitHub
	 *
	 * @since 1.8
	 * @return string
	 */
	public function get_releases_url() {
		return trailingslashit( $this->config['github_url'] ) . 'releases';
	}


	/**
	 * URL of one release's page on GitHub
	 *
	 * @since 1.8
	 * @param string $tag the release tag, e.g. `v2.0.3`
	 * @return string
	 */
	public function get_release_url( $tag ) {
		return $this->get_releases_url() . '/tag/' . rawurlencode( $tag );
	}


	/**
	 * Releases in the installed version's channel, newest version first
	 *
	 * Drafts are dropped. Releases without a zip asset are kept here, unlike
	 * in get_channel_release(): they are not installable, but they did happen
	 * and belong in a changelog.
	 *
	 * @since 1.8
	 * @return array of release objects as returned by the GitHub API
	 */
	public function get_channel_releases() {
		$releases = $this->get_releases();

		if ( empty( $releases ) )
			return array();

		$want_nightly = $this->is_nightly_version( $this->config['version'] );
		$channel = array();

		foreach ( $releases as $release ) {
			if ( ! empty( $release->draft ) || empty( $release->tag_name ) )
				continue;

			if ( $this->is_nightly_version( $release->tag_name ) !== $want_nightly )
				continue;

			$channel[] = $release;
		}

		usort( $channel, function ( $a, $b ) {
			return version_compare( ltrim( $b->tag_name, 'vV' ), ltrim( $a->tag_name, 'vV' ) );
		} );

		return $channel;
	}


	/**
	 * Convert a GitHub release body (Markdown) to safe HTML
	 *
	 * Only the shapes the release and nightly workflows produce are handled:
	 * headings, bullet lists, bold, bare URLs, and paragraphs. Anything else
	 * comes through as escaped text, which is still readable.
	 *
	 * @since 1.8
	 * @param string $markdown
	 * @return string HTML
	 */
	public function markdown_to_html( $markdown ) {
		$html = '';
		$in_list = false;
		$lines = preg_split( '/\r\n|\r|\n/', (string) $markdown );

		foreach ( $lines as $line ) {
			$trimmed = trim( $line );

			if ( preg_match( '/^[-*]\s+(.*)$/', $trimmed, $m ) ) {
				if ( ! $in_list ) {
					$html .= '<ul>';
					$in_list = true;
				}
				$html .= '<li>' . $this->inline_markdown( $m[1] ) . '</li>';
				continue;
			}

			if ( $in_list ) {
				$html .= '</ul>';
				$in_list = false;
			}

			if ( '' === $trimmed || '---' === $trimmed )
				continue;

			if ( preg_match( '/^(#{1,6})\s+(.*)$/', $trimmed, $m ) ) {
				// Release bodies start at h2; push everything one level down
				// so nothing outranks the section heading in the modal.
				$level = min( 6, strlen( $m[1] ) + 2 );
				$html .= "<h{$level}>" . $this->inline_markdown( $m[2] ) . "</h{$level}>";
				continue;
			}

			$html .= '<p>' . $this->inline_markdown( $trimmed ) . '</p>';
		}

		if ( $in_list )
			$html .= '</ul>';

		return $html;
	}


	/**
	 * Escape a line of Markdown and render bold, inline code and links
	 *
	 * @since 1.8
	 * @param string $text
	 * @return string HTML
	 */
	private function inline_markdown( $text ) {
		$text = esc_html( $text );
		$text = preg_replace( '/\*\*(.+?)\*\*/', '<strong>$1</strong>', $text );
		$text = preg_replace( '/`([^`]+)`/', '<code>$1</code>', $text );
		// Markdown links first, then bare URLs that are not already inside a tag.
		$text = preg_replace( '/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/', '<a href="$2">$1</a>', $text );
		$text = preg_replace( '/(?<!["\'>])(https?:\/\/[^\s<]+)/', '<a href="$1">$1</a>', $text );
		return $text;
	}


	/**
	 * Build the changelog tab for the plugin details modal
	 *
	 * Lists every release in the installed channel, each linked to its page
	 * on GitHub, with the release notes the workflow generated from commits.
	 * The installed version is marked so the reader can see how far behind
	 * the site is.
	 *
	 * @since 1.8
	 * @return string HTML
	 */
	public function get_changelog_html() {
		$releases = $this->get_channel_releases();
		$nightly = $this->is_nightly_version( $this->config['version'] );

		// No stylesheet: core runs these sections through wp_kses with a tag
		// list that has no `style` element and no `style` attribute, so a rule
		// set would be stripped and its text printed into the page. Readability
		// here comes from the markup alone - a heading per release, the commit
		// list under it, and nothing else.
		$html = '<div class="soli-changelog">';
		$html .= '<p>'
			. ( $nightly
				? esc_html__( 'Nightly builds, newest first.', 'github_plugin_updater' )
				: esc_html__( 'Releases, newest first.', 'github_plugin_updater' ) )
			. ' <a href="' . esc_url( $this->get_releases_url() ) . '" target="_blank" rel="noopener">'
			. esc_html__( 'View all on GitHub', 'github_plugin_updater' ) . '</a></p>';

		if ( empty( $releases ) )
			return $html . '<p>' . esc_html__( 'No releases found in this channel.', 'github_plugin_updater' ) . '</p></div>';

		foreach ( $releases as $release ) {
			$version = ltrim( $release->tag_name, 'vV' );
			$date = ! empty( $release->published_at ) ? date_i18n( get_option( 'date_format' ), strtotime( $release->published_at ) ) : '';
			$installed = ( 0 === version_compare( $version, $this->config['version'] ) );

			$html .= '<h4><a href="' . esc_url( $this->get_release_url( $release->tag_name ) ) . '" target="_blank" rel="noopener">'
				. esc_html( $version ) . '</a>';
			$note = esc_html( $date );

			if ( $installed )
				$note = ( '' === $note )
					? esc_html__( 'installed', 'github_plugin_updater' )
					: $note . ' &mdash; ' . esc_html__( 'installed', 'github_plugin_updater' );

			if ( '' !== $note )
				$html .= ' <em>' . $note . '</em>';

			$html .= '</h4>';

			$body = $this->strip_release_boilerplate( isset( $release->body ) ? $release->body : '' );

			$html .= ( '' === $body )
				? '<p class="soli-changelog-meta">' . esc_html__( 'No notes.', 'github_plugin_updater' ) . '</p>'
				: wp_kses_post( $this->markdown_to_html( $body ) );
		}

		return $html . '</div>';
	}


	/**
	 * Drop the repeated scaffolding from a release body
	 *
	 * The release and nightly workflows wrap the commit list in metadata that
	 * is already on screen - version, build number, source commit, a fixed
	 * disclaimer, a "Changes" heading above the only content there is, and a
	 * compare URL the version heading already links to. Repeated once per
	 * release it buries the three lines that actually differ, so it is
	 * dropped here rather than in the workflows alone: releases published
	 * before this change are retained for weeks and carry the old body.
	 *
	 * Everything after a horizontal rule goes too, which is where both
	 * workflows put their trailing metadata.
	 *
	 * @since 1.9
	 * @param string $markdown the release body
	 * @return string the remaining Markdown, trimmed
	 */
	public function strip_release_boilerplate( $markdown ) {
		$markdown = (string) $markdown;

		// Everything below the first horizontal rule is trailing metadata.
		$parts = preg_split( '/^\s*-{3,}\s*$/m', $markdown, 2 );
		$markdown = $parts[0];

		$drop = array(
			'/^automated nightly build from main branch\.?$/i',
			'/^this is a pre-release build for testing purposes\.?$/i',
			'/^\*\*(version|build|built from|full changelog):\*\*/i',
			'/^(version|build|built from|full changelog):/i',
			'/^#{1,6}\s*changes\s*$/i',
			'/^the build number is the commit count/i',
			'/^when commits land/i',
		);

		$kept = array();

		foreach ( preg_split( '/\r\n|\r|\n/', $markdown ) as $line ) {
			$trimmed = trim( $line );
			$skip = false;

			foreach ( $drop as $pattern ) {
				if ( preg_match( $pattern, $trimmed ) ) {
					$skip = true;
					break;
				}
			}

			if ( ! $skip )
				$kept[] = $line;
		}

		return trim( implode( "\n", $kept ) );
	}


	/**
	 * Append GitHub links to the update notice in the plugins list
	 *
	 * WordPress hard-codes "View version details" to its own modal, so this
	 * is the only way to put a direct link to the release on the row itself.
	 *
	 * @since 1.8
	 * @param array  $plugin_data
	 * @param object $response the update object from the transient
	 * @return void
	 */
	public function update_message( $plugin_data, $response ) {
		$new_version = ! empty( $response->new_version ) ? $response->new_version : '';

		echo ' &middot; ';
		if ( '' !== $new_version ) {
			echo '<a href="' . esc_url( $this->get_release_url( 'v' . $new_version ) ) . '" target="_blank" rel="noopener">'
				. esc_html__( 'Release notes on GitHub', 'github_plugin_updater' ) . '</a> &middot; ';
		}
		echo '<a href="' . esc_url( $this->get_releases_url() ) . '" target="_blank" rel="noopener">'
			. esc_html__( 'All releases', 'github_plugin_updater' ) . '</a>';
	}


	/**
	 * Get New Version from GitHub
	 *
	 * @since 1.0
	 * @return string|false $version the version number
	 */
	public function get_new_version() {
		$release = $this->get_channel_release();

		return ( false === $release ) ? false : $release['version'];
	}


	/**
	 * Interact with GitHub
	 *
	 * @param string $query
	 *
	 * @since 1.6
	 * @return mixed
	 */
	public function remote_get( $query ) {
		if ( ! empty( $this->config['access_token'] ) )
			$query = add_query_arg( array( 'access_token' => $this->config['access_token'] ), $query );

		$raw_response = wp_remote_get( $query, array(
			'sslverify' => $this->config['sslverify']
		) );

		return $raw_response;
	}


	/**
	 * Get GitHub Data from the specified repository
	 *
	 * @since 1.0
	 * @return array $github_data the data
	 */
	public function get_github_data() {
		if ( isset( $this->github_data ) && ! empty( $this->github_data ) ) {
			$github_data = $this->github_data;
		} else {
			$github_data = get_site_transient( md5($this->config['slug']).'_github_data' );

			if ( $this->overrule_transients() || ( ! isset( $github_data ) || ! $github_data || '' == $github_data ) ) {
				$github_data = $this->remote_get( $this->config['api_url'] );

				if ( is_wp_error( $github_data ) )
					return false;

				$github_data = json_decode( $github_data['body'] );

				// refresh every 6 hours
				set_site_transient( md5($this->config['slug']).'_github_data', $github_data, 60*60*6 );
			}

			// Store the data in this class instance for future calls
			$this->github_data = $github_data;
		}

		return $github_data;
	}


	/**
	 * Get update date
	 *
	 * @since 1.0
	 * @return string $date the date
	 */
	public function get_date() {
		$_date = $this->get_github_data();
		return ( !empty( $_date->updated_at ) ) ? date( 'Y-m-d', strtotime( $_date->updated_at ) ) : false;
	}


	/**
	 * Get plugin description
	 *
	 * @since 1.0
	 * @return string $description the description
	 */
	public function get_description() {
		$_description = $this->get_github_data();
		return ( !empty( $_description->description ) ) ? $_description->description : false;
	}


	/**
	 * Get Plugin data
	 *
	 * @since 1.0
	 * @return object $data the data
	 */
	public function get_plugin_data() {
		include_once ABSPATH.'/wp-admin/includes/plugin.php';
		$data = get_plugin_data( WP_PLUGIN_DIR.'/'.$this->config['slug'] );
		return $data;
	}


	/**
	 * Hook into the plugin update check and connect to GitHub
	 *
	 * @since 1.0
	 * @param object  $transient the plugin data transient
	 * @return object $transient updated plugin data transient
	 */
	public function api_check( $transient ) {

		// Check if the transient contains the 'checked' information
		// If not, just return its value without hacking it
		if ( empty( $transient->checked ) )
			return $transient;

		// Resolve here rather than in the constructor: this runs only when
		// WordPress genuinely checks for updates, not on every admin request.
		$this->resolve_remote();

		// check the version and decide if it's new
		$update = version_compare( $this->config['new_version'], $this->config['version'] );

		if ( 1 === $update ) {
			$response = new \stdClass;
			$response->new_version = $this->config['new_version'];
			$response->slug = $this->config['proper_folder_name'];
			$response->url = add_query_arg( array( 'access_token' => $this->config['access_token'] ), $this->config['github_url'] );
			$response->package = $this->config['zip_url'];

			// If response is false, don't alter the transient
			if ( false !== $response )
				$transient->response[ $this->config['slug'] ] = $response;
		}

		return $transient;
	}


	/**
	 * Get Plugin info
	 *
	 * @since 1.0
	 * @param bool    $false  always false
	 * @param string  $action the API function being performed
	 * @param object  $args   plugin arguments
	 * @return object $response the plugin info
	 */
	public function get_plugin_info( $false, $action, $response ) {

		// Check if this call API is for the right plugin. WordPress builds the
		// "View version details" link from the update transient's slug, which
		// api_check() sets to the folder name, so accept that as well as the
		// plugin_basename form. Only the folder name ever arrives from core.
		if ( ! isset( $response->slug ) )
			return $false;

		if ( $response->slug !== $this->config['slug'] && $response->slug !== $this->config['proper_folder_name'] )
			return $false;

		// Only reached on this plugin's details screen, so the lookup is worth
		// making here; every other plugins_api call costs nothing.
		$this->resolve_remote();

		// The folder name is what core compares against installed plugins
		// (install_plugin_install_status), so the modal offers "Update Now".
		$response->slug = $this->config['proper_folder_name'];
		// Core's details screen reads ->name (a notice without it) and uses
		// it to recognise the installed copy, which turns "Install Now" into
		// "Update Now". plugin_name is kept for anything already reading it.
		$response->name = $this->config['plugin_name'];
		$response->plugin_name  = $this->config['plugin_name'];
		$response->version = $this->config['new_version'];
		$response->author = $this->config['author'];
		$response->homepage = $this->config['homepage'];
		$response->requires = $this->config['requires'];
		$response->tested = $this->config['tested'];
		$response->downloaded   = 0;
		$response->last_updated = $this->config['last_updated'];
		$response->sections = array(
			'description' => $this->config['description'],
			'changelog'   => $this->get_changelog_html(),
		);
		$response->download_link = $this->config['zip_url'];

		return $response;
	}


	/**
	 * Upgrader/Updater
	 * Move & activate the plugin, echo the update message
	 *
	 * @since 1.0
	 * @param boolean $true       always true
	 * @param mixed   $hook_extra not used
	 * @param array   $result     the result of the move
	 * @return array $result the result of the move
	 */
	public function upgrader_post_install( $true, $hook_extra, $result ) {

		global $wp_filesystem;

		// Move & Activate
		$proper_destination = WP_PLUGIN_DIR.'/'.$this->config['proper_folder_name'];
		$wp_filesystem->move( $result['destination'], $proper_destination );
		$result['destination'] = $proper_destination;
		$activate = activate_plugin( WP_PLUGIN_DIR.'/'.$this->config['slug'] );

		// Output the update message
		$fail  = __( 'The plugin has been updated, but could not be reactivated. Please reactivate it manually.', 'github_plugin_updater' );
		$success = __( 'Plugin reactivated successfully.', 'github_plugin_updater' );
		echo is_wp_error( $activate ) ? $fail : $success;
		return $result;

	}
}
