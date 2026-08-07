const { test, expect } = require("./support/extension-fixtures");
const { seedTalk, fetchApiKey, cleanupTestUser } = require("./support/speechwave");

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

test("supplying an API key and connecting to a talk reaches a real channel join", async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  await expect(popup.locator("#setup-section")).toBeVisible();
  await expect(popup.locator("#main-section")).toBeHidden();

  const apiKey = fetchApiKey(email);
  await popup.locator("#api-key-input").fill(apiKey);
  await popup.locator("#save-api-key-btn").click();

  await expect(popup.locator("#main-section")).toBeVisible();
  await expect(popup.locator("#setup-section")).toBeHidden();

  await popup.locator("#slug-input").fill(talkSlug);
  await popup.locator("#connect-btn").click();

  await expect(popup.locator("#dot")).toHaveClass(/connected/);
  await expect(popup.locator("#status-text")).toHaveText("Connected");
  await expect(popup.locator("#session-section")).toBeVisible();
});
