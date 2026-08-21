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
