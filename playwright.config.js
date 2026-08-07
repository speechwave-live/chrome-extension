// @ts-check
const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.js",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
});
