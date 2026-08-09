# e2e Final Review Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address all seven Minor findings from the final whole-branch
review of `docs/plans/2026-08-08-remaining-e2e-deferred-items.md`
(already merged to `main`, no Critical/Important findings, nothing broken —
this is cleanup, not a bug fix).

**Architecture:** Four independent, small changes: two pure documentation
accuracy fixes, one defensive-code + shape cleanup in `adapters/index.js`,
one e2e spec rewrite that removes an unnecessary backend dependency, and
one DRY extraction shared across three other e2e specs.

**Tech Stack:** Jest (unit), Playwright (e2e), Chrome extension (MV3
service worker + content script), Phoenix (speechwave, unmodified).

## Global Constraints

- No public interface change to `adapters/index.js` — `getAdapter(url)`'s
  signature and `window.SpeechwaveAdapterRegistry`'s shape stay the same;
  only the internal `ADAPTERS` array becomes a single object. (spec:
  "Item 2 & 4")
- No match-pattern parser is added to `adapters/index.js` — Item 3 is
  explicitly "no code action," not silently dropped. (spec: "Item 3")
- `fireworks.spec.js` must not call `seedTalk`, `fetchApiKey`, or
  `cleanupTestUser` after this round — it doesn't need a real backend
  user/talk at all. (spec: "Item 5")
- `tests/e2e/support/speechwave.js` stays pure backend-shellout logic with
  zero Playwright dependency — the new `seedTalkForSuite()` helper goes in
  a separate file. (spec: "Item 6")
- `docs/manual_tests.md`'s new section is named "Deliberately out of
  scope," not a revival of "not covered (yet)" — the Google Slides gap is
  permanent, not pending. (spec: "Item 7")

---

## Task 1: Fix stale documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/manual_tests.md`

**Interfaces:** None (documentation only).

- [ ] **Step 1: Fix README.md's adapter snippets**

In `README.md`, replace the `getAdapter` code block (currently):

```javascript
function getAdapter(url) {
  if (url.includes("docs.google.com/presentation")) {
    return GoogleSlidesAdapter;
  }
  return { getSlide: () => 0 };  // fallback for unknown platforms
}
```

with:

```javascript
function getAdapter(url) {
  const { matches } = chrome.runtime.getManifest().content_scripts[0];
  const isContentScriptUrl = matches.some((pattern) => url.startsWith(pattern.replace(/\*$/, "")));
  return isContentScriptUrl ? GoogleSlidesAdapter : { getSlide: () => 0 };
}
```

Replace the `getSlide` code block (currently):

```javascript
function getSlide() {
  const input = document.querySelector('input[aria-label*="Slide"]');
  if (!input) return 0;
  const n = parseInt(input.value, 10);
  return isNaN(n) ? 0 : n;
}
```

with:

```javascript
function getSlide() {
  const el = document.querySelector('.punch-viewer-svgpage-a11yelement[aria-label*="Slide"]');
  if (!el) return 0;
  const match = el.getAttribute("aria-label").match(/^Slide (\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
```

