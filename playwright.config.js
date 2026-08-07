// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.js",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  globalSetup: require.resolve("./tests/e2e/support/global-setup.js"),
  globalTeardown: require.resolve("./tests/e2e/support/global-teardown.js"),
});
