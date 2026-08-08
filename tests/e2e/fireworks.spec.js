const { test, expect } = require("./support/extension-fixtures");
const { openFixturePage } = require("./support/fixture");

test("triggering TEST_FIREWORKS from the popup bursts spans onto the fixture page's overlay", async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.locator("#api-key-input").fill("a".repeat(64));
  await popup.locator("#save-api-key-btn").click();
  await expect(popup.locator("#main-section")).toBeVisible();

  const fixturePage = await openFixturePage(context);

  await popup.locator("#test-fireworks-btn").click();

  await expect
    .poll(() => fixturePage.locator("#speechwave-overlay span:not(.floating-emoji)").count())
    .toBeGreaterThan(1);
});
