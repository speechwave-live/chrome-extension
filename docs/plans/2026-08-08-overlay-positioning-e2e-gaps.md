# Overlay Positioning e2e Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-Chrome e2e coverage for the two overlay-positioning code
paths that currently have zero test coverage anywhere — windowed-mode
letterbox anchoring (`getSlideRect` in `content/content.js`) and fullscreen
reparenting (the `fullscreenchange` listener in the same file).

**Architecture:** Two new Playwright fixture pages simulate a letterboxed
Google Slides presentation iframe (an outer page with an
`iframe.punch-present-iframe`, and the iframe's own document containing the
`.punch-viewer-svgpage-a11yelement` sized smaller than the iframe to create
a real letterbox bar). Two new specs drive against them: one asserts the
overlay anchors to the slide's rect rather than the iframe's outer rect, the
other asserts the overlay survives fullscreen reparenting without its
position shifting.

**Tech Stack:** Playwright (e2e), Chrome extension (MV3 content script), no
backend/Phoenix interaction needed — both specs load the fixture directly
without connecting via the popup, since `content.js` creates the overlay
unconditionally on page load.

## Global Constraints

- No changes to `content/content.js` itself — this plan closes a *test*
  gap, not an implementation gap. If a new spec fails, that's a genuine bug
  to report, not something to code around in the test. (spec:
  "Goal")
- `tests/e2e/fixtures/slides.html` and the three specs that depend on it
  (`connect.spec.js`, `reaction-overlay.spec.js`, `slide-detection.spec.js`)
  must not change — new fixture files and new server routes only. (spec:
  "Fixture changes")
- No new backend seeding (`seedTalk`/`fetchApiKey`/`cleanupTestUser`) for
  either new spec — both specs test pure content-script/DOM behavior with
  no channel connection, matching `fireworks.spec.js`'s precedent of
  dropping unnecessary backend dependencies. (spec: "New spec 1", "New spec 2")
- Fullscreen flakiness, if it appears during Task 2, gets resolved in this
  order: fix the wait condition first (event-based, not a fixed delay) →
  scope Playwright's built-in `retries` to just that spec file if the
  flakiness looks environment-driven → drop to a `docs/manual_tests.md`
  manual-test note only if still unreliable after both. Never a hand-rolled
  "retry N times, pass if any attempt succeeds" loop — Playwright's native
  retry mechanism reports a pass-after-retry as **flaky** in output, which a
  custom loop would silently hide. (spec: "Risk/fallback")

---

## Task 1: Windowed-mode letterbox positioning spec

**Files:**
- Create: `tests/e2e/overlay-windowed-position.spec.js`
- Create: `tests/e2e/fixtures/windowed-slide.html`
- Create: `tests/e2e/fixtures/slide-frame.html`
- Modify: `tests/e2e/support/fixture-server.js`
- Modify: `tests/e2e/support/fixture.js`

**Interfaces:**
- Consumes: `tests/e2e/support/extension-fixtures.js`'s `test`/`expect`
  (existing); `tests/e2e/support/constants.js`'s `FIXTURE_PORT` (existing,
  value `8973`).
- Produces: `openWindowedFixturePage(context)` in `tests/e2e/support/fixture.js`
  — same shape as the existing `openFixturePage(context)`, navigates to
  `/windowed-slide.html` instead of `/`, returns the Playwright `Page` after
  confirming `#speechwave-overlay` is visible. Task 2 reuses this.

- [ ] **Step 1: Write the failing spec test**

Create `tests/e2e/overlay-windowed-position.spec.js`:

