const { test, expect } = require("./support/extension-fixtures");
const { seedTalk, fetchApiKey, cleanupTestUser } = require("./support/speechwave");
const { connectViaPopup } = require("./support/popup");
const { openFixturePage } = require("./support/fixture");

let email;
let talkSlug;

test.beforeAll(() => {
  email = `manual-test-${Date.now()}@example.com`;
  const seeded = seedTalk(email);
  talkSlug = seeded.talk_slug;
});

test.afterAll(() => {
  cleanupTestUser();
});

test("mutating the fixture page's aria-label updates the popup's slide indicator", async ({
  context,
  extensionId,
}) => {
  const apiKey = fetchApiKey(email);
  const popup = await connectViaPopup(context, extensionId, apiKey, talkSlug);

  const fixturePage = await openFixturePage(context);

  await expect(popup.locator("#slide-indicator")).toHaveText("Slide 1");

  await fixturePage
    .locator(".punch-viewer-svgpage-a11yelement")
    .evaluate((el) => el.setAttribute("aria-label", "Slide 5 of 10: Title text"));

  await expect(popup.locator("#slide-indicator")).toHaveText("Slide 5");
});
