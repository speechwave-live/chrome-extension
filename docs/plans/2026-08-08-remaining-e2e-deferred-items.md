# Remaining e2e Deferred Items (Slide Detection + Fireworks) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `tests/e2e/slide-detection.spec.js` and `tests/e2e/fireworks.spec.js`,
picking up the last two items deferred in the original e2e design, on top of
one small production fix this exposed.

**Architecture:** Reuses all infrastructure from the existing e2e suite
unchanged. One production bug blocked slide detection from working even
with that infrastructure in place: `adapters/index.js` matches URLs against
a hardcoded regex duplicate of the Slides URL instead of the manifest's
actual `content_scripts` matches — the same class of bug the prior round
found and fixed in `background.js`. Fixed with a unit test first, then a
shared Playwright helper is extracted (also adopted by the existing
`reaction-overlay.spec.js`), then the two new specs are written against the
fixed code.

**Tech Stack:** Jest (unit), Playwright (e2e), Chrome extension (MV3
service worker + content script), Phoenix (speechwave, unmodified).

## Global Constraints

- Production `manifest.json` match patterns/permissions must not be
  broadened — the `adapters/index.js` fix must be behaviorally a no-op in
  production. (spec: "Adapter registry bug")
- `fireworks.spec.js` must not assert the exact burst count
  (`FIREWORKS_BURST_COUNT = 16` in `content/content.js`) — assert the
  burst happened structurally (count `> 1`), not the tuning constant.
  (spec: "fireworks.spec.js")
