# Google Slides Fixture Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the team a repeatable way to check the e2e fixtures'
Google-Slides-DOM assumptions against the real thing — a documented ledger
of what we assume, a capture script a human runs against a real, logged-in
Slides session, and pointers at the code that re-trigger this whenever
those assumptions get touched.

**Architecture:** Three independent-but-related deliverables: (1) a
markdown ledger enumerating the four known assumptions with file:line
pointers and verification status, (2) a dual-use capture script (pasteable
into DevTools console by a human, also invokable by an automated Playwright
test that validates the script's own correctness against our local
fixture), and (3) a documented human procedure plus trigger comments at the
two source locations that encode these assumptions.

**Tech Stack:** Plain JS (no dependencies) for the capture script,
Playwright for the sanity test, Markdown for docs — no new runtime
dependencies.

## Global Constraints

- No runtime canary / telemetry in the shipped extension — explicitly
  deferred to a future project, not touched here. (spec: "Non-goals")
- No packaged skill or slash command for the comparison step — it's a
  plain ad hoc procedure documented in `docs/manual_tests.md`, not
  automated tooling. (spec: "Non-goals")
- The capture script (`docs/manual_tests/capture_real_google_slides_dom.js`)
  must stay dependency-free, plain JS, pasteable directly into a browser
  DevTools console as-is — no `require`/`import`, no build step. (spec:
  "Component 2")
- No changes to `content/content.js`'s or `adapters/google_slides.js`'s
  actual logic — only comment additions pointing at the ledger. (spec:
  "Component 4")

---

## Task 1: The assumptions ledger

**Files:**
- Create: `docs/google_slides_dom_assumptions.md`

**Interfaces:**
- Produces: a stable file path (`docs/google_slides_dom_assumptions.md`)
  that Task 3's trigger comments point at by name — no other interface.

- [ ] **Step 1: Write the ledger**

Create `docs/google_slides_dom_assumptions.md`:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/google_slides_dom_assumptions.md
git commit -m "docs: add Google Slides DOM assumptions ledger"
```

---

## Task 2: The capture script and its sanity test

**Files:**
- Create: `docs/manual_tests/capture_real_google_slides_dom.js`
- Create: `tests/e2e/capture-script-sanity.spec.js`

**Interfaces:**
- Consumes: `openWindowedFixturePage(context)` from
  `tests/e2e/support/fixture.js` (existing, from the previous plan).
- Produces: `window.captureGoogleSlidesDom()` — a function with no
  arguments, returning the JSON-shaped object documented in the design
  spec (`capturedAt`, `url`, `a11yElement`, `presentIframe`,
  `slideRectWithinIframe`, `fullscreen`). Available on `window` once the
  script is loaded via a `<script>` tag (classic script, not a module) —
  either pasted into a DevTools console, or injected via Playwright's
  `page.addScriptTag({ path })`.

- [ ] **Step 1: Write the failing sanity test**

Create `tests/e2e/capture-script-sanity.spec.js`:

```js
const path = require("path");
const { test, expect } = require("./support/extension-fixtures");
const { openWindowedFixturePage } = require("./support/fixture");

const CAPTURE_SCRIPT_PATH = path.join(
  __dirname,
  "..",
  "..",
  "docs",
  "manual_tests",
  "capture_real_google_slides_dom.js"
);

