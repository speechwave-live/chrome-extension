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

## Deliberately out of scope

- Behavior against real Google Slides — Google's login flow actively
  blocks automated sign-in, so there's no automated way to verify this;
  see `docs/specs/2026-08-06-extension-playwright-e2e-testing-design.md`
  for the full reasoning.
- **Fullscreen overlay reparenting** (`content.js`'s `fullscreenchange`
  listener, which moves `#speechwave-overlay` into
  `document.fullscreenElement` so it stays visible above Google Slides'
  present-mode iframe) — not automated because driving and measuring it
  through Playwright/Chromium's fullscreen top-layer proved unreliable in
  practice: `locator().boundingBox()` returns `null` for elements inside
  the fullscreen top layer, and even after switching to
  `getBoundingClientRect()` via `page.evaluate()`, the reparented overlay
  consistently rendered at `(0, 0)` because the fixture's
  `iframe.requestFullscreen()` target doesn't render light-DOM children
  appended into it (an `<iframe>` element only paints its own nested
  browsing context). Verify manually instead: open the fixture, click the
  "Fullscreen" button (`#request-fullscreen-btn` in
  `tests/e2e/fixtures/windowed-slide.html`), and confirm
  `#speechwave-overlay` stays visible and correctly positioned over the
  slide.
