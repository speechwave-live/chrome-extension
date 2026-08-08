# Reaction-Overlay Round Trip (e2e) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `tests/e2e/reaction-overlay.spec.js`, proving a real attendee
reaction travels attendee page → Phoenix channel → extension service worker
→ content script overlay, on top of two small production fixes this path
exposed.

**Architecture:** Reuses all infrastructure from the existing e2e suite
(pitchfork lifecycle, extension loading, `e2e_mode_on`/`off`, fixture
server) unchanged. Two production bugs blocked this path from working even
with that infrastructure in place: `background.js` broadcasts to a
hardcoded Slides-only tab pattern instead of the manifest's actual
`content_scripts` matches, and the emoji span it renders has no class,
making it indistinguishable from an unrelated fireworks span. Both are
fixed with a unit test first, then the e2e spec is written against the
fixed code.

**Tech Stack:** Jest (unit), Playwright (e2e), Chrome extension (MV3
service worker + content script), Phoenix (speechwave, unmodified).

## Global Constraints

- Production `manifest.json` match patterns/permissions must not be
  broadened — the `background.js` fix must be behaviorally a no-op in
  production. (spec: "Background broadcast bug")
- `connect.spec.js` is not refactored to use the new `connectViaPopup`
  helper — its own inline assertions on `#setup-section`/`#main-section`
  stay as-is. (spec: "Shared test setup")
- The e2e spec drives the attendee reaction via `[phx-value-emoji="❤️"]`
  on a real `http://localhost:4000/t/<slug>` page — no mocking of the
  Phoenix side. (spec: "reaction-overlay.spec.js")
- `spawnFireworks()`'s spans are not renamed — only `spawnEmoji()`'s span
  gets `.floating-emoji`. (spec: "Content script: name the reaction span")
- e2e tests require the `speechwave` repo checked out as `../speechwave`
  and its dev server reachable; they are not CI-gated and are run on
  demand (`npm run test:e2e` or targeted at one spec file).

---

## Task 1: Fix `broadcastToSlidesTabs` to use the manifest's own match patterns

**Files:**
- Modify: `background/background.js:38-46` (`broadcastToSlidesTabs`)
- Modify: `tests/setup/chrome-mock.js`
- Test: `tests/background.test.js`

**Interfaces:**
- Produces: `broadcastToSlidesTabs(msg)` (unchanged signature/behavior in
  production) now calls `chrome.tabs.query({ url: matches }, ...)` where
  `matches` comes from `chrome.runtime.getManifest().content_scripts[0].matches`
  instead of a hardcoded string.

- [ ] **Step 1: Add `getManifest` to the Jest chrome mock**

Edit `tests/setup/chrome-mock.js`, adding `getManifest` inside `runtime`:

```js
global.chrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
    },
    lastError: null,
    getManifest: jest.fn(() => ({
      content_scripts: [{ matches: ["https://docs.google.com/presentation/*"] }],
    })),
  },
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn(),
    },
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
  },
  tabs: {
    query: jest.fn(),
    sendMessage: jest.fn(),
  },
};
```

This mirrors the real `manifest.json`'s `content_scripts[0].matches` value.

- [ ] **Step 2: Write the failing test**

In `tests/background.test.js`, add this test inside the existing
`describe("remote config from channel join", ...)` block (it already has
the `chrome.tabs.query.mockImplementation` + `SET_SLUG` + join pattern this
needs):

```js
  test("queries tabs using the manifest's content_scripts match patterns, not a hardcoded URL", () => {
    const { messageHandler } = loadBackground();

    chrome.tabs.query.mockImplementation((_query, callback) => {
      callback([{ id: 5 }]);
    });

    messageHandler({ type: "SET_SLUG", slug: "talk", apiKey: "key" }, {}, jest.fn());
    mockChannel.joinReceiveHandlers["ok"]({
      settings: { overlay_size_percent: 35, fireworks_enabled: false },
      tuning: { min_overlay_size_percent: 10 },
    });

    expect(chrome.tabs.query).toHaveBeenCalledWith(
      { url: ["https://docs.google.com/presentation/*"] },
      expect.any(Function)
    );
  });
```

- [ ] **Step 3: Run the test, verify it fails**

Run: `npx jest tests/background.test.js -t "queries tabs using the manifest"`
Expected: FAIL — current code calls `chrome.tabs.query` with
`{ url: 'https://docs.google.com/presentation/*' }` (a bare string, not an
array), so the `toHaveBeenCalledWith` assertion mismatches.

- [ ] **Step 4: Implement the fix**

In `background/background.js`, replace the `broadcastToSlidesTabs`
function (currently lines 38-46):

```js
function broadcastToSlidesTabs(msg) {
  const { matches } = chrome.runtime.getManifest().content_scripts[0];
  chrome.tabs.query({ url: matches }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, msg, () => {
        void chrome.runtime.lastError; // suppress "no listener" errors
      });
    }
  });
}
```

Keep the existing docstring comment above it as-is.

- [ ] **Step 5: Run the test, verify it passes**

Run: `npx jest tests/background.test.js`
Expected: PASS, all tests in the file (the four pre-existing
`chrome.tabs.query.mockImplementation` call sites don't assert on the
query's shape, so they're unaffected).

- [ ] **Step 6: Commit**

```bash
git add background/background.js tests/setup/chrome-mock.js tests/background.test.js
git commit -m "fix: derive Slides tab broadcast pattern from manifest instead of a hardcoded duplicate"
```

---

## Task 2: Give the reaction span a `.floating-emoji` class

**Files:**
- Modify: `content/content.js:168-194` (`spawnEmoji`)
- Test: `tests/content.test.js`

