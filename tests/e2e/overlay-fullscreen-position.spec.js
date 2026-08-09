const { test, expect } = require("./support/extension-fixtures");
const { openWindowedFixturePage } = require("./support/fixture");

test("overlay stays correctly positioned after Google Slides fullscreen present mode reparents it into the top layer", async ({
  context,
}) => {
  const fixturePage = await openWindowedFixturePage(context);

  // Measured via page.evaluate() calling getBoundingClientRect() directly,
  // not Playwright's locator().boundingBox() — the latter returns null for
  // elements reparented into the browser's fullscreen "top layer".
  const measureOverlayBox = () =>
    fixturePage.evaluate(() => {
      const el = document.getElementById("speechwave-overlay");
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });

  const beforeBox = await measureOverlayBox();

  await fixturePage.locator("#request-fullscreen-btn").click();
  await fixturePage.waitForFunction(() => !!document.fullscreenElement);

  const reparented = await fixturePage.evaluate(() => {
    const overlay = document.getElementById("speechwave-overlay");
    return overlay.parentElement === document.fullscreenElement;
  });
  expect(reparented).toBe(true);

  const afterBox = await measureOverlayBox();
  // content.js's fullscreenchange listener only reparents the overlay — it
  // never recomputes syncOverlayPosition. Entering the browser's top layer
  // must not change what position:fixed resolves against, or the overlay
  // would visibly jump the instant present mode goes fullscreen (see the
  // OVERLAY_MAX_Z_INDEX comment in content.js:6-10 about why fullscreen
  // needs this reparenting in the first place).
  expect(afterBox.x).toBeCloseTo(beforeBox.x, 0);
  expect(afterBox.y).toBeCloseTo(beforeBox.y, 0);
});
