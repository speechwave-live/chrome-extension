# Google Slides Edit-View Overlay Anchoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Speechwave overlay anchor to the real editing canvas when a presenter shows Google Slides directly from the editor (`/edit` URL, no Present click), instead of falling back to sizing off the full browser viewport.

**Architecture:** Add one more layer to `content.js`'s existing present-mode fallback chain (`getPresentIframe()` → `getSlideRect()`/iframe rect → now `getEditCanvasRect()` → viewport fallback). No other files' runtime behavior changes — `adapters/google_slides.js` is untouched, per the design doc's decision to drop edit-view slide-number detection (filmstrip virtualization on large decks broke the planned DOM-order ordinal approach, with no viable substitute found).

**Tech Stack:** Vanilla browser JS (`content.js`), Jest + jsdom for unit tests, Playwright for the e2e test.

## Global Constraints

- Conventional commit format for all commits.
- Never use git worktrees — use feature branches instead.
- `adapters/google_slides.js` is not touched by this plan — slide-number detection for edit view was explicitly dropped (see `docs/specs/2026-08-21-google-slides-edit-view-support-design.md`).
- The new edit-view canvas detection is an additional fallback layer, not a replacement: `syncOverlayPosition`'s existing viewport-fallback `else` branch must remain reachable (when neither a present iframe nor `#canvas-container` is found) and byte-for-byte unchanged.

---

## Task 1: `getEditCanvasRect` + `syncOverlayPosition` fallback layer, with Jest coverage

**Files:**
- Modify: `content/content.js:59-95` (add `getEditCanvasRect`, change `syncOverlayPosition`'s `rect` computation)
- Modify: `tests/content.test.js` (hoist `addPresentIframe` to module scope, add `addCanvasContainer`, add a new describe block)

**Interfaces:**
- Consumes: nothing new — uses existing `remoteConfig`, `round2`, `OVERLAY_MAX_Z_INDEX` already in `content.js`.
- Produces: `getEditCanvasRect()` (no params, returns a `DOMRect`-shaped object or `null`), used only within `syncOverlayPosition`. `addCanvasContainer(rect)` test helper (same shape as the existing `addPresentIframe(rect)`), for Task 2's e2e test author to reference if useful, though Task 2 doesn't reuse it directly (e2e tests build fixtures as static HTML, not jsdom mocks).

- [ ] **Step 1: Hoist `addPresentIframe` to module scope**

In `tests/content.test.js`, `addPresentIframe` is currently declared inside the `describe("overlay sizing: percent of the slide's actual dimensions", ...)` block (right after the `FULL_TUNING` constant, before that describe call). Move its declaration out of that describe block to module scope, immediately after the `FULL_TUNING` constant definition, so a new sibling describe block can also call it. Do not change its body — this is a pure move, no behavior change.

Run: `npm test -- content.test.js`
Expected: PASS (all existing tests still pass — this step only moves code, changes nothing else)

- [ ] **Step 2: Write the failing tests**

Add a new describe block to `tests/content.test.js`, after the existing `describe("overlay sizing: percent of the slide's actual dimensions", ...)` block:

```js
describe("overlay sizing: edit-view canvas anchoring", () => {
  function addCanvasContainer(rect) {
    const el = document.createElement("div");
    el.id = "canvas-container";
    el.getBoundingClientRect = jest.fn().mockReturnValue(rect);
    document.body.appendChild(el);
    return el;
  }

  test("anchors to canvas-container's rect when no present iframe is found", () => {
    addCanvasContainer({ left: 0, top: 0, right: 800, bottom: 450, width: 800, height: 450 });
    loadContent();

    const overlay = document.getElementById("speechwave-overlay");
    // DEFAULT_CONFIG.settings.overlay_size_percent = 20
    expect(overlay.style.width).toBe("160px"); // 800 * 0.2
    expect(overlay.style.height).toBe("90px"); // 450 * 0.2
    // left: 800 - 160 - 8 (margin) = 632; top: 450 - 90 - 8 = 352
    expect(overlay.style.left).toBe("632px");
    expect(overlay.style.top).toBe("352px");
    expect(overlay.style.right).toBe("");
    expect(overlay.style.bottom).toBe("");
  });

  test("present iframe takes priority over canvas-container when both exist", () => {
    addPresentIframe({ left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500 });
    addCanvasContainer({ left: 0, top: 0, right: 800, bottom: 450, width: 800, height: 450 });
    loadContent();

    const overlay = document.getElementById("speechwave-overlay");
    // 1000 * 0.2 = 200, from the iframe's rect — not canvas-container's 800 * 0.2 = 160
    expect(overlay.style.width).toBe("200px");
  });
});
```

The pre-existing `"falls back to a fixed viewport corner (tuning margin)
when no presentation iframe is present"` test (in the sibling describe
block above, unmodified by this task) already guards the untouched
no-detection case — no need to duplicate those same assertions here.

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `npm test -- content.test.js`
Expected: the first test ("anchors to canvas-container's rect...") FAILs — `content.js` doesn't look at `#canvas-container` yet, so with no present iframe it falls through to the viewport-fallback branch instead (wrong width/height/left/top). The second test ("present iframe takes priority...") already PASSes even before this change — the present iframe alone already drives `rect` today, since canvas-container isn't consulted at all yet; that test exists to guard the fallback *ordering* going forward, not to prove new behavior. Confirm the first genuinely fails and the second genuinely passes before proceeding.

- [ ] **Step 4: Implement `getEditCanvasRect` and update `syncOverlayPosition`**

In `content/content.js`, add this function immediately after `getSlideRect` (after line 91, before `function syncOverlayPosition`):

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

Then in `syncOverlayPosition` (currently line 95), change:
```js
const rect = iframe && (getSlideRect(iframe) || iframe.getBoundingClientRect());
```
to:
```js
const rect = (iframe && (getSlideRect(iframe) || iframe.getBoundingClientRect())) || getEditCanvasRect();
```

Do not change anything else in `syncOverlayPosition` — the `if (rect) {...} else {...}` branches, the percent/margin math, and the viewport-fallback `else` branch all stay exactly as they are; they're already generic over "the current rect" regardless of which layer produced it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- content.test.js`
Expected: PASS (all tests, including the two new ones)

Then run the full suite once:
Run: `npm test`
Expected: PASS (all suites — this change is confined to `content.js`/`content.test.js`, but confirm nothing elsewhere regressed)

- [ ] **Step 6: Commit**

```bash
git add content/content.js tests/content.test.js
git commit -m "feat: anchor overlay to canvas-container in Google Slides edit view"
```

---

## Task 2: E2E verification and docs update

**Files:**
- Create: `tests/e2e/fixtures/editview-canvas.html`
- Modify: `tests/e2e/support/fixture.js` (add `openEditViewCanvasFixturePage`)
- Modify: `tests/e2e/support/fixture-server.js` (add the new fixture's route)
- Create: `tests/e2e/overlay-editview-position.spec.js`
- Modify: `docs/manual_tests.md` (add an entry to the "What's covered" list)

**Interfaces:**
- Consumes: `FIXTURE_PORT` from `tests/e2e/support/constants.js`; `test`/`expect` from `tests/e2e/support/extension-fixtures.js`.
- Produces: `openEditViewCanvasFixturePage(context)` (same signature/behavior as the existing `openWindowedFixturePage`), for any future edit-view e2e test to reuse.

- [ ] **Step 1: Create the fixture page**

Create `tests/e2e/fixtures/editview-canvas.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Speechwave e2e fixture — edit-view canvas stand-in</title>
  <style>
    body { margin: 0; }
    #canvas-container {
      position: absolute;
      left: 100px;
      top: 50px;
      width: 800px;
      height: 450px;
    }
  </style>
</head>
<body>
  <div id="canvas-container"></div>
</body>
</html>
```

- [ ] **Step 2: Add the fixture-opener helper and its route**

In `tests/e2e/support/fixture.js`, add:
```js
async function openEditViewCanvasFixturePage(context) {
  const fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/editview-canvas.html`);
  await expect(fixturePage.locator("#speechwave-overlay")).toBeVisible();
  return fixturePage;
}
```
And update the final line to:
```js
module.exports = { openFixturePage, openWindowedFixturePage, openEditViewCanvasFixturePage };
```

In `tests/e2e/support/fixture-server.js`, add to the `ROUTES` map:
```js
"/editview-canvas.html": "editview-canvas.html",
```

- [ ] **Step 3: Write the e2e test**

Create `tests/e2e/overlay-editview-position.spec.js`:

```js
const { test, expect } = require("./support/extension-fixtures");
const { openEditViewCanvasFixturePage } = require("./support/fixture");

