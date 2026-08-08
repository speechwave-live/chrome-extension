const { test, expect } = require("./support/extension-fixtures");
const { fetchApiKey } = require("./support/speechwave");
const { connectViaPopup } = require("./support/popup");
const { openFixturePage } = require("./support/fixture");
const { seedTalkForSuite } = require("./support/seed");

const seeded = seedTalkForSuite();

test("a real attendee reaction reaches the fixture page's overlay via a live channel broadcast", async ({
  context,
  extensionId,
}) => {
  const apiKey = fetchApiKey(seeded.email);
  await connectViaPopup(context, extensionId, apiKey, seeded.talkSlug);

  const fixturePage = await openFixturePage(context);

  const attendeePage = await context.newPage();
  await attendeePage.goto(`http://localhost:4000/t/${seeded.talkSlug}`);
  await expect(attendeePage.locator("#emoji-buttons")).toBeVisible();

  await attendeePage.locator('[phx-value-emoji="❤️"]').click();

  await expect(
    fixturePage.locator("#speechwave-overlay .floating-emoji", { hasText: "❤️" })
  ).toBeVisible();
});