```js
const { test, expect } = require("./support/extension-fixtures");
const { openWindowedFixturePage } = require("./support/fixture");

// From DEFAULT_REMOTE_CONFIG (lib/default_remote_config.js) — neither this
// spec nor its fixture ever connects to a channel, so content.js falls back
// to these defaults when it requests GET_REMOTE_CONFIG on load.
const OVERLAY_SIZE_PERCENT = 0.2;
const OVERLAY_MARGIN_PX = 8;

test("overlay anchors to the visible slide inside a letterboxed presentation iframe, not the iframe's outer edge", async ({
  context,
}) => {
  const fixturePage = await openWindowedFixturePage(context);

  const slideBox = await fixturePage
    .frameLocator("iframe.punch-present-iframe")
    .locator(".punch-viewer-svgpage-a11yelement")
    .boundingBox();
  const overlayBox = await fixturePage.locator("#speechwave-overlay").boundingBox();

  // windowed-slide.html's iframe (800x450) is 40px wider than the slide
  // inside it (760x450, see slide-frame.html) — a letterbox bar down the
  // right side. If content.js regressed to anchoring on the iframe's own
  // rect instead of the slide's (getSlideRect in content/content.js), the
  // overlay's right edge would land 40px further right, inside that bar
  // instead of on the visible slide.
  expect(overlayBox.width).toBeCloseTo(slideBox.width * OVERLAY_SIZE_PERCENT, 0);
  expect(overlayBox.height).toBeCloseTo(slideBox.height * OVERLAY_SIZE_PERCENT, 0);
  expect(overlayBox.x + overlayBox.width).toBeCloseTo(
    slideBox.x + slideBox.width - OVERLAY_MARGIN_PX,
    0
  );
  expect(overlayBox.y + overlayBox.height).toBeCloseTo(
    slideBox.y + slideBox.height - OVERLAY_MARGIN_PX,
    0
  );
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx playwright test overlay-windowed-position`
Expected: FAIL — `TypeError: openWindowedFixturePage is not a function`
(`tests/e2e/support/fixture.js` doesn't export it yet).

- [ ] **Step 3: Create the outer fixture page**

Create `tests/e2e/fixtures/windowed-slide.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Speechwave e2e fixture — windowed present mode stand-in</title>
  <style>
    body { margin: 0; }
    iframe.punch-present-iframe {
      position: absolute;
      left: 100px;
      top: 50px;
      width: 800px;
      height: 450px;
      border: 0;
    }
  </style>
</head>
<body>
  <!-- Mimics Google Slides windowed present mode: the presentation iframe
       (800x450) letterboxes a narrower slide (760x450, see slide-frame.html)
       positioned flush to the iframe's top-left, leaving a 40px bar down
       the right side that the iframe's own rect would wrongly include if
       content.js fell back to it instead of the slide's own rect (see
       getSlideRect in content/content.js). -->
  <iframe class="punch-present-iframe" src="/slide-frame.html"></iframe>
</body>
</html>
```

- [ ] **Step 4: Create the inner (letterboxed slide) fixture page**

Create `tests/e2e/fixtures/slide-frame.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Speechwave e2e fixture — letterboxed slide stand-in</title>
  <style>
    body { margin: 0; }
    .punch-viewer-svgpage-a11yelement {
      position: absolute;
      left: 0;
      top: 0;
      width: 760px;
      height: 450px;
    }
  </style>
</head>
<body>
  <!-- Mimics the DOM element the Google Slides adapter reads the current
       slide number from (see adapters/google_slides.js and
       tests/fixtures/google_slides_dom.html) — sized here to be narrower
       than its parent iframe (windowed-slide.html), simulating the visible
       slide inside a letterboxed presentation iframe. -->
  <div
    class="punch-viewer-svgpage-a11yelement"
    aria-label="Slide 1 of 10: Title text"
    role="img"
    tabindex="0"
  ></div>
</body>
</html>
```

- [ ] **Step 5: Add multi-route support to the fixture server**

In `tests/e2e/support/fixture-server.js`, replace the whole file:

```js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { FIXTURE_PORT } = require("./constants");

const FIXTURES_DIR = path.join(__dirname, "..", "fixtures");
const ROUTES = {
  "/": "slides.html",
  "/windowed-slide.html": "windowed-slide.html",
  "/slide-frame.html": "slide-frame.html",
};

function startFixtureServer() {
  const pages = new Map(
    Object.entries(ROUTES).map(([route, file]) => [
      route,
      fs.readFileSync(path.join(FIXTURES_DIR, file)),
    ])
  );

  const server = http.createServer((req, res) => {
    const html = pages.get(req.url) || pages.get("/");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(FIXTURE_PORT, "localhost", () => resolve(server));
  });
}

module.exports = { startFixtureServer };
```

(Unmatched paths still fall back to `slides.html`'s content, same as the
original single-route behavior — e.g. an incidental `/favicon.ico` request
from Chrome.)

- [ ] **Step 6: Add `openWindowedFixturePage` to the fixture helper**

In `tests/e2e/support/fixture.js`, replace the whole file:

```js
const { expect } = require("@playwright/test");
const { FIXTURE_PORT } = require("./constants");

async function openFixturePage(context) {
  const fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/`);
  await expect(fixturePage.locator("#speechwave-overlay")).toBeVisible();
  return fixturePage;
}

