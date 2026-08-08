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

test("triggering TEST_FIREWORKS from the popup bursts spans onto the fixture page's overlay", async ({
  context,
  extensionId,
}) => {
  const apiKey = fetchApiKey(email);
  const popup = await connectViaPopup(context, extensionId, apiKey, talkSlug);

  const fixturePage = await openFixturePage(context);

  await popup.locator("#test-fireworks-btn").click();

  await expect
    .poll(() => fixturePage.locator("#speechwave-overlay span:not(.floating-emoji)").count())
    .toBeGreaterThan(1);
});
