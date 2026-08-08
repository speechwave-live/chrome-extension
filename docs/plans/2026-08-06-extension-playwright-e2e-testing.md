# Chrome Extension Playwright E2E Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an agent-runnable Playwright end-to-end test (`connect.spec.js`) that loads the real unpacked Chrome extension, drives its popup against a live local speechwave dev server, and proves the API-key-entry → talk-connect flow reaches a real Phoenix channel join — no human clicking required.

**Architecture:** Playwright's `launchPersistentContext` loads the real extension in a real (headed) Chrome instance. A small local static server stands in for Google Slides (the content script's `matches` pattern is temporarily patched to include it). Backend data (talk, session, API key) comes from the sibling `speechwave` repo's existing `scripts/manual_tests/*.exs` scripts via `mix run`, invoked as subprocesses — no speechwave files are modified. The speechwave dev server itself is managed via `pitchfork` (its `pitchfork.toml` already defines the `speechwave/web` daemon).

**Tech Stack:** `@playwright/test`, Node.js built-ins only for support code (no new runtime dependencies beyond Playwright), bash for the manifest-toggle scripts (matching the existing `bin/dev_mode_on`/`off` convention).

## Global Constraints

- No files in the `speechwave` repo are created or modified — only existing scripts (`seed_active_session.exs`, `cleanup_manual_test_users.exs`) are invoked via `mix run`, from `../speechwave` relative to this repo (per `AGENTS.md`).
- Not CI-gated. This suite is agent/human-runnable on demand only.
- Headed Chrome (`headless: false`) — required for `launchPersistentContext` + `--load-extension` to behave reliably; this runs on a dev machine, not CI.
- Every manifest.json patch this suite applies (dev mode, e2e mode) must be reverted automatically in teardown — never a manual "remember to run X before committing" step.
- If `DEV_MODE` was already `true` before this suite ran (a developer's own manual session), the suite must not turn it off in teardown — only revert state it changed itself.
- Fresh temp `userDataDir` per test run, removed after.
- No new npm dependencies beyond `@playwright/test`.

---

### Task 1: Playwright dependency, config skeleton, and gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `playwright.config.js`

**Interfaces:**
- Produces: `npm run test:e2e` script; `playwright.config.js` with `testDir: "./tests/e2e"`, `testMatch: "**/*.spec.js"` (later tasks add `globalSetup`/`globalTeardown` to this file).

- [ ] **Step 1: Add the Playwright devDependency and `test:e2e` script**

Edit `package.json`:

```json
{
  "name": "joyconf-extension",
  "private": true,
  "scripts": {
    "test": "jest",
    "test:e2e": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.48.0",
    "jest": "^29.0.0",
    "jest-environment-jsdom": "^29.0.0"
  }
}
```

- [ ] **Step 2: Install**

Run: `npm install && npx playwright install chromium`
Expected: installs `@playwright/test` into `node_modules`, downloads a Chromium build for Playwright.

- [ ] **Step 3: Add Playwright artifacts to `.gitignore`**

Append to `.gitignore`:

```
playwright-report/
test-results/
```

- [ ] **Step 4: Create the config skeleton**

Create `playwright.config.js`:

```js
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
```

- [ ] **Step 5: Verify Playwright runs (with no tests yet)**

Run: `npx playwright test`
Expected: `Error: No tests found` (proves the config loads and `testMatch` is wired up — there are simply no `*.spec.js` files yet).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore playwright.config.js
git commit -m "chore: add Playwright for extension e2e testing"
```

---

### Task 2: Fixture port constant and static "Slides" fixture page

**Files:**
- Create: `tests/e2e/support/constants.js`
- Create: `tests/e2e/fixtures/slides.html`

**Interfaces:**
- Produces: `constants.js` exports `{ FIXTURE_PORT: 8973 }`, consumed by `bin/e2e_mode_on`/`off` (Task 3) and `fixture-server.js` (Task 4).

- [ ] **Step 1: Create the shared port constant**

Create `tests/e2e/support/constants.js`:

```js
module.exports = {
  FIXTURE_PORT: 8973,
};
```

- [ ] **Step 2: Create the fixture page**

Create `tests/e2e/fixtures/slides.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Speechwave e2e fixture — Slides stand-in</title>
</head>
<body>
  <!-- Mimics the DOM element the Google Slides adapter reads the current
       slide number from (see adapters/google_slides.js and the Jest
       equivalent, tests/fixtures/google_slides_dom.html). -->
  <div
    class="punch-viewer-svgpage-a11yelement"
    aria-label="Slide 1 of 10: Title text"
    role="img"
    tabindex="0"
  ></div>
</body>
</html>
```

- [ ] **Step 3: Verify the constant loads**

Run: `node -e "console.log(require('./tests/e2e/support/constants.js').FIXTURE_PORT)"`
Expected: `8973`

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/support/constants.js tests/e2e/fixtures/slides.html
git commit -m "test: add e2e fixture port constant and Slides stand-in page"
```

---

### Task 3: `bin/e2e_mode_on` / `bin/e2e_mode_off`

**Files:**
- Create: `bin/e2e_mode_on`
- Create: `bin/e2e_mode_off`

**Interfaces:**
- Consumes: `tests/e2e/support/constants.js`'s `FIXTURE_PORT` (Task 2).
- Produces: idempotent scripts that add/remove `http://localhost:<FIXTURE_PORT>/*` from `manifest.json`'s `content_scripts[0].matches`. Used by `global-setup.js`/`global-teardown.js` (Task 6).

These use `node -e` for the manifest edit rather than `sed` (unlike `bin/dev_mode_on`/`off`) because `content_scripts[0].matches` is a JSON array — safe, correct array mutation needs real JSON parsing, not line-oriented text substitution.

- [ ] **Step 1: Create `bin/e2e_mode_on`**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

FIXTURE_PORT="$(node -e "console.log(require('$ROOT/tests/e2e/support/constants.js').FIXTURE_PORT)")"
FIXTURE_ORIGIN="http://localhost:${FIXTURE_PORT}/*"

if grep -q "$FIXTURE_ORIGIN" "$ROOT/manifest.json"; then
  echo "e2e mode already ON"
  exit 0
fi

MANIFEST_PATH="$ROOT/manifest.json" FIXTURE_ORIGIN="$FIXTURE_ORIGIN" node -e '
const fs = require("fs");
const path = process.env.MANIFEST_PATH;
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
manifest.content_scripts[0].matches.push(process.env.FIXTURE_ORIGIN);
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
'

echo "e2e mode ON — ${FIXTURE_ORIGIN} added to content_scripts matches"
```

- [ ] **Step 2: Create `bin/e2e_mode_off`**

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$SCRIPT_DIR/.."

FIXTURE_PORT="$(node -e "console.log(require('$ROOT/tests/e2e/support/constants.js').FIXTURE_PORT)")"
FIXTURE_ORIGIN="http://localhost:${FIXTURE_PORT}/*"

MANIFEST_PATH="$ROOT/manifest.json" FIXTURE_ORIGIN="$FIXTURE_ORIGIN" node -e '
const fs = require("fs");
const path = process.env.MANIFEST_PATH;
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
manifest.content_scripts[0].matches = manifest.content_scripts[0].matches.filter(
  (m) => m !== process.env.FIXTURE_ORIGIN
);
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
'

echo "e2e mode OFF — ${FIXTURE_ORIGIN} removed from content_scripts matches"
```

- [ ] **Step 3: Make both executable**

Run: `chmod +x bin/e2e_mode_on bin/e2e_mode_off`

- [ ] **Step 4: Verify the round trip**

Do not use `git stash`/`git checkout` for this — `manifest.json` may have
unrelated uncommitted changes already, and stashing/checking it out would
touch state this task doesn't own. Instead snapshot and restore the file
directly with `cp`:

Run:
```bash
cp manifest.json /tmp/manifest.json.before-e2e-mode-test
bin/e2e_mode_on
grep "localhost:8973" manifest.json
bin/e2e_mode_on   # idempotency check
bin/e2e_mode_off
grep -c "localhost:8973" manifest.json || true
diff /tmp/manifest.json.before-e2e-mode-test manifest.json && echo "restored cleanly"
rm /tmp/manifest.json.before-e2e-mode-test
```
Expected: after `e2e_mode_on`, `grep` finds the line; the second `e2e_mode_on` call prints "already ON" and doesn't duplicate it; after `e2e_mode_off`, the `grep -c` finds zero matches (prints `0`, exits non-zero, hence `|| true`); the `diff` prints nothing and `"restored cleanly"` confirms `manifest.json` is byte-for-byte back to whatever it was before this step ran (whatever that was).

- [ ] **Step 5: Commit**

```bash
git add bin/e2e_mode_on bin/e2e_mode_off
git commit -m "feat: add e2e_mode toggle to inject content script into the e2e fixture page"
```

---

### Task 4: Local fixture server

**Files:**
- Create: `tests/e2e/support/fixture-server.js`

**Interfaces:**
- Consumes: `tests/e2e/support/constants.js`'s `FIXTURE_PORT` (Task 2), `tests/e2e/fixtures/slides.html` (Task 2).
- Produces: `startFixtureServer(): Promise<http.Server>` — resolves once listening on `localhost:<FIXTURE_PORT>`. Used by `global-setup.js`/`global-teardown.js` (Task 6).

- [ ] **Step 1: Create the server module**

```js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { FIXTURE_PORT } = require("./constants");

const FIXTURE_FILE = path.join(__dirname, "..", "fixtures", "slides.html");

function startFixtureServer() {
  const html = fs.readFileSync(FIXTURE_FILE);
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(FIXTURE_PORT, "localhost", () => resolve(server));
  });
}

module.exports = { startFixtureServer };
```

- [ ] **Step 2: Verify it serves the fixture**

Run:
```bash
node -e "
require('./tests/e2e/support/fixture-server').startFixtureServer().then(async (server) => {
  const res = await fetch('http://localhost:8973/');
  const body = await res.text();
  console.log('status:', res.status);
  console.log('has slide element:', body.includes('punch-viewer-svgpage-a11yelement'));
  server.close();
});
"
```
Expected: `status: 200` and `has slide element: true`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/support/fixture-server.js
git commit -m "feat: add local static server for the e2e Slides fixture page"
```

---

### Task 5: speechwave repo integration helpers

**Files:**
- Create: `tests/e2e/support/speechwave.js`

**Interfaces:**
- Produces:
  - `seedTalk(email: string): { email, talk_id, talk_slug, session_id }` — runs speechwave's `seed_active_session.exs`.
  - `fetchApiKey(email: string): string` — the seeded user's 64-char hex API key.
  - `cleanupTestUser(): void` — runs speechwave's `cleanup_manual_test_users.exs` (takes no arguments; it deletes all `manual-test-%@example.com` rows).
- Consumed by: `connect.spec.js` (Task 8).

Precondition for the verification step: the speechwave dev server's database must be set up (`mix ecto.setup` already run at some point) — this is a pre-existing precondition of `seed_active_session.exs` itself, not new to this task.

- [ ] **Step 1: Create the helper module**

```js
const { execFileSync } = require("child_process");
const path = require("path");

const SPEECHWAVE_ROOT = path.join(__dirname, "..", "..", "..", "..", "speechwave");

function parseKeyValueOutput(output) {
  const result = {};
  for (const line of output.split("\n")) {
    const match = line.match(/^(\w+)=(.*)$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function seedTalk(email) {
  const output = execFileSync(
    "mix",
    ["run", "scripts/manual_tests/seed_active_session.exs", email],
    { cwd: SPEECHWAVE_ROOT, encoding: "utf8" }
  );
  return parseKeyValueOutput(output);
}

function fetchApiKey(email) {
  const output = execFileSync(
    "mix",
    [
      "run",
      "-e",
      `IO.puts(Speechwave.Accounts.get_user_by_email(${JSON.stringify(email)}).api_key)`,
    ],
    { cwd: SPEECHWAVE_ROOT, encoding: "utf8" }
  );
  return output.trim();
}

function cleanupTestUser() {
  execFileSync("mix", ["run", "scripts/manual_tests/cleanup_manual_test_users.exs"], {
    cwd: SPEECHWAVE_ROOT,
    stdio: "inherit",
  });
}

module.exports = { seedTalk, fetchApiKey, cleanupTestUser };
```

- [ ] **Step 2: Verify against a running dev server**

Precondition: `pitchfork start speechwave/web` (or confirm `pitchfork status speechwave/web` shows `running`) in the `speechwave` repo.

Run:
```bash
node -e "
const { seedTalk, fetchApiKey, cleanupTestUser } = require('./tests/e2e/support/speechwave');
const email = 'manual-test-' + Date.now() + '@example.com';
const seeded = seedTalk(email);
console.log('seeded:', seeded);
const key = fetchApiKey(email);
console.log('api key format ok:', /^[0-9a-f]{64}$/i.test(key));
cleanupTestUser();
"
```
Expected: `seeded:` prints an object with `email`, `talk_id`, `talk_slug`, `session_id`; `api key format ok: true`; cleanup runs without error.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/support/speechwave.js
git commit -m "feat: add speechwave repo integration helpers for e2e seeding/cleanup"
```

---

### Task 6: Playwright extension fixtures (launch context + extension ID)

**Files:**
- Create: `tests/e2e/support/extension-fixtures.js`

**Interfaces:**
- Produces: `{ test, expect }` — a Playwright `test` object extended with:
  - `context` fixture: a `launchPersistentContext` with the real unpacked extension loaded, using a fresh temp `userDataDir` (cleaned up after).
  - `extensionId` fixture: the loaded extension's ID, resolved from its service worker.
- Consumed by: `connect.spec.js` (Task 8), in place of Playwright's default `test`/`expect`.

- [ ] **Step 1: Create the fixtures module**

```js
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
```

- [ ] **Step 2: Write a throwaway smoke spec to verify the fixtures**

Create `tests/e2e/_smoke.spec.js` (temporary — deleted in Step 4):

```js
const { test, expect } = require("./support/extension-fixtures");

test("extension loads and reports an id", async ({ extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
});
```

- [ ] **Step 3: Run it**

Run: `npx playwright test tests/e2e/_smoke.spec.js`
Expected: 1 passed. (A visible Chrome window will briefly open — expected with `headless: false`.)

- [ ] **Step 4: Delete the throwaway spec**

Run: `rm tests/e2e/_smoke.spec.js`

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/support/extension-fixtures.js
git commit -m "feat: add Playwright fixtures for loading the real extension"
```

---

### Task 7: Global setup / teardown (pitchfork, dev mode, e2e mode, fixture server)

**Files:**
- Create: `tests/e2e/support/global-setup.js`
- Create: `tests/e2e/support/global-teardown.js`
- Modify: `playwright.config.js`

**Interfaces:**
- Consumes: `startFixtureServer` (Task 4), `bin/dev_mode_on`/`off` (pre-existing), `bin/e2e_mode_on`/`off` (Task 3).
- Produces: wires `globalSetup`/`globalTeardown` into `playwright.config.js`. State is passed between setup and teardown via `globalThis` (both run in the same root process for a single `playwright test` invocation) and via `process.env.SPEECHWAVE_E2E_DEV_MODE_WAS_ON`.

- [ ] **Step 1: Create `global-setup.js`**

```js
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { startFixtureServer } = require("./fixture-server");

const ROOT = path.join(__dirname, "..", "..", "..");
const PITCHFORK_DAEMON = "speechwave/web";

function ensureDevServerRunning() {
  let running = false;
  try {
    const output = execFileSync("pitchfork", ["status", PITCHFORK_DAEMON, "--json"], {
      encoding: "utf8",
    });
    running = JSON.parse(output).status === "running";
  } catch {
    running = false;
  }

  if (!running) {
    execFileSync("pitchfork", ["start", PITCHFORK_DAEMON], { stdio: "inherit" });
  }
}

function ensureDevModeOn() {
  const backgroundJs = fs.readFileSync(path.join(ROOT, "background", "background.js"), "utf8");
  const wasAlreadyOn = /^const DEV_MODE = true;/m.test(backgroundJs);
  process.env.SPEECHWAVE_E2E_DEV_MODE_WAS_ON = wasAlreadyOn ? "1" : "0";

  if (!wasAlreadyOn) {
    execFileSync(path.join(ROOT, "bin", "dev_mode_on"), { stdio: "inherit" });
  }
}

module.exports = async function globalSetup() {
  ensureDevServerRunning();
  ensureDevModeOn();
  execFileSync(path.join(ROOT, "bin", "e2e_mode_on"), { stdio: "inherit" });

  globalThis.__speechwaveFixtureServer = await startFixtureServer();
};
```

- [ ] **Step 2: Create `global-teardown.js`**

```js
const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "..");

module.exports = async function globalTeardown() {
  const server = globalThis.__speechwaveFixtureServer;
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  execFileSync(path.join(ROOT, "bin", "e2e_mode_off"), { stdio: "inherit" });

  if (process.env.SPEECHWAVE_E2E_DEV_MODE_WAS_ON === "0") {
    execFileSync(path.join(ROOT, "bin", "dev_mode_off"), { stdio: "inherit" });
  }
};
```

- [ ] **Step 3: Wire both into `playwright.config.js`**

Edit `playwright.config.js`, adding two fields to the `defineConfig` call:

```js
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
```

- [ ] **Step 4: Verify setup/teardown run cleanly with no tests**

Do **not** stop the `speechwave/web` pitchfork daemon to test this — it may
be a real dev daemon in active use outside this task, and stopping someone's
live dev server as a side effect of a verification step is not this task's
call to make. Verify against whatever state the daemon is actually in:

- If `pitchfork status speechwave/web` currently shows `running`: verify the
  "already running, don't restart" branch — after the run, confirm the same
  `pid` is reported (`pitchfork status speechwave/web --json`), proving
  `ensureDevServerRunning` did not touch it.
- If it currently shows anything else: verify the "start it" branch — after
  the run, confirm it shows `running`.
- Either way, do not use `pitchfork stop` to force one path or the other.

Also confirm, by reading `ensureDevServerRunning`'s code, that the untested
branch (the one your current daemon state didn't exercise) is logically
sound — this is a code-review check, not something to force by stopping a
live daemon.

For the manifest/dev-mode side: note whatever `background/background.js`'s
`DEV_MODE` value is *before* this step (it may already be `true` from
unrelated local work — that's fine, `ensureDevModeOn` is designed to leave
it alone in that case).

Run: `npx playwright test tests/e2e/_smoke.spec.js` — recreate the throwaway spec from Task 6 Step 2 temporarily, or run any single spec; if none exist yet, running `npx playwright test` with zero specs still executes `globalSetup`/`globalTeardown` in current Playwright versions when explicitly invoked — confirm this is the case, and if not, temporarily add back the Task 6 smoke spec for this verification, deleting it again afterward.

Expected: `manifest.json` temporarily shows the e2e fixture origin mid-run; `background/background.js` temporarily shows `DEV_MODE = true` mid-run; after the run, `manifest.json`'s content_scripts matches are back to their pre-run state, and `background/background.js`'s `DEV_MODE` value matches whatever it was *before* this step ran (not necessarily `false` — see above). Check with `git diff` for `manifest.json`'s `content_scripts` section specifically, since `manifest.json` may carry unrelated pre-existing uncommitted changes this task doesn't own.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/support/global-setup.js tests/e2e/support/global-teardown.js playwright.config.js
git commit -m "feat: wire up e2e global setup/teardown (dev server, dev mode, fixture server)"
```

---

### Task 8: `connect.spec.js` — the end-to-end test

**Files:**
- Create: `tests/e2e/connect.spec.js`

**Interfaces:**
- Consumes: `{ test, expect }` from `extension-fixtures.js` (Task 6); `{ seedTalk, fetchApiKey, cleanupTestUser }` from `speechwave.js` (Task 5).

- [ ] **Step 1: Write the test**

```js
const { test, expect } = require("./support/extension-fixtures");
const { seedTalk, fetchApiKey, cleanupTestUser } = require("./support/speechwave");

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

test("supplying an API key and connecting to a talk reaches a real channel join", async ({
  context,
  extensionId,
}) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);

  await expect(popup.locator("#setup-section")).toBeVisible();
  await expect(popup.locator("#main-section")).toBeHidden();

  const apiKey = fetchApiKey(email);
  await popup.locator("#api-key-input").fill(apiKey);
  await popup.locator("#save-api-key-btn").click();

  await expect(popup.locator("#main-section")).toBeVisible();
  await expect(popup.locator("#setup-section")).toBeHidden();

  await popup.locator("#slug-input").fill(talkSlug);
  await popup.locator("#connect-btn").click();

  await expect(popup.locator("#dot")).toHaveClass(/connected/);
  await expect(popup.locator("#status-text")).toHaveText("Connected");
  await expect(popup.locator("#session-section")).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Precondition: same as Task 7 Step 4 (clean `DEV_MODE = false` state beforehand is not required now — global setup handles it either way — but the `speechwave` repo's DB must be migrated, i.e. `mix ecto.setup`/`mix ecto.migrate` already run at least once).

Run: `npm run test:e2e`
Expected: 1 passed. The full path is exercised live: popup → `chrome.storage.sync` → service worker → real `ws://localhost:4000/socket` Phoenix channel join → response back to popup → `#dot` gets `connected`.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/connect.spec.js
git commit -m "test: add e2e connect-flow test driving the real extension"
```

---

### Task 9: Documentation

**Files:**
- Create: `docs/manual_tests.md`
- Modify: `README.md`

**Interfaces:** None (docs only).

- [ ] **Step 1: Write `docs/manual_tests.md`**

```markdown
# End-to-End Extension Tests

Playwright-driven tests that load the *real* unpacked extension in a real
Chrome instance and drive it against a live local speechwave dev server —
the popup, the service worker's WebSocket connection, all of it, no mocks.
This is what catches the class of bug the Jest suite (`tests/`, pure-logic
and DOM-fixture tests) structurally can't: real popup/service-worker/
content-script wiring, and the real handshake with a running backend.

**Not CI-gated.** Run on demand, same spirit as speechwave's
`docs/manual_tests.md` — ad-hoc, agent- or human-runnable verification, not
a merge gate.

## Prerequisites

- The `speechwave` repo checked out as a sibling directory: `../speechwave`
  relative to this repo (see `AGENTS.md`).
- `npm install && npx playwright install chromium` (once).
- speechwave's DB migrated at least once (`mix ecto.setup` in `../speechwave`).

## Running

```sh
npm run test:e2e
```

This automatically, for the duration of the run only:
- starts speechwave's dev server via `pitchfork` if it isn't already running
  (left running afterward — it's a shared dev daemon),
- turns on `DEV_MODE` (points the extension at `ws://localhost:4000`) if it
  wasn't already on, reverting it afterward only if this run turned it on,
- patches `manifest.json` so the content script also injects into the local
  fixture page standing in for Google Slides, reverting the patch
  unconditionally afterward,
- serves that fixture page locally.

## What's covered

- **`connect.spec.js`** — fresh extension profile → enter API key → save →
  enter a seeded talk's slug → Connect → asserts the popup reflects a real,
  live Phoenix channel join.

## What's not covered (yet)

- The reaction-overlay round trip (attendee reaction → real channel
  broadcast → content script renders it on the fixture page).
- Slide-number detection and the fireworks animation.
- Behavior against real Google Slides (deliberately out of scope — Google's
  login flow actively blocks automated sign-in; see
  `docs/specs/2026-08-06-extension-playwright-e2e-testing-design.md` for why).
```

- [ ] **Step 2: Add a short pointer in `README.md`**

Find the existing "The Chrome extension lives in a separate repo" paragraph area in speechwave's own README is irrelevant here — instead, in *this* repo's `README.md`, find the testing section (near where `npm test` for Jest is documented) and add immediately after it:

```markdown
### End-to-end tests

`npm run test:e2e` runs a Playwright suite that loads the real extension
against a live local speechwave dev server. See `docs/manual_tests.md`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/manual_tests.md README.md
git commit -m "docs: document the e2e Playwright test suite"
```

---

## Self-Review Notes

- **Spec coverage:** Section 1 (why Playwright) → informs architecture, no code artifact needed. Section 2 (architecture) → Tasks 1–8 collectively. Section 3 (pitchfork) → Task 7. Section 4 (extension loading/ID) → Task 6. Section 5 (content-script injection patch) → Task 3. Section 6 (fixture page) → Task 2/4. Section 7 (backend integration) → Task 5. Section 8 (connect.spec.js steps) → Task 8. Section 9 (docs) → Task 9. Section 10 (deferred items) → intentionally has no task. Known Limitations (headed Chrome, extension-ID timeout, manifest-patch scope) → addressed directly in Task 6 Step 1's `waitForEvent` timeout and Task 3's independent-field reasoning.
- **Placeholder scan:** no TBD/TODO; every step has real, complete code.
- **Type/name consistency checked:** `FIXTURE_PORT` (Task 2) used identically in `bin/e2e_mode_on`/`off` (Task 3) and `fixture-server.js` (Task 4). `seedTalk`/`fetchApiKey`/`cleanupTestUser` (Task 5) signatures match their usage in `connect.spec.js` (Task 8) exactly, including `cleanupTestUser()` taking no arguments. `test`/`expect` exported from `extension-fixtures.js` (Task 6) match the import in `connect.spec.js` (Task 8).
