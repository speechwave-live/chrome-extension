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