(This is a simplified single-document version of the real
`adapters/google_slides.js`, which also searches accessible iframes — the
README snippet was already a simplification before this fix, matching the
existing README's style of showing the gist rather than the full file.)

- [ ] **Step 2: Add the out-of-scope pointer back to `docs/manual_tests.md`**

In `docs/manual_tests.md`, after the "## What's covered" section (after
the `fireworks.spec.js` bullet, at the end of the file), add:

```markdown

## Deliberately out of scope

- Behavior against real Google Slides — Google's login flow actively
  blocks automated sign-in, so there's no automated way to verify this;
  see `docs/specs/2026-08-06-extension-playwright-e2e-testing-design.md`
  for the full reasoning.
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/manual_tests.md
git commit -m "docs: fix stale adapter snippets, restore out-of-scope pointer"
```

---

## Task 2: `adapters/index.js` — defensive try/catch + collapse the vestigial array

**Files:**
- Modify: `adapters/index.js`
- Test: `tests/adapter_registry.test.js`

**Interfaces:**
- Produces: `getAdapter(url)` — same signature and return shape as
  before; now never throws (falls back to `{ getSlide: () => 0 }` if
  `chrome.runtime.getManifest()` throws).

- [ ] **Step 1: Write the failing test**

In `tests/adapter_registry.test.js`, add this test after the four
existing tests, inside the same `describe("adapter registry", ...)` block:

```js
  test("falls back to slide 0 if chrome.runtime.getManifest() throws", () => {
    chrome.runtime.getManifest.mockImplementationOnce(() => {
      throw new Error("Extension context invalidated.");
    });

    const adapter = getAdapter("https://docs.google.com/presentation/d/abc123/edit");

    expect(adapter.getSlide()).toBe(0);
  });
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest tests/adapter_registry.test.js -t "falls back to slide 0"`
Expected: FAIL — current `getAdapter` has no try/catch, so the mocked
throw propagates out of the test instead of being caught, and the test
fails with an uncaught error rather than reaching the `expect(...)`.

- [ ] **Step 3: Implement the fix**

Replace the full contents of `adapters/index.js`:

```js
// In the browser, adapter files are injected before this file (see manifest.json),
// so window.SpeechwaveGoogleSlidesAdapter is available. In Jest (jsdom), window exists
// but window.SpeechwaveGoogleSlidesAdapter is never set — the ternary falls through to
// require(), which is the intended test path. Do not reorder manifest.json injection
// without updating this logic.
const GOOGLE_SLIDES_ADAPTER = {
  getSlide: (typeof window !== "undefined" && window.SpeechwaveGoogleSlidesAdapter)
    ? window.SpeechwaveGoogleSlidesAdapter.getSlide
    : (typeof require !== "undefined" ? require("./google_slides").getSlide : () => 0),
};

// Matches against the manifest's own content_scripts[0].matches instead of a
// hardcoded duplicate of the Slides URL, so this stays in sync with whatever
// this content script is actually injected into — including the e2e fixture
// origin bin/e2e_mode_on adds to the manifest during test runs only. Chrome
// match patterns aren't full regexes; every pattern here is a plain
// "<origin>/*", so a prefix check after stripping the trailing "*" is
// equivalent to real match-pattern semantics for this codebase's needs.
// Wrapped in try/catch because chrome.runtime.getManifest() can throw if the
// extension context is invalidated (e.g. reloaded while this content script
// is still running) — fall back to the null adapter rather than letting the
// throw abort the rest of content.js's module body.
function getAdapter(url) {
  try {
    const { matches } = chrome.runtime.getManifest().content_scripts[0];
    const isContentScriptUrl = matches.some((pattern) => url.startsWith(pattern.replace(/\*$/, "")));
    return isContentScriptUrl ? GOOGLE_SLIDES_ADAPTER : { getSlide: () => 0 };
  } catch {
    return { getSlide: () => 0 };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getAdapter };
} else {
  window.SpeechwaveAdapterRegistry = { getAdapter };
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx jest tests/adapter_registry.test.js`
Expected: PASS, all five tests in the file.

Also run: `npx jest tests/google_slides_adapter.test.js`
Expected: PASS, unaffected.

- [ ] **Step 5: Commit**

```bash
git add adapters/index.js tests/adapter_registry.test.js
git commit -m "fix: guard adapter registry against getManifest() throwing, collapse vestigial adapter array"
```

---

## Task 3: Remove `fireworks.spec.js`'s unnecessary backend dependency

**Files:**
- Modify: `tests/e2e/fireworks.spec.js`

**Interfaces:**
- Consumes: `test`/`expect` from `tests/e2e/support/extension-fixtures.js`;
  `openFixturePage` from `tests/e2e/support/fixture.js`. No longer
  consumes `seedTalk`, `fetchApiKey`, `cleanupTestUser`, or
  `connectViaPopup`.

- [ ] **Step 1: Rewrite the spec**

Replace the full contents of `tests/e2e/fireworks.spec.js`:

```js
const { test, expect } = require("./support/extension-fixtures");
const { openFixturePage } = require("./support/fixture");

test("triggering TEST_FIREWORKS from the popup bursts spans onto the fixture page's overlay", async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
  await popup.locator("#api-key-input").fill("a".repeat(64));
  await popup.locator("#save-api-key-btn").click();
  await expect(popup.locator("#main-section")).toBeVisible();

  const fixturePage = await openFixturePage(context);

  await popup.locator("#test-fireworks-btn").click();

  await expect
    .poll(() => fixturePage.locator("#speechwave-overlay span:not(.floating-emoji)").count())
    .toBeGreaterThan(1);
});
```

The dummy key (`"a".repeat(64)`) only needs to satisfy the popup's
client-side format check (`/^[0-9a-f]{64}$/i` in `popup/popup.js`) — no
backend call happens on save, so this doesn't need to correspond to a
real user.

- [ ] **Step 2: Run the spec against the real dev server, verify it passes**

Run: `npx playwright test fireworks.spec.js`
Expected: PASS. This is a regression check — the spec asserted the same
thing before this change; only its setup path changed.

If it fails on the first run, re-run once before investigating (see prior
e2e troubleshooting notes in `docs/plans/2026-08-07-reaction-overlay-e2e.md`
Task 3 Step 3 — same general approach applies). If it's still failing,
check specifically whether `#main-section` actually becomes visible after
saving the dummy key (it should — this doesn't depend on any backend
state) before assuming the problem is elsewhere.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/fireworks.spec.js
git commit -m "refactor: drop fireworks.spec.js's unnecessary seeded-talk dependency"
```

---

## Task 4: Extract `seedTalkForSuite()`, adopt in three specs

**Files:**
- Create: `tests/e2e/support/seed.js`
- Modify: `tests/e2e/connect.spec.js`
- Modify: `tests/e2e/reaction-overlay.spec.js`
- Modify: `tests/e2e/slide-detection.spec.js`

**Interfaces:**
- Produces: `seedTalkForSuite()` — call once at the top level of a spec
  file (not inside a `test(...)` body). Registers `test.beforeAll`/`afterAll`
  itself and returns an object `{ email, talkSlug }` whose fields are
  populated by the time any `test(...)` body in that file runs (same
  ordering guarantee `test.beforeAll` always provides).
- Consumes: `seedTalk`, `cleanupTestUser` from
  `tests/e2e/support/speechwave.js` (unchanged); `test` from
  `@playwright/test`.

- [ ] **Step 1: Create the helper**

Create `tests/e2e/support/seed.js`:

```js
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
```

- [ ] **Step 2: Adopt it in `connect.spec.js`**

Replace the full contents of `tests/e2e/connect.spec.js`:

```js
const { test, expect } = require("./support/extension-fixtures");
const { fetchApiKey } = require("./support/speechwave");
const { seedTalkForSuite } = require("./support/seed");

const seeded = seedTalkForSuite();

test("supplying an API key and connecting to a talk reaches a real channel join", async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  await expect(popup.locator("#setup-section")).toBeVisible();
  await expect(popup.locator("#main-section")).toBeHidden();

  const apiKey = fetchApiKey(seeded.email);
  await popup.locator("#api-key-input").fill(apiKey);
  await popup.locator("#save-api-key-btn").click();

  await expect(popup.locator("#main-section")).toBeVisible();
  await expect(popup.locator("#setup-section")).toBeHidden();

  await popup.locator("#slug-input").fill(seeded.talkSlug);
  await popup.locator("#connect-btn").click();

  await expect(popup.locator("#dot")).toHaveClass(/connected/);
  await expect(popup.locator("#status-text")).toHaveText("Connected");
  await expect(popup.locator("#session-section")).toBeVisible();
});
```

- [ ] **Step 3: Adopt it in `reaction-overlay.spec.js`**

Replace the full contents of `tests/e2e/reaction-overlay.spec.js`:

```js
const { test, expect } = require("./support/extension-fixtures");
const { fetchApiKey } = require("./support/speechwave");
const { connectViaPopup } = require("./support/popup");
const { openFixturePage } = require("./support/fixture");
const { seedTalkForSuite } = require("./support/seed");

