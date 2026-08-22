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
| 1 | The slide-number element is `.punch-viewer-svgpage-a11yelement[aria-label*="Slide"]`, with an `aria-label` matching `/^Slide (\d+)/`, present in the top document or a same-origin iframe. | `adapters/google_slides.js:23-42` (`getSlide`) | Slide tracking silently returns `0` (the "unknown slide" sentinel) — reactions route to slide 0 server-side instead of the real current slide. | 2026-08-14 |
| 2 | The live slideshow renders inside `iframe.punch-present-iframe`. | `content/content.js:59-61` (`getPresentIframe`) | The overlay falls back to viewport-relative sizing instead of anchoring to the slide. | 2026-08-14 — confirmed true for both reliably-reproducible present modes (fullscreen, windowed); one anomalous capture with no iframe was observed once and is not currently reproducible — see "2026-08-14 findings" |
| 3 | The a11y element's `getBoundingClientRect()` within the iframe's own document represents the visible slide's bounds; offsetting by the iframe's own top-document rect gives correct top-document coordinates. | `content/content.js:71-91` (`getSlideRect`) | Overlay/emoji render off-slide in windowed present mode — the exact bug `tests/e2e/overlay-windowed-position.spec.js` exists to catch. | 2026-08-14 — sub-rect math confirmed on both axes (see findings); offset-addition step (non-zero iframe origin) still untested by any capture |
| 4 | Whether real Google Slides fullscreens the bare `iframe.punch-present-iframe`, or a wrapping element. Confirmed: a wrapping element (`div.punch-full-screen-element.punch-full-window-overlay`), at least for the in-editor overlay present flow — see findings. | `content/content.js:166-174` (`fullscreenchange` listener) | If the bare iframe: the overlay is appended into a node that never renders light-DOM children, and silently fails to render in fullscreen present mode. | 2026-08-14 |

## Capture history

Each verification run should append a row here, oldest first, so drift
over time is visible without digging through git blame.

| Date | Capture files | Result |
|---|---|---|
| 2026-08-14 | `docs/manual_tests/captures/2026-08-14-windowed.json`, `2026-08-14-fullscreen.json` | #1 confirmed. #2 contradicted for the dedicated `/present`-tab flow (no `punch-present-iframe` found at all). #3 confirmed for the flow where the iframe exists (letterbox sub-rect observed), not stress-tested for the offset arithmetic specifically. #4 confirmed for the flow where the iframe exists. See findings below — the two captures turned out to be from two structurally different Slides present-mode flows, not the same flow in two states. |
| 2026-08-14 | `docs/manual_tests/captures/2026-08-14-windowed-2.json`, `2026-08-14-fullscreen-2.json` | Both from the in-editor overlay flow (same flow as the first `fullscreen.json`, not the `/present`-tab flow) — one non-fullscreen at a narrow/tall viewport, one fullscreen at a wide viewport. #3 confirmed much more robustly: the slide sub-rect holds a clean 16:9 ratio on both axes (top/bottom bars in the narrow window, left/right bars in the wide one). Does not address #2's open question — see findings. |
| 2026-08-15 | `docs/manual_tests/captures/2026-08-14-windowedalt-1.json` | A previously-unvisited path ("Slideshow" menu, non-fullscreen) — same structural pattern as `windowed-2` (iframe present, letterboxed within it at ~16:9). Prompted a deliberate hunt for all reliably-reproducible present modes — see findings. |
| 2026-08-15 | `docs/manual_tests/captures/2026-08-14-windowed-a.json`, `2026-08-14-windowed-b.json` | Two different menu paths ("uncheck fullscreen → Start slideshow" and "Presenter view") confirmed to converge on the exact same URL and DOM structure — same iframe-based pattern as `windowed-2`/`windowedalt-1`. Resolves the "3 modes" question from `windowedalt-1`: there are only 2 reliably-reproducible modes (fullscreen, windowed), both iframe-based. See findings. |

## 2026-08-14 findings

The two captures' URLs revealed they came from different real Slides
flows, not "the same present session, windowed vs. fullscreen" as the
procedure assumed:

- **`2026-08-14-windowed.json`** — the dedicated `/present` tab
  (`.../present?token=...`). The a11y element was found directly in the
  **top document** (`hostIframeClassName: null`), with the correct live
  slide number. `iframe.punch-present-iframe` was **not found anywhere on
  the page** — assumption #2 is directly contradicted for this flow.
