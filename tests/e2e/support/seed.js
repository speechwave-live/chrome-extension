const { test } = require("@playwright/test");
const { seedTalk, cleanupTestUser } = require("./speechwave");

// cleanupTestUser() deletes every manual-test-* user, not just the one this
// suite seeded — safe only because playwright.config.js pins workers: 1 and
// fullyParallel: false, so specs never run concurrently and can't delete
// each other's in-flight user. Raising either setting would need this
// scoped to the seeded email first.
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
