# Google Slides Edit-View DOM Recon Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a DevTools-pasteable recon script that captures a bounded structural skeleton of Google Slides' edit-view DOM, so a human capture (Phase 2, not part of this plan) can be reviewed to find the real selectors for the editing-canvas region and the current-slide filmstrip indicator.

**Architecture:** A single self-contained script (`docs/manual_tests/capture_google_slides_edit_dom.js`), following the existing `capture_real_google_slides_dom.js`'s conventions exactly (top-level `function` declaration, `copy(result)`-to-clipboard workflow). It does a fast-check for a specific `div#canvas-container` hunch, plus a general depth/fan-out/size-bounded walk of the whole page (and any same-origin iframes) so no selectors need to be guessed up front. Validated by a Playwright e2e sanity test against a synthetic fixture page — the same fixture/capture-script split already used for the present-mode investigation.

**Tech Stack:** Vanilla browser JS (no build step — pasted directly into DevTools or injected via Playwright's `addScriptTag`), Playwright for the e2e sanity test, plain HTML/CSS/JS for the fixture page.

## Global Constraints

- Conventional commit format for all commits (user's global convention).
- Never use git worktrees — use feature branches instead (project `CLAUDE.md`).
- The capture script's entry point must be a top-level `function` declaration (not `const`/arrow function, not wrapped in an IIFE) — Playwright's `addScriptTag` + the sanity test call `window.captureGoogleSlidesEditDom()` directly, and only a `function` declaration attaches to `window` this way. This is the same constraint the existing `capture_real_google_slides_dom.js` documents and depends on.
- No product code (`content.js`, `adapters/google_slides.js`) changes in this plan — this plan is Phase 1 (recon tooling) only, per `docs/specs/2026-08-21-google-slides-edit-view-recon-design.md`.

---

## Task 1: Edit-view DOM recon script, fixture, and sanity test

**Files:**
- Create: `tests/e2e/fixtures/edit-view.html`
- Modify: `tests/e2e/support/fixture.js`
- Create: `tests/e2e/capture-script-edit-dom-sanity.spec.js`
- Create: `docs/manual_tests/capture_google_slides_edit_dom.js`

**Interfaces:**
- Consumes: `FIXTURE_PORT` from `tests/e2e/support/constants.js` (already `8973`); the `test`/`expect` re-exports from `tests/e2e/support/extension-fixtures.js`; Playwright's `context.newPage()`/`page.addScriptTag()`/`page.evaluate()`.
- Produces: `window.captureGoogleSlidesEditDom()` (browser global, defined in the new script) returning `{ capturedAt, url, viewport: {width, height}, canvasContainer: {found, tagName, className, rect}, domRoots: [{hostIframeClassName, root}], truncated }`, where each `root`/tree node has shape `{ tag, id, class, attrs, rect: {left, top, right, bottom}, style, children: [...], childCount?, childrenOmitted? }`. Also produces `openEditViewFixturePage(context)` (exported from `tests/e2e/support/fixture.js`, same signature/behavior as the existing `openWindowedFixturePage`).

- [ ] **Step 1: Create the edit-view fixture page**

Create `tests/e2e/fixtures/edit-view.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Speechwave e2e fixture — edit-view stand-in</title>
  <style>
    body { margin: 0; }
    #canvas-container {
      position: absolute;
      left: 220px;
      top: 80px;
      width: 800px;
      height: 450px;
    }
    #canvas-container svg { width: 100%; height: 100%; }
    #filmstrip {
      position: absolute;
      left: 0;
      top: 80px;
      width: 200px;
    }
    #filmstrip svg { display: block; width: 160px; height: 90px; margin: 8px auto; }
    .hidden-menu { display: none; }
  </style>
</head>
<body>
  <!-- Stands in for the editing canvas — see the div#canvas-container
       hunch in docs/specs/2026-08-21-google-slides-edit-view-recon-design.md. -->
  <div id="canvas-container">
    <svg viewBox="0 0 800 450">
      <g>
        <rect width="800" height="450" fill="#fff" stroke="#000"/>
        <text x="20" y="40">Slide content</text>
      </g>
    </svg>
  </div>

  <!-- Stands in for the filmstrip. Each thumbnail's class stays identical
       ("thumb") regardless of selection — only the thumb-border rect's
       stroke changes — deliberately mirroring the "no semantic marker,
       only a visible stroke difference" case from the design doc, so the
       sanity test proves the recon script's computed-style capture (not
       just class-name capture) is what would actually distinguish the
       selected slide. -->
  <div id="filmstrip">
    <svg class="thumb" data-slide-index="0"><rect class="thumb-border" width="160" height="90" fill="#eee"/></svg>
    <svg class="thumb" data-slide-index="1"><rect class="thumb-border" width="160" height="90" fill="#eee"/></svg>
    <svg class="thumb" data-slide-index="2"><rect class="thumb-border" width="160" height="90" fill="#eee"/></svg>
    <svg class="thumb" data-slide-index="3"><rect class="thumb-border" width="160" height="90" fill="#eee"/></svg>
  </div>

  <!-- Zero-size decoy: should never appear in a capture, proving the
       zero-size filter works without needing to know real Slides' hidden
       menu selectors. -->
  <div class="hidden-menu">
    <div><div><div><div><div>decoy</div></div></div></div></div>
  </div>

  <script>
    function selectThumbnail(index) {
      document.querySelectorAll("#filmstrip .thumb .thumb-border").forEach((rect, i) => {
        if (i === index) {
          rect.setAttribute("stroke", "#1a73e8");
          rect.setAttribute("stroke-width", "3");
        } else {
          rect.setAttribute("stroke", "#ccc");
          rect.setAttribute("stroke-width", "1");
        }
      });
    }
    window.selectThumbnail = selectThumbnail;
    selectThumbnail(0); // slide 1 selected by default, matching a freshly opened deck

    // Wide fan-out decoy: exercises the recon script's per-side child cap.
    const wideDecoy = document.createElement("div");
    wideDecoy.id = "wide-decoy";
    for (let i = 0; i < 30; i++) {
      const child = document.createElement("span");
      child.style.cssText = "display:inline-block;width:2px;height:2px;";
      wideDecoy.appendChild(child);
    }
    document.body.appendChild(wideDecoy);

    // Deeply nested decoy: exercises the recon script's global depth cap.
    const deepDecoy = document.createElement("div");
    deepDecoy.id = "deep-decoy";
    deepDecoy.style.cssText = "width:1px;height:1px;";
    let cursor = deepDecoy;
    for (let i = 0; i < 25; i++) {
      const child = document.createElement("div");
      child.style.cssText = "width:1px;height:1px;";
      cursor.appendChild(child);
      cursor = child;
    }
    document.body.appendChild(deepDecoy);
  </script>
</body>
</html>
```

- [ ] **Step 2: Add the fixture-opener helper**

Modify `tests/e2e/support/fixture.js` — add an `openEditViewFixturePage` function alongside the existing ones, and export it:

```js
async function openEditViewFixturePage(context) {
  const fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/edit-view.html`);
  await expect(fixturePage.locator("#speechwave-overlay")).toBeVisible();
  return fixturePage;
}
```

And update the final line to:

```js
module.exports = { openFixturePage, openWindowedFixturePage, openEditViewFixturePage };
```

- [ ] **Step 3: Write the failing sanity test**

Create `tests/e2e/capture-script-edit-dom-sanity.spec.js`:

```js
const path = require("path");
const { test, expect } = require("./support/extension-fixtures");
const { openEditViewFixturePage } = require("./support/fixture");