async function openWindowedFixturePage(context) {
  const fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/windowed-slide.html`);
  await expect(fixturePage.locator("#speechwave-overlay")).toBeVisible();
  return fixturePage;
}

module.exports = { openFixturePage, openWindowedFixturePage };
```

- [ ] **Step 7: Run it again, verify it passes**

Run: `npx playwright test overlay-windowed-position`
Expected: PASS

- [ ] **Step 8: Run the full e2e suite, verify nothing else broke**

Run: `npm run test:e2e`
Expected: PASS — `connect`, `reaction-overlay`, `slide-detection`,
`fireworks`, and the new `overlay-windowed-position` spec all pass. This
confirms the fixture-server routing change didn't affect `slides.html`'s
existing `/` route.

- [ ] **Step 9: Commit**

```bash
git add tests/e2e/overlay-windowed-position.spec.js tests/e2e/fixtures/windowed-slide.html tests/e2e/fixtures/slide-frame.html tests/e2e/support/fixture-server.js tests/e2e/support/fixture.js
git commit -m "test: add windowed-mode overlay letterbox positioning e2e round trip"
```

---

## Task 2: Fullscreen reparenting spec

**Files:**
- Create: `tests/e2e/overlay-fullscreen-position.spec.js`
- Modify: `tests/e2e/fixtures/windowed-slide.html`
- Modify: `docs/manual_tests.md`

**Interfaces:**
- Consumes: `openWindowedFixturePage(context)` from Task 1
  (`tests/e2e/support/fixture.js`).
- Produces: nothing consumed by later tasks — this is the last task in the
  plan.

- [ ] **Step 1: Write the failing spec test**

Create `tests/e2e/overlay-fullscreen-position.spec.js`:

```js
const { test, expect } = require("./support/extension-fixtures");
const { openWindowedFixturePage } = require("./support/fixture");

test("overlay stays correctly positioned after Google Slides fullscreen present mode reparents it into the top layer", async ({
  context,
}) => {
  const fixturePage = await openWindowedFixturePage(context);

  const beforeBox = await fixturePage.locator("#speechwave-overlay").boundingBox();

  await fixturePage.locator("#request-fullscreen-btn").click();
  await fixturePage.waitForFunction(() => !!document.fullscreenElement);

  const reparented = await fixturePage.evaluate(() => {
    const overlay = document.getElementById("speechwave-overlay");
    return overlay.parentElement === document.fullscreenElement;
  });
  expect(reparented).toBe(true);

  const afterBox = await fixturePage.locator("#speechwave-overlay").boundingBox();
  // content.js's fullscreenchange listener only reparents the overlay — it
  // never recomputes syncOverlayPosition. Entering the browser's top layer
  // must not change what position:fixed resolves against, or the overlay
  // would visibly jump the instant present mode goes fullscreen (see the
  // OVERLAY_MAX_Z_INDEX comment in content.js:6-10 about why fullscreen
  // needs this reparenting in the first place).
  expect(afterBox.x).toBeCloseTo(beforeBox.x, 0);
  expect(afterBox.y).toBeCloseTo(beforeBox.y, 0);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx playwright test overlay-fullscreen-position`
Expected: FAIL — times out waiting for `#request-fullscreen-btn` (element
doesn't exist yet).

- [ ] **Step 3: Add the fullscreen-trigger button to the fixture**

In `tests/e2e/fixtures/windowed-slide.html`, add the button right after the
`<iframe>` element (still inside `<body>`):

```html
  <iframe class="punch-present-iframe" src="/slide-frame.html"></iframe>

  <!-- Routed through a real button + Playwright .click() (not
       page.evaluate()) so Chrome recognizes the resulting
       requestFullscreen() call as user-activated — the Fullscreen API
       rejects calls made without transient user activation. -->
  <button
    id="request-fullscreen-btn"
    onclick="document.querySelector('iframe.punch-present-iframe').requestFullscreen()"
  >Fullscreen</button>
```

- [ ] **Step 4: Run it again, verify it passes**

Run: `npx playwright test overlay-fullscreen-position`
Expected: PASS

If this is flaky (intermittent pass/fail across several repeated runs, not
a one-off), work through the escalation order in this plan's Global
Constraints before touching the test's retry behavior: confirm the wait is
event-based (it already is — `waitForFunction` polling
`document.fullscreenElement`, not a fixed delay) before considering a
file-scoped Playwright `retries` addition, and only fall back to a
`docs/manual_tests.md` manual-test note if it's still unreliable after that.

- [ ] **Step 5: Run the full e2e suite, verify nothing else broke**

Run: `npm run test:e2e`
Expected: PASS — all six specs (`connect`, `reaction-overlay`,
`slide-detection`, `fireworks`, `overlay-windowed-position`,
`overlay-fullscreen-position`) pass.

- [ ] **Step 6: Document both new specs in the e2e coverage docs**

In `docs/manual_tests.md`, in the `## What's covered` list, add after the
`fireworks.spec.js` bullet:

```markdown
- **`overlay-windowed-position.spec.js`** — a letterboxed presentation
  iframe (simulating Google Slides windowed present mode) → asserts
  `#speechwave-overlay` anchors to the visible slide's rect, not the
  iframe's outer rect.
- **`overlay-fullscreen-position.spec.js`** — triggering
  `iframe.requestFullscreen()` on the fixture's presentation iframe →
  asserts the overlay is reparented into `document.fullscreenElement` and
  its position doesn't shift.
```

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/overlay-fullscreen-position.spec.js tests/e2e/fixtures/windowed-slide.html docs/manual_tests.md
git commit -m "test: add fullscreen overlay reparenting e2e round trip"
```
