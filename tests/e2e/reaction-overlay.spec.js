const { test, expect } = require("./support/extension-fixtures");
const { seedTalk, fetchApiKey, cleanupTestUser } = require("./support/speechwave");
const { connectViaPopup } = require("./support/popup");
const { FIXTURE_PORT } = require("./support/constants");

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

test("a real attendee reaction reaches the fixture page's overlay via a live channel broadcast", async ({
  context,
  extensionId,
}) => {
  const apiKey = fetchApiKey(email);
  await connectViaPopup(context, extensionId, apiKey, talkSlug);

  const fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/`);
  await expect(fixturePage.locator("#speechwave-overlay")).toBeVisible();

  const attendeePage = await context.newPage();
  await attendeePage.goto(`http://localhost:4000/t/${talkSlug}`);
  await expect(attendeePage.locator("#emoji-buttons")).toBeVisible();

  await attendeePage.locator('[phx-value-emoji="❤️"]').click();

  await expect(
    fixturePage.locator("#speechwave-overlay .floating-emoji", { hasText: "❤️" })
  ).toBeVisible();
});
