# Google Slides edit-view support: implementation design

## Context

`docs/specs/2026-08-21-google-slides-edit-view-recon-design.md` built recon
tooling to investigate Google Slides' edit-view DOM (presenting directly
from the `/edit` URL, no `punch-present-iframe`). Real captures against a
live Google Slides deck — recorded in
`docs/google_slides_dom_assumptions.md`'s "Edit-view investigation" section
— have since confirmed everything needed to implement the feature:

- `div#canvas-container`'s own bounding rect is already the true
  visible-slide rect, with no separate letterboxing/scaling math needed
  (unlike present mode's iframe).

A second round of captures against an expanded, 30-slide test deck then
found that Google **virtualizes the edit-view filmstrip** — only a window
of thumbnails near the current scroll position ever exists in the DOM at
once (14 of 30 in that capture). This breaks the ordinal slide-number
approach the recon design had otherwise fully worked out (URL hash for the
current opaque page id, `.punch-filmstrip-thumbnail[data-slide-page-id]`
DOM order for position, a `<title>` marker to exclude "Skip slide"
entries) — a slide's position among only the currently-rendered
thumbnails isn't its true position in the deck. No absolute-position
signal was found to substitute. Full writeup:
`docs/google_slides_dom_assumptions.md`'s "filmstrip virtualization breaks
DOM-order counting" section.

This design covers the actual `content.js`/`adapters/google_slides.js`
changes deferred by the recon design — the second, implementation half of
the two-phase plan set up there — scoped down to what the virtualization
finding leaves viable.

## Scope

**Overlay anchoring only.** Extend `content.js`'s existing present-mode
fallback chain with an edit-view layer, so the overlay anchors to the real
editing canvas instead of the full browser viewport. Unaffected by the
virtualization finding — `canvas-container` isn't part of the filmstrip.

**Slide-number detection for edit view is explicitly dropped**, not
deferred pending more investigation. `adapters/google_slides.js`'s
`getSlide()` keeps returning the `0` ("unknown slide") sentinel for edit
view, exactly as it does today. See "Known limitations / non-goals" below
for why this was decided rather than left open.

## Non-goal

No separate "is this a live talk" signal — `background.js`'s emoji
rendering is already fully gated on an active `reactions:${slug}` channel
connection, independent of which Slides view is showing. (Carried over
from the recon design; re-confirmed here since it still applies.)

## Overlay anchoring (`content.js`)

Add, alongside the existing `getPresentIframe`/`getSlideRect`:

```js
// Google Slides' edit view (presenting directly from the editor, no
// Present click) renders the live slide inside this container. Unlike
// present mode's iframe, it needs no separate letterbox sub-rect
// computation — confirmed via real capture that its own bounding rect
// already matches the rendered slide's true bounds to within a 1px
// border inset. See docs/google_slides_dom_assumptions.md's
// "Edit-view investigation" section.
function getEditCanvasRect() {
  const el = document.getElementById("canvas-container");
  return el ? el.getBoundingClientRect() : null;
}
```

`syncOverlayPosition` changes from:
```js
const iframe = getPresentIframe();
const rect = iframe && (getSlideRect(iframe) || iframe.getBoundingClientRect());
```
to:
```js
const iframe = getPresentIframe();
const rect = (iframe && (getSlideRect(iframe) || iframe.getBoundingClientRect())) || getEditCanvasRect();
```

This is one more layer in the existing fallback chain, not a replacement
of the default: the viewport-fallback `else` branch (bottom-right corner
sizing) is untouched, and now only fires when *neither* a present iframe
*nor* an edit-view canvas is found. Present iframe detection is checked
first and wins if both are somehow present (shouldn't happen in practice,
but keeps present-mode behavior byte-for-byte unchanged).

The `fullscreenchange` listener and all downstream percent/margin math in
`syncOverlayPosition` are untouched — they're already generic over "the
current rect," regardless of which detection layer produced it.

`adapters/google_slides.js` is **not modified** by this design. Its file
docstring's existing statement that the a11y element "is NOT present in
the editor view. Slide tracking therefore only works once the slideshow
has started" remains accurate as-is — no change needed.

## Testing

### Jest — `content.js` (`tests/content.test.js`)

The existing `addPresentIframe(rect)` helper is currently declared inside
the `"overlay sizing: percent of the slide's actual dimensions"` describe
block, scoped to it. It needs hoisting to module scope (alongside
`FULL_TUNING`) so a new sibling describe block can share it — a small,
deliberate reorganization of existing test code called out explicitly,
not a silent side effect of this change.

New `addCanvasContainer(rect)` helper, same shape as `addPresentIframe`:
```js
function addCanvasContainer(rect) {
  const el = document.createElement("div");
  el.id = "canvas-container";
  el.getBoundingClientRect = jest.fn().mockReturnValue(rect);
  document.body.appendChild(el);
  return el;
}
```

New describe block `"overlay sizing: edit-view canvas anchoring"`:
- Canvas-container present, no iframe → overlay sizes off its rect (same
  percent-of-rect math already covered by the present-mode tests, applied
  to the new rect source).
- Both a present iframe and a canvas-container exist → the iframe's rect
  wins, proving the fallback layering order (`getPresentIframe()` checked
  before `getEditCanvasRect()`).

### E2E

One new lightweight test, `tests/e2e/overlay-editview-position.spec.js`,
following the existing `overlay-windowed-position.spec.js` pattern — no
backend/seeding needed, just a static fixture + bounding-box assertion.
New fixture with `#canvas-container` at a known rect; test asserts
`#speechwave-overlay`'s box matches `overlay_size_percent` of it.

## Known limitations / non-goals

- **Slide-number detection for edit view is dropped, not deferred.**
  Filmstrip virtualization (confirmed via a 30-slide capture — only 14 of
  30 thumbnails render in the DOM at once) breaks DOM-order ordinal
  counting regardless of skip-filtering, and no absolute-position
  alternative was found. A programmatic scroll-and-enumerate approach to
  defeat virtualization was considered and rejected as disproportionately
  complex and intrusive (would visibly hijack the presenter's own
  filmstrip scroll position) for what it would buy. Reactions received
  while presenting from edit view will attribute to slide `0`
  (unattributed) — still shown live in the overlay, just not routed to a
  specific slide. Arguably not just an accepted limitation: a presenter
  who drops into edit view mid-Q&A to jump between slides wouldn't want
  those reactions attributed to whichever slide they land on anyway, since
  that reflects the Q&A tail, not how the presentation proper landed.
- **Non-16:9 decks are untested** for the canvas-anchoring assumption
  (carried over unresolved from the recon findings).
- **No new "is this edit view" detection gate.** As established during
  the recon design: `background.js`'s emoji rendering is already fully
  gated on an active channel connection, independent of view mode, so no
  additional signal is needed here.