const CAPTURE_SCRIPT_PATH = path.join(
  __dirname,
  "..",
  "..",
  "docs",
  "manual_tests",
  "capture_google_slides_edit_dom.js"
);

function findNode(root, predicate) {
  if (!root) return null;
  if (predicate(root)) return root;
  for (const child of root.children) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

function findThumbBorder(root, slideIndex) {
  const svgNode = findNode(
    root,
    (n) => n.tag === "svg" && n.attrs["data-slide-index"] === String(slideIndex)
  );
  if (!svgNode) return null;
  return svgNode.children.find((c) => c.tag === "rect" && c.class === "thumb-border") || null;
}

test("edit-dom capture script reports a bounded skeleton against the local edit-view fixture", async ({
  context,
}) => {
  const fixturePage = await openEditViewFixturePage(context);
  await fixturePage.addScriptTag({ path: CAPTURE_SCRIPT_PATH });

  const before = await fixturePage.evaluate(() => window.captureGoogleSlidesEditDom());

  expect(before.viewport.width).toBeGreaterThan(0);
  expect(before.viewport.height).toBeGreaterThan(0);
  expect(before.truncated).toBe(false);

  // Fast-check for the div#canvas-container hunch.
  expect(before.canvasContainer.found).toBe(true);
  expect(before.canvasContainer.tagName).toBe("DIV");
  expect(before.canvasContainer.rect.left).toBeCloseTo(220, 0);
  expect(before.canvasContainer.rect.top).toBeCloseTo(80, 0);
  expect(before.canvasContainer.rect.right).toBeCloseTo(1020, 0);
  expect(before.canvasContainer.rect.bottom).toBeCloseTo(530, 0);

  const bodyRoot = before.domRoots[0].root;

  // Selection is only distinguishable by computed stroke, not class name —
  // proves the script's style capture (not just class capture) is what's
  // needed to spot the real filmstrip's current-slide indicator.
  const thumb0 = findThumbBorder(bodyRoot, 0);
  const thumb1 = findThumbBorder(bodyRoot, 1);
  expect(thumb0.class).toBe(thumb1.class);
  expect(thumb0.style.stroke).toBe("rgb(26, 115, 232)");
  expect(thumb1.style.stroke).toBe("rgb(204, 204, 204)");
  expect(thumb0.style.strokeWidth).not.toBe(thumb1.style.strokeWidth);

  // Re-capture after changing the selection — validates the two-capture
  // diff workflow the manual procedure relies on.
  await fixturePage.evaluate(() => window.selectThumbnail(2));
  const after = await fixturePage.evaluate(() => window.captureGoogleSlidesEditDom());
  const afterRoot = after.domRoots[0].root;
  expect(findThumbBorder(afterRoot, 2).style.stroke).toBe("rgb(26, 115, 232)");
  expect(findThumbBorder(afterRoot, 0).style.stroke).toBe("rgb(204, 204, 204)");

  // Wide fan-out cap.
  const wideDecoyNode = findNode(bodyRoot, (n) => n.id === "wide-decoy");
  expect(wideDecoyNode).not.toBeNull();
  expect(wideDecoyNode.children.length).toBe(20);
  expect(wideDecoyNode.childrenOmitted).toBe(10);

  // Global depth cap — walk the single-child chain until it stops, and
  // confirm it stopped because of the cap (childCount set), not because
  // it's a genuine leaf, and that it stopped well short of the fixture's
  // real 25-level depth.
  let cursor = findNode(bodyRoot, (n) => n.id === "deep-decoy");
  expect(cursor).not.toBeNull();
  let steps = 0;
  while (cursor.children.length > 0) {
    cursor = cursor.children[0];
    steps++;
    expect(steps).toBeLessThan(25);
  }
  expect(cursor.childCount).toBe(1);

  // Zero-size filter — the hidden menu and its descendants never appear.
  expect(findNode(bodyRoot, (n) => n.class === "hidden-menu")).toBeNull();
});
```

- [ ] **Step 4: Run the test and confirm it fails**

Run: `npm run test:e2e -- capture-script-edit-dom-sanity`
Expected: FAIL — `capture_google_slides_edit_dom.js` doesn't exist yet, so `addScriptTag` throws (file not found) or `window.captureGoogleSlidesEditDom` is undefined.

- [ ] **Step 5: Implement the recon script**

Create `docs/manual_tests/capture_google_slides_edit_dom.js`:

```js
// Paste this into DevTools console while a Google Slides presentation is
// open in edit view (NOT in Present mode) to capture a bounded structural
// skeleton of the DOM, for manual review while hunting for the edit-view
// canvas and current-slide-indicator selectors tracked as open questions
// in docs/specs/2026-08-21-google-slides-edit-view-recon-design.md.
//
// After running, use DevTools' `copy(result)` to copy the JSON to your
// clipboard — see docs/manual_tests.md's "Verifying Google Slides edit-view
// DOM structure" section for the full procedure.
//
// NOTE: tests/e2e/capture-script-edit-dom-sanity.spec.js calls
// window.captureGoogleSlidesEditDom() directly after injecting this file
// via a classic <script> tag, so captureGoogleSlidesEditDom must stay a
// top-level `function` declaration — not wrapped in an IIFE, not a
// `const`/arrow function — or it won't attach to `window` and that test
// will fail.
function captureGoogleSlidesEditDom() {
  // Safety valve for the whole walk (top document + any same-origin
  // iframes) — if a page's DOM is too large to fully enumerate, stop and
  // flag it rather than silently returning a partial tree.
  const MAX_NODES = 5000;
  // Global tree-depth cap (from the document/iframe body) so a deeply
  // nested chain of wrapper divs (Google's editor toolbar/menu DOM is
  // notoriously deep) can't blow up the capture.
  const MAX_DEPTH = 20;
  // Once inside an <svg>, Slides renders slide text/shapes as vector
  // paths — a content SVG could otherwise dump thousands of glyph nodes.
  // Stop descending after this many levels past the <svg> tag itself.
  const MAX_SVG_DEPTH = 2;
  // For a node with more children than this (counted per side), record
  // only the first/last N plus a count of the rest — keeps a many-slide
  // filmstrip from dumping every thumbnail.
  const MAX_CHILDREN_SHOWN = 10;

  function findCanvasContainer() {
    const el = document.getElementById("canvas-container");
    if (!el) {
      return { found: false, tagName: null, className: null, rect: null };
    }
    const r = el.getBoundingClientRect();
    return {
      found: true,
      tagName: el.tagName,
      // getAttribute, not .className — if el turns out to be an SVG
      // element, .className returns an SVGAnimatedString, not a plain
      // string, and JSON-serializing it silently produces {}. Same
      // precaution the present-mode capture script documents.
      className: el.getAttribute("class"),
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
    };
  }

  function borderStyleOf(el) {
    const cs = getComputedStyle(el);
    const style = {};
    if (cs.border && cs.border !== "0px none rgb(0, 0, 0)") style.border = cs.border;
    if (cs.outlineStyle && cs.outlineStyle !== "none") style.outline = cs.outline;
    if (cs.boxShadow && cs.boxShadow !== "none") style.boxShadow = cs.boxShadow;
    if (el instanceof SVGElement) {
      if (cs.stroke && cs.stroke !== "none") style.stroke = cs.stroke;
      if (cs.strokeWidth) style.strokeWidth = cs.strokeWidth;
    }
    return style;
  }

  function attrsOf(el) {
    const attrs = {};
    for (const attr of el.attributes) {
      if (attr.name === "class" || attr.name === "id" || attr.name === "style") continue;
      if (attr.name.startsWith("aria-") || attr.name.startsWith("data-") || attr.name === "role") {
        attrs[attr.name] = attr.value;
      }
    }
    return attrs;
  }

  function isRendered(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 || r.height > 0;
  }

  let visited = 0;
  let truncated = false;

  function skeletonize(el, depth, svgDepth) {
    if (truncated) return null;
    if (visited >= MAX_NODES) {
      truncated = true;
      return null;
    }
    visited++;

    const tag = el.tagName.toLowerCase();
    const inSvg = svgDepth > 0 || tag === "svg";
    const nextSvgDepth = tag === "svg" ? 1 : inSvg ? svgDepth + 1 : 0;

    const r = el.getBoundingClientRect();
    const node = {
      tag,
      id: el.id || null,
      class: el.getAttribute("class") || null,
      attrs: attrsOf(el),
      rect: {
        left: Math.round(r.left),
        top: Math.round(r.top),
        right: Math.round(r.right),
        bottom: Math.round(r.bottom),
      },
      style: borderStyleOf(el),
      children: [],
    };

    const atGlobalDepthLimit = depth >= MAX_DEPTH;
    const atSvgDepthLimit = inSvg && svgDepth >= MAX_SVG_DEPTH;
    if (atGlobalDepthLimit || atSvgDepthLimit) {
      node.childCount = el.children.length;
      return node;
    }

    const renderedChildren = Array.from(el.children).filter(isRendered);
    const total = renderedChildren.length;

    if (total > MAX_CHILDREN_SHOWN * 2) {
      const firstN = renderedChildren.slice(0, MAX_CHILDREN_SHOWN);
      const lastN = renderedChildren.slice(-MAX_CHILDREN_SHOWN);
      node.children = [...firstN, ...lastN]
        .map((c) => skeletonize(c, depth + 1, nextSvgDepth))
        .filter(Boolean);
      node.childrenOmitted = total - firstN.length - lastN.length;
    } else {
      node.children = renderedChildren
        .map((c) => skeletonize(c, depth + 1, nextSvgDepth))
        .filter(Boolean);
    }

    return node;
  }

  const domRoots = [{ hostIframeClassName: null, root: skeletonize(document.body, 0, 0) }];
  for (const iframe of document.querySelectorAll("iframe")) {
    try {
      if (iframe.contentDocument && iframe.contentDocument.body) {
        domRoots.push({
          hostIframeClassName: iframe.getAttribute("class") || null,
          root: skeletonize(iframe.contentDocument.body, 0, 0),
        });
      }
    } catch (e) {
      // cross-origin iframe — skip
    }
  }

  return {
    capturedAt: new Date().toISOString(),
    url: window.location.href,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    canvasContainer: findCanvasContainer(),
    domRoots,
    truncated,
  };
}

const result = captureGoogleSlidesEditDom();
result;
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `npm run test:e2e -- capture-script-edit-dom-sanity`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/fixtures/edit-view.html tests/e2e/support/fixture.js tests/e2e/capture-script-edit-dom-sanity.spec.js docs/manual_tests/capture_google_slides_edit_dom.js
git commit -m "test: add edit-view DOM recon capture script and sanity test"
```

---

## Task 2: Document the manual capture procedure

**Files:**
- Modify: `docs/manual_tests.md` (append after the existing "Verifying fixture assumptions against real Google Slides" section, currently ending at line 130)

**Interfaces:**
- Consumes: `docs/manual_tests/capture_google_slides_edit_dom.js` (Task 1), `docs/specs/2026-08-21-google-slides-edit-view-recon-design.md` (already committed).
- Produces: nothing consumed by later tasks — this plan's final deliverable.

- [ ] **Step 1: Append the new procedure section**

Modify `docs/manual_tests.md` — add this section at the end of the file (after the existing "Captures get committed to git, so the ledger's..." closing line):

```markdown

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
```

- [ ] **Step 2: Read the diff to confirm formatting**

Run: `git diff docs/manual_tests.md`
Expected: a clean append with correct Markdown heading/list formatting, no stray blank-line issues at the seam with the prior section.

- [ ] **Step 3: Commit**

```bash
git add docs/manual_tests.md
git commit -m "docs: add edit-view DOM capture procedure"
```