test("overlay anchors to canvas-container's rect in Google Slides edit view, not the full viewport", async ({
  context,
}) => {
  const fixturePage = await openEditViewCanvasFixturePage(context);

  const overlay = fixturePage.locator("#speechwave-overlay");
  const box = await overlay.boundingBox();

  // #canvas-container is 800x450 at (100,50) -> getBoundingClientRect()
  // gives { left: 100, top: 50, right: 900, bottom: 500 }. Default
  // overlay_size_percent is 20, overlay_margin_px is 8 (same defaults the
  // Jest present-mode tests use) — same percent-of-rect math as the
  // present-mode iframe case, applied to this rect instead.
  expect(box.width).toBeCloseTo(160, 0); // 800 * 0.2
  expect(box.height).toBeCloseTo(90, 0); // 450 * 0.2
  // left: rect.right (900) - width (160) - margin (8) = 732
  expect(box.x).toBeCloseTo(732, 0);
  // top: rect.bottom (500) - height (90) - margin (8) = 402
  expect(box.y).toBeCloseTo(402, 0);
});
```

- [ ] **Step 4: Run the e2e test to verify it passes**

Run: `npm run test:e2e -- overlay-editview-position`
Expected: PASS

- [ ] **Step 5: Update the e2e docs inventory**

In `docs/manual_tests.md`, add a new entry to the `## What's covered` list (after the existing `overlay-fullscreen-position.spec.js` entry, before `capture-script-sanity.spec.js`'s entry):

```markdown
- **`overlay-editview-position.spec.js`** — a fixture simulating Google
  Slides edit view (`#canvas-container` at a known rect, no presentation
  iframe) → asserts `#speechwave-overlay` anchors to that rect instead of
  the full browser viewport.
```

- [ ] **Step 6: Run the full test suite once more**

Run: `npm test && npm run test:e2e`
Expected: PASS (both suites, in full)

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/fixtures/editview-canvas.html tests/e2e/support/fixture.js tests/e2e/support/fixture-server.js tests/e2e/overlay-editview-position.spec.js docs/manual_tests.md
git commit -m "test: add e2e coverage for edit-view overlay anchoring"
```