- **`2026-08-14-fullscreen.json`** — the in-editor overlay present flow
  (still on the `/edit` URL). Here `iframe.punch-present-iframe` exists as
  expected, containing the a11y element, and fullscreening it fullscreens
  a wrapping `div.punch-full-screen-element.punch-full-window-overlay` —
  confirming #4, and confirming #2/#3 for *this specific flow*. The
  captured geometry (`slideRectWithinIframe` 1512×851, inset ~49px
  top/bottom from the iframe's own 1512×949 rect) is genuine letterboxing,
  confirming #3's core mechanism — though the iframe's own rect happened
  to sit at `(0,0)` in this capture, so the offset-addition step of
  `getSlideRect` specifically wasn't stress-tested.

**Open question:** for the `/present`-tab flow (no iframe at all), does
the a11y element's rect fill the browser viewport exactly, or is it
letterboxed by some non-iframe means within the top document? If the
former, `content.js`'s existing no-iframe fallback (size off
`window.innerWidth`/`innerHeight`) is already correct for that flow by
coincidence. If the latter, that fallback has the same off-slide bug the
iframe-based code already guards against, just via a different code path
— a real, currently-shipping issue, since the `/present`-tab flow is
likely the primary way most users invoke "Present."

The capture script was extended on 2026-08-14 to record `a11yElement.rect`
(now populated regardless of whether an iframe was found) and a top-level
`viewport` field specifically to answer this on the next capture — compare
`a11yElement.rect` against `viewport` when `hostIframeClassName` is `null`.
Not yet re-run against the `/present`-tab flow with the updated script.

### Follow-up: `2026-08-14-windowed-2.json` / `2026-08-14-fullscreen-2.json`

Both new captures are from the same `/edit?slide=...` URL as the first
`2026-08-14-fullscreen.json` — the in-editor overlay present flow — not
the dedicated `/present`-tab flow that raised the open question above.
They don't resolve it, but they do strengthen #3 considerably:

- `windowed-2` (671×944 viewport, not fullscreen): `slideRectWithinIframe`
  671×377 (top/bottom bars) — aspect ratio 1.780.
- `fullscreen-2` (2560×1080 viewport, fullscreen): `slideRectWithinIframe`
  1920×1080 (left/right bars) — aspect ratio 1.778.

Both land on the same ~16:9 ratio despite letterboxing on opposite axes at
very different container shapes — strong confirmation that the a11y
element's rect is genuinely tracking the visible slide, not some unrelated
DOM artifact. Both captures' iframe rects again sit at `(0,0)`, so the
offset-addition step remains unexercised by any capture so far.

