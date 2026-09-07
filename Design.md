# Design Specification

Status: approved original design; values below are intentional project choices, not extracted from an existing website. Implemented in Phase 5.

Phase 0 review (2026-09-06): preserve the original palette and compact single-page layout. Select shadcn's Radix variant. Morphicons 1.7.1 is the registry-verified candidate: import `MorphIcon` from `morphicons/react`, supply stroke icon data (for example from `lucide`, not a lucide-react component), and explicitly set `reducedMotion="user"`; the documented default is "never". Verify the installed types and rendering in Phase 5. Use the morph for asynchronous search-to-completion status without delaying results. Morphicons 1.7.1 and the theSVG React logo were installed/vendored in Phase 5 (provenance in docs/third-party-assets.md; legal basis reviewed on theSVG legal page: brand icons under nominative fair use, trademarks remain with owners). [Morphicons API entry](https://www.morphicons.com/llms.txt), [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite).

## Product character

A calm, compact hotel comparison tool. Users should understand what to enter, whether a search is running, and which valid offer won. The interface should feel like a focused travel utility rather than an admin dashboard or promotional landing page.

Use the descriptive product name “Hotel Rate Comparator.” One main page, no unnecessary navigation, no giant marketing hero. Suggested lead copy: “Find the best available hotel rate.” Supporting copy: “Compare two suppliers for your stay.” Keep a small “Demo prices” disclosure near results. Do not imply live inventory or the ability to book.

## Tokens

| Role            | Value   | Use                                          |
| --------------- | ------- | -------------------------------------------- |
| Page background | #FAFAF9 | Warm neutral canvas                          |
| Surface         | #FFFFFF | Form and result areas                        |
| Primary text    | #1C1917 | Headings and hotel names                     |
| Secondary text  | #57534E | Supporting labels                            |
| Border          | #D6D3D1 | Inputs and dividers                          |
| Accent/action   | #0F766E | Main button, focus outline, best-rate marker |
| Accent hover    | #115E59 | Hovered main action                          |
| Accent wash     | #F0FDFA | Small result highlight                       |
| Error text      | #B91C1C | Field and request errors                     |
| Warning text    | #92400E | Partial-comparison message                   |

Map these to CSS variables and shadcn semantic tokens once. Verify actual text, control and focus contrast in rendered combinations. Do not use decorative palette colours as status meaning without accompanying text.

## Typography and geometry

- Font stack: `ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. No external font loading needed.
- Page heading: 32 px desktop / 28 px mobile, weight 600, line height 1.15.
- Result hotel title: 20 px, weight 600, line height 1.3.
- Main price: 32 px, weight 600, tabular numerals; AUD and “total for N nights” nearby.
- Body and input text: 16 px, line height 1.5. Labels and support text: 14 px. Do not shrink important errors.
- Use a 4 px spacing scale; primary gaps 8, 12, 16, 24 and 32 px. Default corner radius 12 px for panels and 8 px for controls. Use border plus subtle shadow-sm sparingly.
- Content width up to 960 px, centred; 24 px desktop page padding and 16 px mobile. Form controls at least 44 px tall. Avoid horizontal scrolling at 320 px viewport width.
- Desktop form: city, check-in and check-out grouped in one row; clear search action. Mobile: stacked inputs with full-width action. Allow labels and errors to wrap naturally.

## Component inventory

Use shadcn Button, Input, Label/Field, Card, Alert, Badge and Skeleton as needed. Native date inputs are sufficient and accessible when labelled; do not add a complex custom date picker just for decoration. Keep Cancel available during loading. Search button width and result region should remain visually stable across state changes.

| State               | Content                                               | Action                                             |
| ------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| Idle                | Form and short guidance                               | Search hotels                                      |
| Invalid input       | Specific error below each offending field             | Correct field; focus first invalid input on submit |
| Searching           | “Comparing hotel rates…” and a structural placeholder | Cancel search                                      |
| Full success        | Hotel name, total AUD price, supplier, stay summary   | Edit search / search again                         |
| Partial success     | Same offer plus “One supplier could not be checked”   | Retry search                                       |
| Empty               | “No hotels found” and suggestion to change city/dates | Edit search                                        |
| Supplier failure    | “We couldn't retrieve hotel rates. Please try again.” | Try again                                          |
| Service unavailable | “Hotel search is temporarily unavailable.”            | Try again                                          |
| Cancelled           | “Search cancelled.” Preserve form values              | Search again                                       |

Do not show fabricated per-supplier progress percentages, invented savings, reviews, hotel photos or crossed-out prices. If diagnostics are added for reviewers, hide them behind a small development-only panel; ordinary users do not need task queues or workflow IDs.

## Icon integration

Use Morphicons for one small meaningful state change, such as the search/status icon changing to a completion check. Treat icon data versus React components according to the installed package's actual API. Keep an accessible text label throughout; decorative icons have aria-hidden. Reduced-motion users receive a static icon replacement. The icon must never delay form submission or result rendering. [Morphicons documentation entry](https://www.morphicons.com/llms.txt).

Use a single consistent outline icon family for ordinary controls. Source a relevant technology brand SVG from theSVG for README credits, subject to the asset's terms; preserve brand proportions and colours. Record source, author/licence where available, local path and use in docs/third-party-assets.md. SVGs are bundled locally and reviewed for scripts, external references and unsafe markup. Do not fetch and inject arbitrary SVG HTML at runtime. [theSVG](https://thesvg.org/), [asset policy](https://thesvg.org/legal).

## Motion and accessibility

Other than the requested icon morph, use only short functional feedback where helpful: 120–180 ms, explicit CSS properties, ease-out, mostly opacity/transform. No gradients, animated blur, parallax, autoplay, decorative loading delays, transition-all, or page-wide entrance choreography.

Every input has a persistent label. Associate helper/error text with aria-describedby; invalid controls use aria-invalid. Use role=status/aria-live politely for loading and completion, role=alert appropriately for submission errors, and visible keyboard focus. Never rely on colour alone. Cancel is a normal button, not an icon-only target. Preserve values on errors and cancellation. Keep screen-reader announcements concise and do not repeatedly announce every retry.

## Visual acceptance

Review at 320/375, 768 and 1440 px; keyboard-only flow; reduced motion; 200% zoom; long hotel names; large valid prices; all states in the table. Check focus after errors, submission, cancellation and retry. Capture representative desktop/mobile screenshots from the real app and report any browser tests that could not run.

Guidance applied: [baseline-ui](https://github.com/ibelick/ui-skills/blob/main/skills/baseline-ui/SKILL.md), [accessibility](https://github.com/ibelick/ui-skills/blob/main/skills/fixing-accessibility/SKILL.md), [motion performance](https://github.com/ibelick/ui-skills/blob/main/skills/fixing-motion-performance/SKILL.md), [Emil design engineering](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md), and [shadcn/ui](https://ui.shadcn.com/docs). Apply the conflict rules in Rules.md.
