# Fonts

Inter and Playfair Display, the two families the Soli design language uses
(`wp-soli-event-plugin`'s concert hero declares them, and
`wp-soli-gutenberg-theme` ships them for soli.nl).

These are copies of the theme's files, variable weights only. The screen at
`/tv/` renders no theme and calls no `wp_head()`, so nothing else would provide
them — and it must keep looking right when the association's internet is down,
which rules out fetching them from a CDN.

Both families are licensed under the SIL Open Font License 1.1:

- Inter — https://github.com/rsms/inter
- Playfair Display — https://github.com/clauseggers/Playfair-Display
