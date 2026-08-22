# Google Slides edit-view support: recon tooling design

> **Outcome:** see
> `docs/specs/2026-08-21-google-slides-edit-view-support-design.md` for what
> this recon led to — overlay anchoring shipped; slide-number detection
> (listed as still-open in "Scope" below) was investigated and dropped due
> to filmstrip virtualization, see `docs/google_slides_dom_assumptions.md`.

## Context

The extension currently recognizes two Google Slides presentation states,
both requiring `iframe.punch-present-iframe` to be present: fullscreen and
windowed present mode (see `docs/google_slides_dom_assumptions.md`). A third
real-world pattern exists: presenting directly from the editor (`/edit` URL,
no present iframe at all). Internal presenters — especially execs and sales
people working from decks with many slide options — often give entirely
internal/informal talks this way, curating (hiding/unhiding, i.e. Slides'
"skip slide" feature) only for external customer/prospect/investor-facing
versions of the same deck.

Today, when no present iframe is found, `content.js`'s `syncOverlayPosition`
falls back to sizing the overlay off the full browser viewport, anchored
bottom-right. This is the correct degrade-gracefully behavior for "extension
active before Present is clicked," but it's also literally what fires during
an entire edit-view talk — meaning the overlay currently ignores the toolbar,
filmstrip, and side panels and sizes against the whole window, including
them.

## Scope

1. **Overlay anchoring (primary goal).** Add a detection step, layered
   *on top of* the existing fallback chain (not replacing it): if no present
   iframe is found, attempt to detect an edit-view canvas region and compute
   a slide rect from it. Only override sizing when that detection succeeds;
   otherwise fall through to today's viewport-based fallback unchanged. This
   mirrors the existing `getSlideRect(iframe) || iframe.getBoundingClientRect()`
   layering already present in `syncOverlayPosition`.

   Whether this detection layer becomes reliable enough to be "the" default
   behavior for edit view, or needs some additional confidence check, is
   explicitly **not decided by this design** — it depends on what Phase 2's
   real-DOM capture reveals.

2. **Slide-number detection (best-effort).** `adapters/google_slides.js`'s
   `getSlide()` returns the `0` "unknown slide" sentinel in edit view today,
   since the a11y element it relies on doesn't exist there. Investigate
   whether the filmstrip's current-slide indicator can be read reliably. If
   not, `0` remains correct — that's status quo, not a regression.

## Non-goal

No separate "is this a live talk vs. just someone editing alone" signal.
`background.js` only ever emits `RENDER_EMOJI` from an active
`reactions:${slug}` channel connection, joined explicitly via the popup —
entirely independent of which Slides view is showing. A bare "editor open,
no live session" scenario already renders nothing today, regardless of view
mode, so this gap doesn't actually exist.

## Deliverable of this design: Phase 1 (recon tooling) only

Nobody has captured real edit-view DOM yet, and unlike the present-mode
investigation (where selectors like `.punch-viewer-svgpage-a11yelement` were
already known), we don't have confirmed selector hunches for the edit-view
canvas or filmstrip-selection indicator — only two informal leads from
manual poking around:

- The rendered slide area appears to need computing from an SVG that
  includes a scaling transform — possibly nested inside `div#canvas-container`.
- The currently-selected filmstrip thumbnail appears to be distinguishable
  only by an SVG border-stroke difference, not a semantic
  class/attribute — though a full capture may reveal a semantic marker that
  isn't obvious from casual visual inspection.

