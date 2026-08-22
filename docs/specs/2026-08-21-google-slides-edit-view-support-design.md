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
- The current slide's opaque page id is available from
  `window.location.hash` (`#slide=id.<pageId>`), updated live as the
  filmstrip selection changes, with no page reload.
- Each filmstrip thumbnail is a `.punch-filmstrip-thumbnail[data-slide-page-id="<pageId>"]`
  element, in DOM order matching slide order.
- A slide marked "Skip slide" gains a `<title>Skipped in slideshow
  mode</title>` element nested in its thumbnail's rendered content —
  absent entirely otherwise. This is the only reliable, semantic marker;
  the visible dimming/icon treatment is cosmetic (a separate overlay
  shape + a clipped `<image>`, not an `opacity` property), and not itself
  a good detection signal.

This design covers the actual `content.js`/`adapters/google_slides.js`
changes deferred by the recon design — the second, implementation half of
the two-phase plan set up there.

## Scope

1. **Overlay anchoring** — extend `content.js`'s existing present-mode
   fallback chain with an edit-view layer, so the overlay anchors to the
   real editing canvas instead of the full browser viewport.
2. **Slide-number detection** — extend `adapters/google_slides.js`'s
   `getSlide()` with an edit-view fallback that computes an ordinal slide
   number from the URL hash and the filmstrip's DOM order, correctly
   excluding "Skip slide"-marked thumbnails from that count.

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

## Slide-number detection (`adapters/google_slides.js`)

Add:

```js
// Edit view (presenting directly from the editor, no Present click) has
// no a11y element at all — the current slide's id lives in the URL hash
// instead (Google updates it via history state as the filmstrip
// selection changes, no page reload). The id is opaque (not numeric), so
// getting an ordinal slide number means finding its 1-based position
// among the filmstrip's thumbnails in DOM order — skipping any marked
// "Skip slide" via a nested <title> element, confirmed to be their only
// marker (absent entirely on non-skipped thumbnails). Returns the
// "unknown slide" sentinel (0) if the hash doesn't match, the filmstrip
// isn't present, or the current slide's id is itself skip-marked.
//
// Assumes every slide's thumbnail exists in the filmstrip DOM at once —
// untested against very large decks, where Google may virtualize
// off-screen thumbnails. See docs/google_slides_dom_assumptions.md.
function getEditViewSlide() {
  const match = window.location.hash.match(/^#slide=id\.(.+)$/);
  if (!match) return 0;
  const currentPageId = match[1];

  const thumbnails = document.querySelectorAll(".punch-filmstrip-thumbnail[data-slide-page-id]");
  let ordinal = 0;
  for (const thumbnail of thumbnails) {
    const isSkipped = !!thumbnail.querySelector("svg > title");
    if (isSkipped) continue;
    ordinal++;
    if (thumbnail.getAttribute("data-slide-page-id") === currentPageId) {
      return ordinal;
    }
  }
  return 0; // current slide not found among non-skipped thumbnails (itself skipped, or filmstrip absent/hidden)
}
```

`getSlide()`'s existing present-mode search is unchanged; its final
`return 0;` becomes `return getEditViewSlide();` — present-mode detection
is tried first, falling through to edit-view detection instead of
unconditionally giving up.

The file's top docstring currently states flatly that the a11y element
"is NOT present in the editor view. Slide tracking therefore only works
once the slideshow has started." This needs correcting to describe the
new fallback path, and its "re-run the capture-and-compare procedure"
note should mention the edit-view procedure/script
(`docs/manual_tests/capture_google_slides_edit_dom.js`) alongside the
existing present-mode one (`capture_real_google_slides_dom.js`).

## Testing

### Jest — `adapters/google_slides.js` (`tests/google_slides_adapter.test.js`)

New fixture `tests/fixtures/google_slides_edit_view_dom.html`, using the
real page ids from the capture for authenticity:

```html
<div class="punch-filmstrip-thumbnail" data-slide-page-id="p"></div>
<div class="punch-filmstrip-thumbnail" data-slide-page-id="g3f075e61544_1_0"></div>
<div class="punch-filmstrip-thumbnail" data-slide-page-id="g3f71a2fba3d_0_5">
  <svg><title>Skipped in slideshow mode</title></svg>
</div>
<div class="punch-filmstrip-thumbnail" data-slide-page-id="g3f71a2fba3d_0_22"></div>
```

New test cases (setting `window.location.hash` directly — supported by
jsdom without a real navigation):

- Hash matches the 2nd thumbnail (`g3f075e61544_1_0`) → `getSlide()`
  returns `2`.
- Hash matches the skip-marked 3rd thumbnail (`g3f71a2fba3d_0_5`) →
  returns `0`.
- Hash matches the 4th thumbnail (`g3f71a2fba3d_0_22`) → returns `3`,
  proving the skipped 3rd thumbnail is excluded from the ordinal count,
  not just from being selectable.
- Hash doesn't match `/^#slide=id\.(.+)$/` → returns `0`.
- Filmstrip absent entirely (empty body) even with a valid matching hash
  → returns `0`.

Each test must reset `window.location.hash` in `afterEach` alongside the
existing `document.body.innerHTML = ""` reset, so hash state doesn't leak
between tests.

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

**Deliberately not added:** a backend-seeded e2e test for slide-number
detection specifically. The existing `slide-detection.spec.js` already
proves the `SLIDE_CHANGED` → popup pipeline works, independent of which
adapter logic computed the number, and the Jest suite above already
thoroughly covers `getEditViewSlide()`'s actual logic in isolation. A new
edit-view variant would mostly re-prove already-tested plumbing at real
backend-seeding cost, for little additional coverage.

## Known limitations / non-goals

- **Filmstrip virtualization for large decks is untested.** The only real
  capture was a 4-slide deck with every thumbnail rendered in the DOM at
  once. If Google virtualizes off-screen thumbnails for large decks,
  `getEditViewSlide()`'s DOM-order count would undercount for slides
  scrolled out of view. Not blocking this implementation — documented as
  a known risk, same treatment as the existing "not yet tested against a
  non-16:9 deck" caveat in `docs/google_slides_dom_assumptions.md`. Worth
  a follow-up capture against a larger test deck if one becomes available.
- **Non-16:9 decks are untested** for the canvas-anchoring assumption
  (carried over unresolved from the recon findings).
- **No new "is this edit view" detection gate.** As established during
  the recon design: `background.js`'s emoji rendering is already fully
  gated on an active channel connection, independent of view mode, so no
  additional signal is needed here.
