# Google Slides DOM Assumptions

Every place our code assumes something about real Google Slides' DOM
structure that we can't verify automatically — Google's login flow blocks
automated sign-in, so there's no way to run this against real Slides in
CI or e2e (see
`docs/specs/2026-08-06-extension-playwright-e2e-testing-design.md`).

Instead, these get verified by hand: a human runs
`docs/manual_tests/capture_real_google_slides_dom.js` against a real,
logged-in Slides presentation (see `docs/manual_tests.md`'s "Verifying
fixture assumptions against real Google Slides" section) and compares the
output against this table.

**If you touch any of the code cited below, re-run that procedure before
merging, and update this table's "Last verified" column with the new
capture file.**

| # | Assumption | Encoded in | What breaks if wrong | Last verified |
|---|---|---|---|---|
| 1 | The slide-number element is `.punch-viewer-svgpage-a11yelement[aria-label*="Slide"]`, with an `aria-label` matching `/^Slide (\d+)/`, present in the top document or a same-origin iframe. | `adapters/google_slides.js:18-37` (`getSlide`) | Slide tracking silently returns `0` (the "unknown slide" sentinel) — reactions route to slide 0 server-side instead of the real current slide. | Not yet verified |
| 2 | The live slideshow renders inside `iframe.punch-present-iframe`. | `content/content.js:59-61` (`getPresentIframe`) | The overlay falls back to viewport-relative sizing instead of anchoring to the slide. | Not yet verified |
| 3 | The a11y element's `getBoundingClientRect()` within the iframe's own document represents the visible slide's bounds; offsetting by the iframe's own top-document rect gives correct top-document coordinates. | `content/content.js:71-91` (`getSlideRect`) | Overlay/emoji render off-slide in windowed present mode — the exact bug `tests/e2e/overlay-windowed-position.spec.js` exists to catch. | Not yet verified |
| 4 | *(open, unconfirmed)* Whether real Google Slides fullscreens the bare `iframe.punch-present-iframe`, or a wrapping element. | `content/content.js:158-166` (`fullscreenchange` listener) | If the bare iframe: the overlay is appended into a node that never renders light-DOM children, and silently fails to render in fullscreen present mode. | Not yet verified |

## Capture history

Each verification run should append a row here, oldest first, so drift
over time is visible without digging through git blame.

| Date | Capture files | Result |
|---|---|---|
| _(none yet)_ | | |
