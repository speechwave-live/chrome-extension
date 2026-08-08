const { test } = require("@playwright/test");
const { seedTalk, cleanupTestUser } = require("./speechwave");

function seedTalkForSuite() {
  const seeded = {};

  test.beforeAll(() => {
    seeded.email = `manual-test-${Date.now()}@example.com`;
    seeded.talkSlug = seedTalk(seeded.email).talk_slug;
  });

  test.afterAll(() => {
    cleanupTestUser();
  });

  return seeded;
}

module.exports = { seedTalkForSuite };
