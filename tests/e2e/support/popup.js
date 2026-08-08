const { expect } = require("@playwright/test");

async function connectViaPopup(context, extensionId, apiKey, slug) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.locator("#api-key-input").fill(apiKey);
  await popup.locator("#save-api-key-btn").click();
  await popup.locator("#slug-input").fill(slug);
  await popup.locator("#connect-btn").click();
  await expect(popup.locator("#dot")).toHaveClass(/connected/);
  return popup;
}

module.exports = { connectViaPopup };
