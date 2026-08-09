# Overlay Positioning e2e Gaps — Design

## Context

A recent feature (`a324b75`, `043e2e7`) made the reaction overlay and emoji
anchor to the presentation slide's actual visible rect instead of the raw
viewport, so placement stays correct in Google Slides' windowed present mode
(where the presentation iframe letterboxes the slide — black bars above/below
or beside it to preserve aspect ratio). A related `fullscreenchange` listener
reparents the overlay into `document.fullscreenElement` so it keeps rendering
above the slide in fullscreen present mode too.

Neither code path has any test coverage today:

- **Jest (`tests/content.test.js`)**: mocks `iframe.getBoundingClientRect()`
  directly but never populates `iframe.contentDocument`, so `getSlideRect()`
  always returns `null` and every existing test exercises the *fallback*
  branch (`iframe.getBoundingClientRect()` used directly) — never the
  letterbox-offset math the feature actually added.
- **e2e (`tests/e2e/`)**: the fixture page (`tests/e2e/fixtures/slides.html`)
  has no `iframe.punch-present-iframe` element at all, so the whole e2e suite
  also only ever exercises the no-iframe fallback.
- **Fullscreen reparenting**: zero coverage anywhere, unit or e2e. jsdom's
  Fullscreen API is a no-op, so this is only testable in a real browser.

This is the highest-regression-risk gap in the e2e suite: a silent
regression here reproduces exactly the bug the recent feature fixed —
overlay/emoji rendering off-slide, in the letterbox bars, during windowed
present mode.

## Goal

Close this gap at the e2e level (real Chrome, real layout), covering:

1. Windowed-mode positioning anchors to the slide's visible rect, not the
   iframe's outer rect.
2. Fullscreen-mode reparenting moves the overlay into
   `document.fullscreenElement` and it remains correctly positioned.

Everything else identified in the broader e2e audit is logged as a backlog
(below) for a future round, not implemented here.

## Why e2e-only (no new Jest coverage)

Considered three approaches: Jest-only (mock the offset math), e2e-only
(real nested iframe + real layout), or both. Went with **e2e-only**.

The project's own docs already draw this line
(`docs/manual_tests.md`): Jest is for pure-logic/DOM-fixture assertions,
e2e is for what jsdom "structurally can't" verify. Real letterbox layout
math and the real Fullscreen API are squarely on the e2e side — a jsdom
unit test here would only prove the code adds two mocked numbers together
correctly, not that the CSS selector or offset math holds up against real
browser-computed rects. That's the actual risk. Adding a Jest test on top
would duplicate the same regression coverage with weaker guarantees, so it's
skipped rather than added for its own sake.

## Fixture changes

`tests/e2e/support/fixture-server.js` currently ignores `req.url` and always
serves `slides.html` for every request. Change it to route by pathname so
existing behavior (`/` → `slides.html`) is untouched and two new routes are
added:

- **`tests/e2e/fixtures/windowed-slide.html`** (served at
  `/windowed-slide.html`) — a page containing
  `<iframe class="punch-present-iframe" src="/slide-frame.html">`, sized
  larger than the slide content inside it (e.g. iframe `800x450`, slide
  `760x450` offset `left: 20px`), simulating a real Google Slides letterbox
  bar. Also includes a button (`#request-fullscreen-btn`) whose click handler
  calls `iframe.requestFullscreen()`, for the fullscreen spec.
- **`tests/e2e/fixtures/slide-frame.html`** (served at `/slide-frame.html`)
  — the iframe's own document: just the
  `.punch-viewer-svgpage-a11yelement[aria-label="Slide 1 of 10: Title text"]`
  element, sized/positioned to fill its parent iframe's content area (i.e.
  the "visible slide" within the letterboxed iframe).

The offset is deliberately **asymmetric** (bar on the left only, none on the
right) — a bug that anchors to the iframe's rect instead of the slide's rect
would be invisible under symmetric letterboxing, since the two rects would
share a center point.

