module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["**/tests/**/*.test.js"],
  setupFiles: ["./tests/setup/chrome-mock.js"],
};