**Interfaces:**
- Produces: the `<span>` appended to `#speechwave-overlay` by `spawnEmoji`
  now has `className === "floating-emoji"`. `spawnFireworks`'s spans are
  unaffected (still unclassed).

- [ ] **Step 1: Write the failing test**

In `tests/content.test.js`, add this test inside the existing
`describe("RENDER_EMOJI message", ...)` block:

```js
  test("emoji span has the floating-emoji class", () => {
    const { messageHandler } = loadContent();

    messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());

    const span = document.getElementById("speechwave-overlay").querySelector("span");
    expect(span.className).toBe("floating-emoji");
  });
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npx jest tests/content.test.js -t "floating-emoji class"`
Expected: FAIL — `span.className` is currently `""`.

- [ ] **Step 3: Implement the fix**

In `content/content.js`, inside `spawnEmoji`, find:

```js
  const el = document.createElement("span");
  el.textContent = emoji;
```

Change to:

```js
  const el = document.createElement("span");
  el.className = "floating-emoji";
  el.textContent = emoji;
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `npx jest tests/content.test.js`
Expected: PASS, full file (existing tests select via bare `span`, still
match one span regardless of class).

- [ ] **Step 5: Commit**

```bash
git add content/content.js tests/content.test.js
git commit -m "feat: mark the reaction overlay span with a floating-emoji class"
```

---

## Task 3: Add `reaction-overlay.spec.js` and its shared popup helper

**Files:**
- Create: `tests/e2e/support/popup.js`
- Create: `tests/e2e/reaction-overlay.spec.js`
- Modify: `docs/manual_tests.md`

**Interfaces:**
- Consumes: `test`/`expect` from `tests/e2e/support/extension-fixtures.js`
  (provides `context`, `extensionId` fixtures); `seedTalk`, `fetchApiKey`,
  `cleanupTestUser` from `tests/e2e/support/speechwave.js`; `FIXTURE_PORT`
  from `tests/e2e/support/constants.js`.
- Produces: `connectViaPopup(context, extensionId, apiKey, slug)` — opens
  the popup page, saves the API key, connects to `slug`, waits for
  `#dot.connected`, and returns the popup `Page`.

- [ ] **Step 1: Create the `connectViaPopup` helper**

Create `tests/e2e/support/popup.js`:

```js
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
```

- [ ] **Step 2: Create the reaction-overlay spec**

Create `tests/e2e/reaction-overlay.spec.js`:

```js
const { test, expect } = require("./support/extension-fixtures");
const { seedTalk, fetchApiKey, cleanupTestUser } = require("./support/speechwave");
const { connectViaPopup } = require("./support/popup");
const { FIXTURE_PORT } = require("./support/constants");

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

  const fixturePage = await context.newPage();
  await fixturePage.goto(`http://localhost:${FIXTURE_PORT}/`);
  await expect(fixturePage.locator("#speechwave-overlay")).toBeVisible();

  const attendeePage = await context.newPage();
  await attendeePage.goto(`http://localhost:4000/t/${talkSlug}`);
  await expect(attendeePage.locator("#emoji-buttons")).toBeVisible();

  await attendeePage.locator('[phx-value-emoji="❤️"]').click();

  await expect(
    fixturePage.locator("#speechwave-overlay .floating-emoji", { hasText: "❤️" })
  ).toBeVisible();
});
```

- [ ] **Step 3: Run the spec against the real dev server, verify it passes**

Run: `npx playwright test reaction-overlay.spec.js`
Expected: PASS. This exercises the real stack (pitchfork-managed
speechwave dev server, real extension, real Phoenix channel) — if Task 1's
fix or Task 2's class rename were wrong, this is where it would show up as
a timeout on the final `expect(...).toBeVisible()` (the 2.5s animation
window from `docs/specs/2026-08-07-reaction-overlay-e2e-design.md`'s
flakiness note).

If it fails, re-run once before investigating — but a fresh failure here
almost certainly means the emoji span's class doesn't match, the broadcast
still isn't reaching the fixture tab, the fixture page didn't finish
loading before the click, or the local speechwave checkout's DB isn't
migrated (`mix ecto.setup` in `../speechwave`).

- [ ] **Step 4: Update `docs/manual_tests.md`**

In `docs/manual_tests.md`, move the reaction-overlay bullet from "What's
not covered (yet)" to "What's covered". Replace:

```markdown
## What's covered

- **`connect.spec.js`** — fresh extension profile → enter API key → save →
  enter a seeded talk's slug → Connect → asserts the popup reflects a real,
  live Phoenix channel join.

## What's not covered (yet)

- The reaction-overlay round trip (attendee reaction → real channel
  broadcast → content script renders it on the fixture page).
- Slide-number detection and the fireworks animation.
```

with:

```markdown
## What's covered

- **`connect.spec.js`** — fresh extension profile → enter API key → save →
  enter a seeded talk's slug → Connect → asserts the popup reflects a real,
  live Phoenix channel join.
- **`reaction-overlay.spec.js`** — a real attendee tapping an emoji on
  `/t/:slug` → real Phoenix channel broadcast → the fixture page's content
  script renders a `.floating-emoji` span on `#speechwave-overlay`.

## What's not covered (yet)

- Slide-number detection and the fireworks animation.
```

(Leave the rest of the file, including the Google Slides DOM-drift bullet,
unchanged.)

- [ ] **Step 5: Run the full e2e suite once, verify both specs pass together**

Run: `npm run test:e2e`
Expected: PASS — both `connect.spec.js` and `reaction-overlay.spec.js`
green in the same run (confirms no shared-state interference between the
two specs' seeded users/talks).

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/support/popup.js tests/e2e/reaction-overlay.spec.js docs/manual_tests.md
git commit -m "test: add reaction-overlay e2e round trip"
```
