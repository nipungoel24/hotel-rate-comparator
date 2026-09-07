# Third-party assets

Vendored assets used by the application, with provenance.

| Asset            | File                              | Source                                                            | License shown by source                                                                                                                                                                         | Used in                                                   |
| ---------------- | --------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| React brand logo | `apps/web/public/icons/react.svg` | https://thesvg.org/icons/react/default.svg (retrieved 2026-09-07) | Trademark of Meta Platforms, Inc.; React itself is MIT licensed. theSVG legal page: brand icons are provided for identification under nominative fair use; trademarks remain with their owners. | Small "Built with React" footer in `apps/web/src/App.tsx` |

Review notes (Rules.md requires local review of every SVG):

- The React logo file contains only `<svg>`, `<g>` and `<path>` elements with the standard `xmlns`/`xmlns:xlink` namespace attributes.
- No `<script>`, `<foreignObject>`, `href`/`xlink:href` references, event handlers, external images, or `data:` URIs are present.
- It is served as a static asset referenced via an `<img>` tag; no runtime SVG injection occurs.

No other third-party image assets are used. The Morphicons package (`morphicons@1.7.1`, MIT) and icon
data (`lucide@1.42.0`, ISC) are code dependencies recorded in `package.json` and `package-lock.json`.