- `reaction-overlay.spec.js` IS refactored to use the new
  `openFixturePage` helper in this round — unlike `connect.spec.js` vs.
  `connectViaPopup` in the prior round, its fixture-opening block is pure
  boilerplate with no test-specific nuance. (spec: "Shared fixture-page
  helper")
- e2e tests require the `speechwave` repo checked out as `../speechwave`
  and its dev server reachable; they are not CI-gated and are run on
  demand (`npm run test:e2e` or targeted at one spec file).

---

## Task 1: Fix `adapters/index.js` to derive match patterns from the manifest

**Files:**
- Modify: `adapters/index.js`
- Test: `tests/adapter_registry.test.js`

**Interfaces:**
- Produces: `getAdapter(url)` (unchanged signature/behavior in production)
  now checks `url` against
  `chrome.runtime.getManifest().content_scripts[0].matches` instead of a
  hardcoded regex.

- [ ] **Step 1: Write the failing test**

In `tests/adapter_registry.test.js`, add this test after the three
existing tests, inside the same `describe("adapter registry", ...)` block:

```js
  test("resolves URLs matched only via a patched manifest (e.g. e2e fixture origin)", () => {
    chrome.runtime.getManifest.mockReturnValueOnce({
      content_scripts: [
        { matches: ["https://docs.google.com/presentation/*", "http://localhost:8973/*"] },
      ],
    });
    document.body.innerHTML =
      '<div class="punch-viewer-svgpage-a11yelement" aria-label="Slide 4 of 10: Title text"></div>';

    const adapter = getAdapter("http://localhost:8973/");

    expect(adapter.getSlide()).toBe(4);
    document.body.innerHTML = "";
  });
```

This relies on `chrome.runtime.getManifest` already being mocked globally
in `tests/setup/chrome-mock.js` (added in a prior round) — no mock setup
changes needed here.

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest tests/adapter_registry.test.js -t "e2e fixture origin"`
Expected: FAIL — current code matches against a hardcoded
`/docs\.google\.com\/presentation/` regex and never calls
`chrome.runtime.getManifest()`, so `http://localhost:8973/` resolves to
the fallback adapter and `getSlide()` returns `0`, not `4`.

- [ ] **Step 3: Implement the fix**

Replace the full contents of `adapters/index.js`:

```js
// In the browser, adapter files are injected before this file (see manifest.json),
// so window.SpeechwaveGoogleSlidesAdapter is available. In Jest (jsdom), window exists
// but window.SpeechwaveGoogleSlidesAdapter is never set — the ternary falls through to
// require(), which is the intended test path. Do not reorder manifest.json injection
// without updating this logic.
const ADAPTERS = [
  {
    getSlide: (typeof window !== "undefined" && window.SpeechwaveGoogleSlidesAdapter)
      ? window.SpeechwaveGoogleSlidesAdapter.getSlide
      : (typeof require !== "undefined" ? require("./google_slides").getSlide : () => 0),
  },
];

// Matches against the manifest's own content_scripts[0].matches instead of a
// hardcoded duplicate of the Slides URL, so this stays in sync with whatever
// this content script is actually injected into — including the e2e fixture
// origin bin/e2e_mode_on adds to the manifest during test runs only. Chrome
// match patterns aren't full regexes; every pattern here is a plain
// "<origin>/*", so a prefix check after stripping the trailing "*" is
// equivalent to real match-pattern semantics for this codebase's needs.
function getAdapter(url) {
  const { matches } = chrome.runtime.getManifest().content_scripts[0];
  const isContentScriptUrl = matches.some((pattern) => url.startsWith(pattern.replace(/\*$/, "")));
  return isContentScriptUrl ? ADAPTERS[0] : { getSlide: () => 0 };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getAdapter };
} else {
  window.SpeechwaveAdapterRegistry = { getAdapter };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx jest tests/adapter_registry.test.js`
Expected: PASS, all four tests in the file (the three pre-existing tests
are unaffected — the default `chrome.runtime.getManifest` mock already
returns `content_scripts: [{ matches: ["https://docs.google.com/presentation/*"] }]`).

Also run: `npx jest tests/google_slides_adapter.test.js`
Expected: PASS, unaffected (that file doesn't touch `adapters/index.js`).

- [ ] **Step 5: Commit**

```bash
git add adapters/index.js tests/adapter_registry.test.js
git commit -m "fix: derive adapter registry match patterns from manifest instead of a hardcoded duplicate"
```

---

## Task 2: Add `openFixturePage` helper and refactor `reaction-overlay.spec.js`

**Files:**
- Create: `tests/e2e/support/fixture.js`
- Modify: `tests/e2e/reaction-overlay.spec.js`

**Interfaces:**
- Produces: `openFixturePage(context)` — opens a new page at the fixture
  server's origin, waits for `#speechwave-overlay` to be visible (proves
  the content script has injected and is listening), and returns the
  `Page`.
- Consumes (in the refactor): `FIXTURE_PORT` from
  `tests/e2e/support/constants.js`.

- [ ] **Step 1: Create the helper**

Create `tests/e2e/support/fixture.js`:

```js
const { expect } = require("@playwright/test");
const { FIXTURE_PORT } = require("./constants");

async function openFixturePage(context) {
  const fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/`);
  await expect(fixturePage.locator("#speechwave-overlay")).toBeVisible();
  return fixturePage;
}

module.exports = { openFixturePage };
```

- [ ] **Step 2: Refactor `reaction-overlay.spec.js` to use it**

Replace the full contents of `tests/e2e/reaction-overlay.spec.js`:

```js
const { test, expect } = require("./support/extension-fixtures");
const { seedTalk, fetchApiKey, cleanupTestUser } = require("./support/speechwave");
const { connectViaPopup } = require("./support/popup");
const { openFixturePage } = require("./support/fixture");

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