Rather than write selector-guessing heuristics and iterate capture rounds
(the present-mode investigation's original approach), this phase captures a
bounded structural skeleton of the whole edit-view DOM in one pass, for
manual (Claude-assisted) review.

### New script: `docs/manual_tests/capture_google_slides_edit_dom.js`

Follows the existing `capture_real_google_slides_dom.js` conventions: a
top-level `function captureGoogleSlidesEditDom()` (not an IIFE or
`const`/arrow function, so it still attaches to `window` for
`addScriptTag`-based e2e injection). Produces two things:

**A. Fast-check for `div#canvas-container`.** Reported independently and
first: found/not-found, tag, class, rect. Gives an immediate confirm/deny on
that lead without requiring a dig through the general dump.

**B. Bounded DOM-skeleton walk**, rooted at `document.body` (plus any
accessible same-origin iframes, for parity with the present-mode script). We
deliberately don't pre-scope the walk to guessed containers — the goal is to
avoid another guess-capture-miss-recapture cycle. To keep the dump usable and
appropriately sized:

- **No text content, no SVG path/glyph internals.** Slides renders slide
  text as vector paths; a content SVG could otherwise dump thousands of
  `<path>`/`<g>` glyph nodes. Once inside an `<svg>`, stop descending after 2
  levels and report only a child count from there.
- **Skip zero-size elements.** Filters out the large inert
  menu/dialog DOM Google's editor keeps hidden, without needing to know
  their selectors.
- **Cap wide fan-out.** For any node with more children than a threshold
  (e.g. a many-slide filmstrip), record only the first/last few plus a
  count of the rest.
- **Global node budget** (e.g. 5000 visited nodes) as a safety valve. If
  hit, set a top-level `truncated: true` flag rather than silently
  returning a partial picture — a signal to re-scope the walk to a
  narrower root rather than trust an incomplete capture.
- **Per node:** tag name, `id`, `class`, any `aria-*`/`role`/`data-*`
  attributes, rounded `getBoundingClientRect()`, and border-relevant
  computed style (`border`, `outline`, `boxShadow`, and for SVG elements
  `stroke`/`strokeWidth`) — directly targeting the stroke-based selection
  lead above.

Output is a single JSON-serializable object: `capturedAt`, `url`,
`viewport`, the `canvasContainer` fast-check result, and the `domSkeleton`
tree — same `copy(result)`-to-clipboard workflow as the existing script.

### Procedure addition (`docs/manual_tests.md`)

New subsection alongside the existing present-mode procedure: open a real
edit-view Slides session (no Present click), run the script, save as
`docs/manual_tests/captures/YYYY-MM-DD-editview.json`. Then click a
*different* slide in the filmstrip and capture again
(`YYYY-MM-DD-editview-2.json`) — Claude will diff the two skeletons to
pinpoint exactly which node's stroke/border attribute changes on selection,
rather than reasoning from a single static capture. The test deck used for
this capture is a generic 4-slide deck with no sensitive content, so no
redaction is needed for these particular captures (unlike the general
sensitive-deck caveat the existing procedure carries for other users/decks).

### Testing

New fixture-based sanity test, `tests/e2e/capture-script-edit-dom-sanity.spec.js`,
parallel to the existing `capture-script-sanity.spec.js`. A synthetic fixture
page (e.g. `tests/e2e/fixtures/edit-view.html`) provides:

- a `div#canvas-container` with a nested SVG (exercises the fast-check path),
- a fake filmstrip with several thumbnail SVGs, one with a distinguishing
  stroke style,
- deliberately deep/wide/zero-size decoy elements to exercise the depth cap,
  fan-out cap, and zero-size filter.

This test validates the recon script's *mechanics* (caps, filtering,
fast-check reporting) against known synthetic structure. It cannot and does
not validate real Google Slides selectors — that's exactly what the human
capture in the procedure above is for, same division of labor as the
existing present-mode fixture/capture split.

## Explicitly deferred (not part of this design's implementation)

- Any change to `content.js`'s `syncOverlayPosition` or
  `adapters/google_slides.js`'s `getSlide()`. These depend on real selector
  names this design does not have yet.
- Whether edit-canvas anchoring becomes the default behavior once
  detectable, or needs an additional confidence check.

Once the capture (Phase 2, a manual step for the user) is complete and its
findings reviewed, that begins a **separate follow-up design/plan cycle** —
the same iterative capture-then-implement pattern already used for
fullscreen/windowed mode in `docs/google_slides_dom_assumptions.md`'s capture
history.