test("capture script reports correct facts against the local windowed fixture", async ({
  context,
}) => {
  const fixturePage = await openWindowedFixturePage(context);
  await fixturePage.addScriptTag({ path: CAPTURE_SCRIPT_PATH });

  const before = await fixturePage.evaluate(() => window.captureGoogleSlidesDom());

  expect(before.a11yElement).toEqual({
    found: true,
    ariaLabel: "Slide 1 of 10: Title text",
    className: "punch-viewer-svgpage-a11yelement",
    hostIframeClassName: "punch-present-iframe",
  });
  expect(before.presentIframe.found).toBe(true);
  expect(before.presentIframe.className).toBe("punch-present-iframe");
  expect(before.presentIframe.rect.left).toBeCloseTo(100, 0);
  expect(before.presentIframe.rect.top).toBeCloseTo(50, 0);
  expect(before.presentIframe.rect.right).toBeCloseTo(900, 0);
  expect(before.presentIframe.rect.bottom).toBeCloseTo(500, 0);
  expect(before.slideRectWithinIframe.left).toBeCloseTo(0, 0);
  expect(before.slideRectWithinIframe.top).toBeCloseTo(0, 0);
  expect(before.slideRectWithinIframe.right).toBeCloseTo(760, 0);
  expect(before.slideRectWithinIframe.bottom).toBeCloseTo(450, 0);
  expect(before.fullscreen).toEqual({
    active: false,
    fullscreenElementTagName: null,
    fullscreenElementClassName: null,
    fullscreenElementIsPresentIframe: null,
    fullscreenElementContainsPresentIframe: null,
  });

  await fixturePage.locator("#request-fullscreen-btn").click();
  await fixturePage.waitForFunction(() => !!document.fullscreenElement);

  const after = await fixturePage.evaluate(() => window.captureGoogleSlidesDom());
  expect(after.fullscreen.active).toBe(true);
  expect(after.fullscreen.fullscreenElementTagName).toBe("DIV");
  expect(after.fullscreen.fullscreenElementIsPresentIframe).toBe(false);
  expect(after.fullscreen.fullscreenElementContainsPresentIframe).toBe(true);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx playwright test capture-script-sanity`
Expected: FAIL — `page.addScriptTag` errors because
`docs/manual_tests/capture_real_google_slides_dom.js` doesn't exist yet.

- [ ] **Step 3: Write the capture script**

Create `docs/manual_tests/capture_real_google_slides_dom.js`:

```js
// Paste this into DevTools console while a Google Slides presentation is
// in Present mode (windowed or fullscreen) to capture the DOM facts
// recorded in docs/google_slides_dom_assumptions.md.
//
// After running, use DevTools' `copy(result)` to copy the JSON to your
// clipboard, then save it as
// docs/manual_tests/captures/YYYY-MM-DD-<windowed|fullscreen>.json — see
// docs/manual_tests.md's "Verifying fixture assumptions against real
// Google Slides" section for the full procedure.
function captureGoogleSlidesDom() {
  function findA11yElement() {
    const candidates = [{ doc: document, hostIframeClassName: null }];
    for (const iframe of document.querySelectorAll("iframe")) {
      try {
        if (iframe.contentDocument) {
          candidates.push({
            doc: iframe.contentDocument,
            hostIframeClassName: iframe.className || null,
          });
        }
      } catch (e) {
        // cross-origin iframe — skip
      }
    }
    for (const { doc, hostIframeClassName } of candidates) {
      const el = doc.querySelector('.punch-viewer-svgpage-a11yelement[aria-label*="Slide"]');
      if (el) {
        return {
          found: true,
          ariaLabel: el.getAttribute("aria-label"),
          className: el.className,
          hostIframeClassName,
        };
      }
    }
    return { found: false, ariaLabel: null, className: null, hostIframeClassName: null };
  }

  function findPresentIframe() {
    const iframe = document.querySelector("iframe.punch-present-iframe");
    if (!iframe) {
      return { found: false, className: null, rect: null };
    }
    const rect = iframe.getBoundingClientRect();
    return {
      found: true,
      className: iframe.className,
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
    };
  }

  function findSlideRectWithinIframe() {
    const iframe = document.querySelector("iframe.punch-present-iframe");
    if (!iframe) return null;
    let idoc;
    try {
      idoc = iframe.contentDocument;
    } catch (e) {
      return null;
    }
    if (!idoc) return null;
    const slideEl = idoc.querySelector('.punch-viewer-svgpage-a11yelement[aria-label*="Slide"]');
    if (!slideEl) return null;
    const r = slideEl.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }

  function findFullscreenInfo() {
    const el = document.fullscreenElement;
    if (!el) {
      return {
        active: false,
        fullscreenElementTagName: null,
        fullscreenElementClassName: null,
        fullscreenElementIsPresentIframe: null,
        fullscreenElementContainsPresentIframe: null,
      };
    }
    const presentIframe = document.querySelector("iframe.punch-present-iframe");
    return {
      active: true,
      fullscreenElementTagName: el.tagName,
      fullscreenElementClassName: el.className,
      fullscreenElementIsPresentIframe: presentIframe ? el === presentIframe : null,
      fullscreenElementContainsPresentIframe: presentIframe ? el.contains(presentIframe) : null,
    };
  }

  return {
    capturedAt: new Date().toISOString(),
    url: window.location.href,
    a11yElement: findA11yElement(),
    presentIframe: findPresentIframe(),
    slideRectWithinIframe: findSlideRectWithinIframe(),
    fullscreen: findFullscreenInfo(),
  };
}

const result = captureGoogleSlidesDom();
result;
```

- [ ] **Step 4: Run it again, verify it passes**

Run: `npx playwright test capture-script-sanity`
Expected: PASS

- [ ] **Step 5: Run the full e2e suite, verify nothing else broke**

Run: `npm run test:e2e`
Expected: PASS — all 7 specs (the 4 pre-existing, `overlay-windowed-position`,
`overlay-fullscreen-position`, and the new `capture-script-sanity`) pass.

- [ ] **Step 6: Commit**

```bash
git add docs/manual_tests/capture_real_google_slides_dom.js tests/e2e/capture-script-sanity.spec.js
git commit -m "test: add Google Slides DOM capture script with a local-fixture sanity check"
```

---

## Task 3: Human procedure and trigger comments

**Files:**
- Modify: `docs/manual_tests.md`
- Modify: `adapters/google_slides.js`
- Modify: `content/content.js`

**Interfaces:** None — this task only adds documentation and comments; no
code behavior changes.

- [ ] **Step 1: Add the capture-and-compare procedure to `docs/manual_tests.md`**

In `docs/manual_tests.md`, after the `## Deliberately out of scope` section
(at the end of the file), add:

```markdown

## Verifying fixture assumptions against real Google Slides

The e2e fixtures (`tests/e2e/fixtures/windowed-slide.html`,
`slide-frame.html`) simulate Google Slides' presentation DOM based on
assumptions listed in `docs/google_slides_dom_assumptions.md`. Nobody has
automated a way to check those assumptions against the real thing — same
login-flow blocker as everything else in "Deliberately out of scope" above
— so this is a manual procedure:

1. Open a real Google Slides presentation you own, start Present
   (windowed, not fullscreen).
2. Open DevTools console, paste the contents of
   `docs/manual_tests/capture_real_google_slides_dom.js`, run it.
3. Run `copy(result)` in the console, then save the clipboard contents as
   `docs/manual_tests/captures/YYYY-MM-DD-windowed.json` (create the
   `captures/` directory if it doesn't exist yet).
4. Enter fullscreen present mode, re-run the same script (paste it again
   — DevTools doesn't persist state across a fullscreen transition), and
   save as `docs/manual_tests/captures/YYYY-MM-DD-fullscreen.json`.
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
```

- [ ] **Step 2: Extend the `BRITTLE` comment in `adapters/google_slides.js`**

In `adapters/google_slides.js`, find the existing comment block (currently
ending with):

```
 * BRITTLE: depends on Google Slides DOM structure. When this test starts
 * failing, update the selector here and the fixture in
 * tests/fixtures/google_slides_dom.html to match the new structure.
 */
```

Replace it with:

```
 * BRITTLE: depends on Google Slides DOM structure. When this test starts
 * failing, update the selector here and the fixture in
 * tests/fixtures/google_slides_dom.html to match the new structure.
 *
 * If you change this selector, also re-run the capture-and-compare
 * procedure in docs/manual_tests.md ("Verifying fixture assumptions
 * against real Google Slides") before merging, and update this
 * assumption's row in docs/google_slides_dom_assumptions.md.
 */
```

- [ ] **Step 3: Add a trigger comment near `content.js`'s `fullscreenchange` listener**

In `content/content.js`, immediately before the existing
`document.addEventListener("fullscreenchange", ...)` block (content.js:158),
add:

```js
// Assumes document.fullscreenElement is safe to appendChild into when
// Google Slides enters fullscreen present mode — true for a wrapping
// element, but NOT for the bare presentation iframe itself (an <iframe>
// never renders light-DOM children appended to it). Whether real Google
// Slides fullscreens the bare iframe or a wrapper is currently unconfirmed
// — see docs/google_slides_dom_assumptions.md, assumption #4. If you
// change this listener, re-run the capture-and-compare procedure in
// docs/manual_tests.md before merging, and update that assumption's row.
```

so the full block reads:

```js
// Assumes document.fullscreenElement is safe to appendChild into when
// Google Slides enters fullscreen present mode — true for a wrapping
// element, but NOT for the bare presentation iframe itself (an <iframe>
// never renders light-DOM children appended to it). Whether real Google
// Slides fullscreens the bare iframe or a wrapper is currently unconfirmed
// — see docs/google_slides_dom_assumptions.md, assumption #4. If you
// change this listener, re-run the capture-and-compare procedure in
// docs/manual_tests.md before merging, and update that assumption's row.
document.addEventListener("fullscreenchange", () => {
  const overlay = document.getElementById("speechwave-overlay");
  if (!overlay) return;
  if (document.fullscreenElement) {
    document.fullscreenElement.appendChild(overlay);
  } else {
    document.body.appendChild(overlay);
  }
});
```

- [ ] **Step 4: Run the full test suites, verify nothing broke**

Run: `npm test && npm run test:e2e`
Expected: PASS — comment-only changes to `adapters/google_slides.js` and
`content/content.js` don't affect behavior; all Jest and e2e tests remain
green.

- [ ] **Step 5: Commit**

```bash
git add docs/manual_tests.md adapters/google_slides.js content/content.js
git commit -m "docs: document Slides fixture verification procedure and trigger comments"
```