test("a real attendee reaction reaches the fixture page's overlay via a live channel broadcast", async ({
  context,
  extensionId,
}) => {
  const apiKey = fetchApiKey(email);
  await connectViaPopup(context, extensionId, apiKey, talkSlug);

  const fixturePage = await openFixturePage(context);

  const attendeePage = await context.newPage();
  await attendeePage.goto(`http://localhost:4000/t/${talkSlug}`);
  await expect(attendeePage.locator("#emoji-buttons")).toBeVisible();

  await attendeePage.locator('[phx-value-emoji="❤️"]').click();

  await expect(
    fixturePage.locator("#speechwave-overlay .floating-emoji", { hasText: "❤️" })
  ).toBeVisible();
});
```

- [ ] **Step 3: Run the refactored spec against the real dev server, verify it still passes**

Run: `npx playwright test reaction-overlay.spec.js`
Expected: PASS — this is a regression check confirming the refactor didn't
change behavior. This is Playwright e2e code, not Jest, so there's no
red/green TDD cycle here; the spec itself is the test, and running it
against the live speechwave dev server is the verification.

If it fails, re-run once before investigating (see
`docs/plans/2026-08-07-reaction-overlay-e2e.md` Task 3 Step 3
for the general e2e troubleshooting notes — same applies here).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/support/fixture.js tests/e2e/reaction-overlay.spec.js
git commit -m "refactor: extract openFixturePage e2e helper, adopt in reaction-overlay.spec.js"
```

---

## Task 3: Add `fireworks.spec.js`

**Files:**
- Create: `tests/e2e/fireworks.spec.js`

**Interfaces:**
- Consumes: `test`/`expect` from `tests/e2e/support/extension-fixtures.js`;
  `seedTalk`, `fetchApiKey`, `cleanupTestUser` from
  `tests/e2e/support/speechwave.js`; `connectViaPopup` from
  `tests/e2e/support/popup.js` (returns the popup `Page`); `openFixturePage`
  from `tests/e2e/support/fixture.js` (Task 2).

- [ ] **Step 1: Create the spec**

Create `tests/e2e/fireworks.spec.js`:

```js
const { test, expect } = require("./support/extension-fixtures");
const { seedTalk, fetchApiKey, cleanupTestUser } = require("./support/speechwave");
const { connectViaPopup } = require("./support/popup");
const { openFixturePage } = require("./support/fixture");

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

test("triggering TEST_FIREWORKS from the popup bursts spans onto the fixture page's overlay", async ({
  context,
  extensionId,
}) => {
  const apiKey = fetchApiKey(email);
  const popup = await connectViaPopup(context, extensionId, apiKey, talkSlug);

  const fixturePage = await openFixturePage(context);

  await popup.locator("#test-fireworks-btn").click();

  await expect
    .poll(() => fixturePage.locator("#speechwave-overlay span:not(.floating-emoji)").count())
    .toBeGreaterThan(1);
});
```

`#test-fireworks-btn` is visible because the e2e suite's global setup
already turns `DEV_MODE` on (`popup/popup.js` shows the button whenever
`DEV_MODE` is `true`) — no additional setup needed. `:not(.floating-emoji)`
scopes the selector away from reaction spans in case a future test fires
both in the same page; nothing else appends spans in this spec alone.

- [ ] **Step 2: Run the spec against the real dev server, verify it passes**

Run: `npx playwright test fireworks.spec.js`
Expected: PASS. Do not assert the exact burst count
(`FIREWORKS_BURST_COUNT = 16` in `content/content.js`) — the `> 1` check is
deliberate (see Global Constraints); do not tighten it to an exact number.

The burst spans self-remove on a staggered animation (`el.animate(...)`,
1200ms duration plus up to 300ms random per-span delay, so up to ~1.5s
total) — `expect.poll()` is used instead of `toHaveCount()` specifically
because the count fluctuates over that window as spans stagger-remove; if
this flakes, that's the mechanism to look at, not a reason to add a fixed
`waitForTimeout`.