`tests/e2e/fixtures/slides.html` and the three fixture-dependent specs
(`connect`, `reaction-overlay`, `slide-detection`) are unmodified — new
fixture files, new routes, no shared-file risk.

## New spec 1: `tests/e2e/overlay-windowed-position.spec.js`

No popup or backend interaction needed — `content.js` creates the overlay
unconditionally on page load, so this is pure content-script/DOM behavior.

- Navigate to `/windowed-slide.html`.
- Wait for `#speechwave-overlay` to be visible.
- Read the overlay's `boundingBox()` (top-document coordinates, Playwright
  auto-translates this even though the reference rect below comes from
  inside an iframe).
- Read the slide's `boundingBox()` via
  `page.frameLocator("iframe.punch-present-iframe").locator(".punch-viewer-svgpage-a11yelement")`.
- Assert the overlay's right/bottom edges fall within the slide's box
  (anchored to the visible slide, per `syncOverlayPosition`'s
  bottom-right-margin placement), and specifically that its left edge is
  offset past where the letterbox bar sits — i.e. inside the slide's `x`
  range, not the iframe's outer `x` range. This is what would fail if the
  code regressed to anchoring on `iframe.getBoundingClientRect()` instead of
  `getSlideRect()`.

## New spec 2: `tests/e2e/overlay-fullscreen-position.spec.js`

Same fixture (`/windowed-slide.html`).

- Wait for `#speechwave-overlay` to be visible, capture its starting
  `boundingBox()`.
- Click `#request-fullscreen-btn` — routed through a real Playwright
  `.click()` (not `page.evaluate()`) so Chrome recognizes it as
  user-activated; the Fullscreen API rejects `requestFullscreen()` calls
  without transient user activation.
- Wait for `document.fullscreenElement` to be truthy (poll or wait for the
  `fullscreenchange` event).
- Assert `#speechwave-overlay`'s parent element is now the fullscreen
  element (the reparenting in `content.js`'s `fullscreenchange` listener
  ran).
- Assert the overlay is still positioned within the slide's visible bounds
  post-reparent — this doubles as a regression check on the comment in
  `content.js:6-10` about fullscreen's "top-layer" rendering needing the
  reparenting in the first place, since `position: fixed` semantics change
  once an ancestor enters the top layer.

**Risk/fallback:** fullscreen automation in Playwright/headless-adjacent
Chrome configurations has historically been finicky. The context here does
launch `headless: false` (real Chrome), which reduces but doesn't eliminate
risk. If a real implementation attempt shows this is unreliable (flaky
across runs, not just a one-off environment hiccup), the fallback is to drop
the automated spec and instead document this as a manual-test case in
`docs/manual_tests.md`, rather than ship a flaky test — this will be decided
during implementation, not preemptively.

## Backlog (not implemented this round)

Identified during the broader e2e audit, ranked by regression risk, for a
future round:

1. **Connect error paths** (`not_found`, `unauthorized`, `capacity_reached`,
   `email_not_confirmed`, `key_updated`) — only the happy path is
   e2e-tested today. `not_found`/`unauthorized` are cheap (bad slug/key
   against an existing seeded user); `capacity_reached`/`email_not_confirmed`
   need new backend seed scripts in `../speechwave` that don't exist yet.
2. **Session start/stop** (`#session-btn`, `START_SESSION`/`STOP_SESSION`,
   `session_limit_reached`) — no spec touches this despite it being a core
   post-connect feature.
3. **Service-worker restart → `reconnectFromStorage()`** — core MV3
   resilience path (the SW can be killed/restarted anytime); untested.
4. **`key_updated` / unexpected channel close → popup error surfacing** —
   real-world trigger (backend regenerates a user's API key) with no
   coverage.
5. **Disconnect flow** — every existing spec connects; none click Disconnect
   and assert the UI/state reset.
6. **Concurrent reactions → auto-fireworks trigger via real broadcasts** —
   `fireworks.spec.js` only exercises the manual `TEST_FIREWORKS` debug
   button, not the real multi-attendee threshold path.
7. **Debug toggle persistence** — low visible-risk, lowest priority.
