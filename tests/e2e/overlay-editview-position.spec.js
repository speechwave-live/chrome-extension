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
