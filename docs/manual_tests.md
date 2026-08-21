# End-to-End Extension Tests

Playwright-driven tests that load the *real* unpacked extension in a real
Chrome instance and drive it against a live local speechwave dev server —
the popup, the service worker's WebSocket connection, all of it, no mocks.
This is what catches the class of bug the Jest suite (`tests/`, pure-logic
and DOM-fixture tests) structurally can't: real popup/service-worker/
content-script wiring, and the real handshake with a running backend.

**Not CI-gated.** Run on demand, same spirit as speechwave's
`docs/manual_tests.md` — ad-hoc, agent- or human-runnable verification, not
a merge gate.

## Prerequisites

- The `speechwave` repo checked out as a sibling directory: `../speechwave`
  relative to this repo (see `AGENTS.md`).
- `npm install && npx playwright install chromium` (once).
- speechwave's DB migrated at least once (`mix ecto.setup` in `../speechwave`).

## Running

```sh
npm run test:e2e
```

This automatically, for the duration of the run only:
- starts speechwave's dev server via `pitchfork` if it isn't already running
  (left running afterward — it's a shared dev daemon),
- turns on `DEV_MODE` (points the extension at `ws://localhost:4000`) if it
  wasn't already on, reverting it afterward only if this run turned it on,
- patches `manifest.json` so the content script also injects into the local
  fixture page standing in for Google Slides, reverting the patch
  unconditionally afterward,
- serves that fixture page locally.

## What's covered

- **`connect.spec.js`** — fresh extension profile → enter API key → save →
  enter a seeded talk's slug → Connect → asserts the popup reflects a real,
  live Phoenix channel join.
- **`reaction-overlay.spec.js`** — a real attendee tapping an emoji on
  `/t/:slug` → real Phoenix channel broadcast → the fixture page's content
  script renders a `.floating-emoji` span on `#speechwave-overlay`.
- **`slide-detection.spec.js`** — mutating the fixture page's `aria-label`
  → asserts the popup's `#slide-indicator` updates to match.
- **`fireworks.spec.js`** — triggering the dev-mode `TEST_FIREWORKS` popup
  button → asserts a burst of spans appears on `#speechwave-overlay`.
- **`overlay-windowed-position.spec.js`** — a letterboxed presentation
  iframe (simulating Google Slides windowed present mode) → asserts
  `#speechwave-overlay` anchors to the visible slide's rect, not the
  iframe's outer rect.
- **`overlay-fullscreen-position.spec.js`** — triggering
  `requestFullscreen()` on the fixture's presentation container → asserts
  the overlay is reparented into `document.fullscreenElement` and its
  position doesn't shift.
- **`capture-script-sanity.spec.js`** — injects
  `docs/manual_tests/capture_real_google_slides_dom.js` into the local
  fixture page and asserts `window.captureGoogleSlidesDom()` reports the
  fixture's known DOM facts correctly, both windowed and after
  `requestFullscreen()`. This checks the capture script's own correctness
  against a controlled fixture — it says nothing about real Google Slides;
  that's what the manual procedure below verifies.
- **`capture-script-edit-dom-sanity.spec.js`** — injects
  `docs/manual_tests/capture_google_slides_edit_dom.js` into a synthetic
  edit-view fixture and asserts the bounded skeleton walk's mechanics: the
  `div#canvas-container` fast-check, computed-stroke capture distinguishing
  otherwise-identical filmstrip thumbnails, the wide-fan-out cap, and the
  global depth cap. Like `capture-script-sanity.spec.js`, this validates the
  recon script's own correctness against a controlled fixture — it says
  nothing about real Google Slides edit-view DOM structure; that's what the
  manual procedure below is for.

## Deliberately out of scope

- Behavior against real Google Slides — Google's login flow actively
  blocks automated sign-in, so there's no automated way to verify this;
  see `docs/specs/2026-08-06-extension-playwright-e2e-testing-design.md`
  for the full reasoning.
- Confirming what real Google Slides actually fullscreens (the bare
  `iframe.punch-present-iframe`, or a wrapping element) — this repo's e2e
  fixture simulates a wrapper (`#present-container` in
  `tests/e2e/fixtures/windowed-slide.html`) because `content.js`'s
  `fullscreenchange` listener appends the overlay into whatever
  `document.fullscreenElement` is, and an `<iframe>` element never renders
  light-DOM children appended to it — so if real Google Slides ever
  fullscreens the bare iframe rather than a wrapper, the overlay would
  silently fail to render in fullscreen present mode. Needs one manual
  check against real Google Slides to confirm which it is; this is a
  pre-existing `content.js` behavior, not something introduced by this
  branch, and out of scope to fix here.

## Verifying fixture assumptions against real Google Slides

The e2e fixtures (`tests/e2e/fixtures/windowed-slide.html`,
`slide-frame.html`) simulate Google Slides' presentation DOM based on
assumptions listed in `docs/google_slides_dom_assumptions.md`. Nobody has
automated a way to check those assumptions against the real thing — same
login-flow blocker as everything else in "Deliberately out of scope" above
— so this is a manual procedure:

1. Open a real Google Slides presentation you own, start Present
   (windowed, not fullscreen). Prefer a throwaway/non-sensitive deck if
   you have one — the capture includes the presentation's real document
   ID (`url`) and real slide title text (`a11yElement.ariaLabel`), and
   captures get committed to git (see steps 3/4). If you must use a
   sensitive deck, redact `url` and `ariaLabel` in the saved JSON before
   committing.
2. Open DevTools console. The first time in a given browser profile,
   Chrome requires typing `allow pasting` and pressing Enter before it
   will accept pasted code — do that first if your paste appears to do
   nothing. Then paste the contents of
   `docs/manual_tests/capture_real_google_slides_dom.js` and run it.
3. Run `copy(result)` in the console, then save the clipboard contents as
   `docs/manual_tests/captures/YYYY-MM-DD-windowed.json` (create the
   `captures/` directory if it doesn't exist yet).
4. Before entering fullscreen: if DevTools is docked (attached to the
   browser window), undock it into a separate window first (the "..."
   menu in DevTools → Dock side → undock icon). Docked DevTools becomes
   unusable once the page goes fullscreen, so you won't be able to
   interact with the console at all in this step otherwise. Then enter
   fullscreen present mode and re-invoke the capture — the Fullscreen API
   doesn't reload the page, so JS state (including
   `captureGoogleSlidesDom`) persists across the transition; you don't
   need to re-paste the script, just run `captureGoogleSlidesDom()` again
   (or `copy(captureGoogleSlidesDom())` directly). Save as
   `docs/manual_tests/captures/YYYY-MM-DD-fullscreen.json`.
5. Hand both files to Claude in a normal conversation and ask it to
   compare them against `docs/google_slides_dom_assumptions.md` — report
   each assumption as confirmed, contradicted, or inconclusive (element
   not found, which may mean the capture needs a different point in the
   flow rather than that the assumption is wrong).
6. If everything's confirmed: update the ledger's "Last verified" column
   and add a row to its "Capture history" table. If something's
   contradicted: that's a normal bug — fix the code/fixture, then update
   the ledger.

Captures get committed to git, so the ledger's "Last verified" claims have
real, timestamped, diffable evidence behind them over time.

## Verifying Google Slides edit-view DOM structure

Investigating support for edit-view presenting (no Present click — the
talk happens directly on the `/edit` URL) — see
`docs/specs/2026-08-21-google-slides-edit-view-recon-design.md`. Nobody
has captured real edit-view DOM yet, and unlike the present-mode
investigation, we don't have confirmed selector names to check — only
informal leads (a `div#canvas-container` hunch for the editing canvas, and
a suspicion that the current-slide indicator in the filmstrip is only a
visible stroke difference, not a semantic attribute). So instead of
guessing selectors and iterating capture rounds, this procedure captures a
bounded structural skeleton of the whole page for manual (Claude-assisted)
review:

1. Open a real Google Slides presentation you own in edit view — do **not**
   click Present. Prefer a throwaway/non-sensitive deck if you have one —
   the capture includes the document's real URL and any `aria-label`/
   `data-*` attribute values found in the DOM, which may include real slide
   title text, and captures get committed to git (see step 3). Redact the
   `url` field and any suspect attribute values in the saved JSON if you
   must use a sensitive deck.
2. Open DevTools console (type `allow pasting` and press Enter first if
   this is the first paste in this browser profile). Paste the contents of
   `docs/manual_tests/capture_google_slides_edit_dom.js` and run it.
3. Run `copy(result)`, then save the clipboard contents as
   `docs/manual_tests/captures/YYYY-MM-DD-editview.json`.
4. Click a *different* slide in the filmstrip, then re-run
   `copy(captureGoogleSlidesEditDom())` and save as
   `docs/manual_tests/captures/YYYY-MM-DD-editview-2.json`. Having both
   captures lets Claude diff them directly to pinpoint exactly which
   node's attributes or computed style change on slide selection, rather
   than reasoning from a single static tree.
5. Hand both files to Claude in a normal conversation and ask it to review
   them against the open selector questions in
   `docs/specs/2026-08-21-google-slides-edit-view-recon-design.md` (the
   `div#canvas-container` hunch, and what marks the selected filmstrip
   thumbnail). This starts a separate follow-up design/implementation
   cycle for the actual `content.js`/`adapters/google_slides.js` changes —
   this procedure only produces the raw capture data.
6. If the capture's top-level `truncated` field is `true`, the walk hit
   its node budget before finishing — mention this to Claude, since it may
   mean the walk needs to be re-scoped to a narrower root (e.g. starting
   from `#canvas-container` instead of `document.body`) rather than
   trusted as a complete picture.
