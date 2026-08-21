const { expect } = require("@playwright/test");
const { FIXTURE_PORT } = require("./constants");

async function openFixturePage(context) {
  const fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/`);
  await expect(fixturePage.locator("#speechwave-overlay")).toBeVisible();
  return fixturePage;
}

async function openWindowedFixturePage(context) {
  const fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/windowed-slide.html`);
  await expect(fixturePage.locator("#speechwave-overlay")).toBeVisible();
  return fixturePage;
}

async function openEditViewFixturePage(context) {
  const fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/edit-view.html`);
  await expect(fixturePage.locator("#speechwave-overlay")).toBeVisible();
  return fixturePage;
}

module.exports = { openFixturePage, openWindowedFixturePage, openEditViewFixturePage };