const seeded = seedTalkForSuite();

test("a real attendee reaction reaches the fixture page's overlay via a live channel broadcast", async ({
  context,
  extensionId,
}) => {
  const apiKey = fetchApiKey(seeded.email);
  await connectViaPopup(context, extensionId, apiKey, seeded.talkSlug);

  const fixturePage = await openFixturePage(context);

  const attendeePage = await context.newPage();
  await attendeePage.goto(`http://localhost:4000/t/${seeded.talkSlug}`);
  await expect(attendeePage.locator("#emoji-buttons")).toBeVisible();

  await attendeePage.locator('[phx-value-emoji="❤️"]').click();

  await expect(
    fixturePage.locator("#speechwave-overlay .floating-emoji", { hasText: "❤️" })
  ).toBeVisible();
});
```

- [ ] **Step 4: Adopt it in `slide-detection.spec.js`**

Replace the full contents of `tests/e2e/slide-detection.spec.js`:

```js
const { test, expect } = require("./support/extension-fixtures");
const { fetchApiKey } = require("./support/speechwave");
const { connectViaPopup } = require("./support/popup");
const { openFixturePage } = require("./support/fixture");
const { seedTalkForSuite } = require("./support/seed");

const seeded = seedTalkForSuite();

test("mutating the fixture page's aria-label updates the popup's slide indicator", async ({
  context,
  extensionId,
}) => {
  const apiKey = fetchApiKey(seeded.email);
  const popup = await connectViaPopup(context, extensionId, apiKey, seeded.talkSlug);

  const fixturePage = await openFixturePage(context);

  await expect(popup.locator("#slide-indicator")).toHaveText("Slide 1");

  await fixturePage
    .locator(".punch-viewer-svgpage-a11yelement")
    .evaluate((el) => el.setAttribute("aria-label", "Slide 5 of 10: Title text"));

  await expect(popup.locator("#slide-indicator")).toHaveText("Slide 5");
});
```

- [ ] **Step 5: Run the full e2e suite, verify all four specs still pass together**

Run: `npm run test:e2e`
Expected: PASS — `connect.spec.js`, `reaction-overlay.spec.js`,
`fireworks.spec.js`, and `slide-detection.spec.js` all green in the same
run. This is the most important check in this task: it confirms
`seedTalkForSuite()`'s `test.beforeAll`/`afterAll` registration from
inside an imported function works identically to the inline version it
replaced, across three separate spec files in the same run.

If any spec fails here specifically (but passed before this task), the
most likely cause is `seedTalkForSuite()`'s hooks not registering at the
right time — double-check it's called at the top level of each spec file
(module scope), not inside a `test(...)` or `test.describe(...)` body.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/support/seed.js tests/e2e/connect.spec.js tests/e2e/reaction-overlay.spec.js tests/e2e/slide-detection.spec.js
git commit -m "refactor: extract seedTalkForSuite e2e helper, adopt across three specs"
```
