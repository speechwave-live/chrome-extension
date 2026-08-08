const { test, expect } = require("./support/extension-fixtures");
const { fetchApiKey } = require("./support/speechwave");
const { connectViaPopup } = require("./support/popup");
const { openFixturePage } = require("./support/fixture");
const { seedTalkForSuite } = require("./support/seed");

const seeded = seedTalkForSuite();

test("mutating the fixture page's aria-label updates the popup's slide indicator", async ({
  context,
  extensionId,
}) => {
  const apiKey = fetchApiKey(seeded.email);
  const popup = await connectViaPopup(context, extensionId, apiKey, seeded.talkSlug);

  const fixturePage = await openFixturePage(context);

  await expect(popup.locator("#slide-indicator")).toHaveText("Slide 1");

  await fixturePage
    .locator(".punch-viewer-svgpage-a11yelement")
    .evaluate((el) => el.setAttribute("aria-label", "Slide 5 of 10: Title text"));

  await expect(popup.locator("#slide-indicator")).toHaveText("Slide 5");
});