The `/present`-tab open question (assumption #2) is still open: still need
a non-fullscreen capture with the updated script from a URL shaped like
`.../present?token=...` (matching the original `2026-08-14-windowed.json`),
to compare `a11yElement.rect` against `viewport` there.

### Consolidated conclusion (2026-08-15)

A deliberate search for every reliably-reproducible present-mode entry
point turned up exactly **two**, both already covered by the code:

1. **Fullscreen** — click "Present" directly. Iframe present, fullscreens
   a wrapping `div.punch-full-screen-element.punch-full-window-overlay`
   (assumption #4, confirmed twice: `fullscreen.json`, `fullscreen-2.json`).
2. **Windowed** — reachable via at least two menu paths ("Slideshow" →
   "presentation display options" → uncheck fullscreen → "Start
   slideshow", *and* "Slideshow" → "Presenter view") that were confirmed
   to converge on the identical URL and DOM structure
   (`2026-08-14-windowed-a.json` / `-windowed-b.json` are byte-for-byte
   identical apart from timestamp). Iframe present, letterboxed within it
   (assumption #3, confirmed across five captures at three different
   aspect ratios/orientations: `windowed-2`, `fullscreen-2`, `windowedalt-1`,
   `windowed-a`, `windowed-b`).

Both reliably-reachable modes have `iframe.punch-present-iframe` — so
`content.js`'s existing `getPresentIframe`/`getSlideRect` handling is
confirmed correct for everything a user can deliberately navigate to via
the obvious "Present" UI surface.

The original `2026-08-14-windowed.json` capture (`/present?token=...`,
no iframe, top-document letterboxing — visually confirmed by
`docs/manual_tests/captures/2026-08-14-windowed-screenshot.png`'s black
bars) remains real evidence of a third,
structurally different pattern, but it is **not reproducible** via either
menu path found above, and no other path has surfaced it since. It's
parked rather than actively chased further for now: real, but currently
unreachable through known UI, so not scheduled for a `content.js` fix
absent either a reliable repro or a matching production bug report. If it
resurfaces (e.g. a user reports the overlay rendering off-slide in a
windowed present mode), this capture and screenshot are the starting
evidence to compare against.

## Edit-view investigation

A third real-world presentation pattern — presenting directly from the
editor (`/edit` URL, no `punch-present-iframe` at all) — is tracked
separately from the present-mode assumptions above, since (as of this
section) no `content.js`/`adapters/google_slides.js` code encodes any of
it yet; see `docs/specs/2026-08-21-google-slides-edit-view-recon-design.md`
for the full design and `docs/manual_tests.md`'s "Verifying Google Slides
edit-view DOM structure" section for the capture procedure using
`docs/manual_tests/capture_google_slides_edit_dom.js`.

### Capture history

| Date | Capture files | Result |
|---|---|---|
| 2026-08-21 | `docs/manual_tests/captures/2026-08-21-editview.json`, `2026-08-21-editview-2.json` | Both open selector questions confirmed — see findings below. `truncated: false` in both; the walk completed without hitting its node budget. |

### 2026-08-21 findings

Both leads from the design doc were confirmed exactly as suspected, plus
two additional signals neither capture was specifically seeking:

1. **`div#canvas-container` hunch — confirmed.** Found in both captures,
   identical rect `(253,196)–(1086,665)` (833×469, ~16:9) regardless of
   which slide is displayed. No class attribute, just the bare id.

2. **Filmstrip current-slide indicator — confirmed as suspected, no
   semantic marker.** Each slide is a
   `g.punch-filmstrip-thumbnail[data-slide-page-id="<pageId>"]`, containing
   a `rect.punch-filmstrip-thumbnail-border`. That rect's `stroke`/
   `stroke-width` is the *only* thing distinguishing selected from
   unselected — identical class name either way:
   - Selected: `stroke: rgb(11, 87, 208)`, `stroke-width: 4px`
   - Unselected: `stroke: rgb(196, 199, 197)`, `stroke-width: 1px`

   Confirmed by diffing the two captures: in `2026-08-21-editview.json` the
   `data-slide-page-id="p"` thumbnail is highlighted; in
   `2026-08-21-editview-2.json` it's `data-slide-page-id="g3f71a2fba3d_0_5"`
   — matching each capture's URL (see next finding).

3. **A simpler slide-id signal than the filmstrip: the URL itself.** The
   page URL carries the current slide's id directly —
   `.../edit?slide=id.p#slide=id.p` in the first capture,
   `.../edit?slide=id.g3f71a2fba3d_0_5#slide=id.g3f71a2fba3d_0_5` in the
   second. The same id also appears a third place: inside
   `div#canvas-container`, the rendered slide content sits in an SVG group
   whose id is literally `editor-<pageId>` (`editor-p` /
   `editor-g3f71a2fba3d_0_5` respectively). All three locations (URL,
   filmstrip `data-slide-page-id`, canvas SVG group id) agree in both
   captures. `window.location.hash` needs no DOM query at all and would
   slot directly into `content.js`'s existing 500ms-poll
   (`startSlideObserver`) architecture. The id is opaque, not numeric —
   getting an ordinal slide number requires finding its position among
   `document.querySelectorAll('.punch-filmstrip-thumbnail[data-slide-page-id]')`
   in DOM order, not parsing the id string itself. **Open concern raised
   before that's implemented:** the filmstrip may include slides marked
   "Skip slide" (hidden from the actual presentation) that would inflate a
   naive DOM-order count — see "Open questions" below.

4. **The canvas rect needs no letterbox math.** The `editor-<pageId>` SVG
   group's own rect, `(254,197)–(1087,666)`, is exactly 1px inset from
   `canvas-container`'s rect on every edge — matching `div.canvas`'s own
   `border: 1px solid rgb(196, 199, 197)` captured on that element. So
   `canvas-container`'s bounding rect is already the true visible-slide
   rect directly, unlike present mode, which needs a separate sub-rect
   computation to account for real letterboxing within the iframe.

### Open questions

- **Hidden ("Skip slide") entries in the filmstrip.** Raised during review
  of these findings, not yet investigated: does a skipped slide still
  appear as a `.punch-filmstrip-thumbnail` (with some additional marker),
  or is it excluded from the filmstrip's DOM entirely? This matters because
  the planned ordinal-numbering approach (finding a slide's position among
  filmstrip thumbnails in DOM order) would be wrong if skipped slides are
  present in that list but absent from the actual presentation's numbering.
  If a skipped slide turns out to be the one currently selected in edit
  view, reactions should likely attribute to slide `0` (the existing
  "unknown slide" sentinel) rather than a real ordinal — same as today's
  behavior when no slide can be determined at all. Needs a follow-up
  capture: mark one slide as skipped via the "Skip slide" menu item, then
  compare the filmstrip DOM against these two captures to see what changes.
- Not yet tested against a non-16:9 deck — whether `canvas-container` still
  needs no separate letterbox math when the deck's own aspect ratio doesn't
  match the editor's canvas area.
