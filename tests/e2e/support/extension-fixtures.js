const path = require("path");
const os = require("os");
const fs = require("fs");
const { test: base, chromium } = require("@playwright/test");

const EXTENSION_PATH = path.join(__dirname, "..", "..", "..");

const test = base.extend({
  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "speechwave-e2e-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },
  extensionId: async ({ context }, use) => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent("serviceworker", { timeout: 10_000 });
    }
    const extensionId = background.url().split("/")[2];
    await use(extensionId);
  },
});

module.exports = { test, expect: base.expect };
