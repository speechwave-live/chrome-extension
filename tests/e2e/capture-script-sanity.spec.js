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

  expect(before.viewport.width).toBeGreaterThan(0);
  expect(before.viewport.height).toBeGreaterThan(0);
  expect(before.a11yElement.found).toBe(true);
  expect(before.a11yElement.ariaLabel).toBe("Slide 1 of 10: Title text");
  expect(before.a11yElement.className).toBe("punch-viewer-svgpage-a11yelement");
  expect(before.a11yElement.hostIframeClassName).toBe("punch-present-iframe");
  // Found via the iframe path in this fixture, so a11yElement.rect should
  // match slideRectWithinIframe exactly — both read the same element's
  // getBoundingClientRect() relative to the same (iframe) document.
  expect(before.a11yElement.rect.left).toBeCloseTo(0, 0);
  expect(before.a11yElement.rect.top).toBeCloseTo(0, 0);
  expect(before.a11yElement.rect.right).toBeCloseTo(760, 0);
  expect(before.a11yElement.rect.bottom).toBeCloseTo(450, 0);
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