If it fails, re-run once before investigating (same troubleshooting
approach as prior specs — check DEV_MODE really is on, the popup button is
actually visible/clickable, and the fixture page loaded before the click).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/fireworks.spec.js
git commit -m "test: add fireworks e2e round trip"
```

---

## Task 4: Add `slide-detection.spec.js` and update docs

**Files:**
- Create: `tests/e2e/slide-detection.spec.js`
- Modify: `docs/manual_tests.md`

**Interfaces:**
- Consumes: same as Task 3 (`connectViaPopup`, `openFixturePage`,
  `seedTalk`/`fetchApiKey`/`cleanupTestUser`).

- [ ] **Step 1: Create the spec**

Create `tests/e2e/slide-detection.spec.js`:

```js
const { test, expect } = require("./support/extension-fixtures");
const { seedTalk, fetchApiKey, cleanupTestUser } = require("./support/speechwave");
const { connectViaPopup } = require("./support/popup");
const { openFixturePage } = require("./support/fixture");

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

test("mutating the fixture page's aria-label updates the popup's slide indicator", async ({
  context,
  extensionId,
}) => {
  const apiKey = fetchApiKey(email);
  const popup = await connectViaPopup(context, extensionId, apiKey, talkSlug);

  const fixturePage = await openFixturePage(context);

  await expect(popup.locator("#slide-indicator")).toHaveText("Slide 1");

  await fixturePage
    .locator(".punch-viewer-svgpage-a11yelement")
    .evaluate((el) => el.setAttribute("aria-label", "Slide 5 of 10: Title text"));

  await expect(popup.locator("#slide-indicator")).toHaveText("Slide 5");
});
```

The first assertion (`"Slide 1"`) is not incidental — it proves the
Task 1 fix end-to-end: `content.js`'s `startSlideObserver` runs
`checkSlide()` immediately on load, reads the fixture's default
`aria-label="Slide 1 of 10: Title text"` through the now-fixed adapter
registry, and the result reaches the already-connected popup via
`SLIDE_CHANGED`. Don't remove it as "redundant setup."

- [ ] **Step 2: Run the spec against the real dev server, verify it passes**

Run: `npx playwright test slide-detection.spec.js`
Expected: PASS. This spec has no animation-based self-destruct window
(the slide indicator is persistent text, not a decaying DOM node), so it
carries less inherent flakiness risk than `reaction-overlay.spec.js` or
`fireworks.spec.js` — if it flakes, that points at something else (e.g.
the 500ms poll interval genuinely not having fired yet, in which case
Playwright's default assertion timeout already retries well past that).

- [ ] **Step 3: Update `docs/manual_tests.md`**

Replace the "What's covered" through end-of-file section (currently lines
37-52) with:

```markdown
## What's covered

- **`connect.spec.js`** — fresh extension profile → enter API key → save →
  enter a seeded talk's slug → Connect → asserts the popup reflects a real,
  live Phoenix channel join.
- **`reaction-overlay.spec.js`** — a real attendee tapping an emoji on
  `/t/:slug` → real Phoenix channel broadcast → the fixture page's content
  script renders a `.floating-emoji` span on `#speechwave-overlay`.
- **`slide-detection.spec.js`** — mutating the fixture page's `aria-label`
  → asserts the popup's `#slide-indicator` updates to match.
- **`fireworks.spec.js`** — triggering the dev-mode `TEST_FIREWORKS` popup
  button → asserts a burst of spans appears on `#speechwave-overlay`.
```

This drops the "What's not covered (yet)" heading and its two bullets
entirely (both remaining "yet" items are now covered; the Google Slides
DOM-drift point and CI-gating are deliberate-scope decisions already
explained in `docs/specs/2026-08-06-extension-playwright-e2e-testing-design.md`,
which this file already points to earlier — no need to restate them here).

- [ ] **Step 4: Run the full e2e suite once, verify all four specs pass together**

Run: `npm run test:e2e`
Expected: PASS — `connect.spec.js`, `reaction-overlay.spec.js`,
`fireworks.spec.js`, and `slide-detection.spec.js` all green in the same
run, confirming no shared-state interference between their seeded
users/talks.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/slide-detection.spec.js docs/manual_tests.md
git commit -m "test: add slide-detection e2e round trip, update e2e coverage docs"
```
