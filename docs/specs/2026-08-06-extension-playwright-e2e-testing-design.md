# Design: Chrome Extension End-to-End Testing (Playwright)

**Date:** 2026-08-06
**Status:** Approved

## Summary

Manual verification of the Chrome extension — and of the extension talking to
a real Speechwave backend — is a major time sink and slows down development.
The existing Jest suite (`tests/`) only covers pure logic (fireworks trigger
math, DOM adapters via static fixtures); nothing exercises the real popup,
service worker, or content script running in an actual browser against a real
server.

This introduces a Playwright-based end-to-end suite, in this repo, that loads
the real unpacked extension in a real Chrome instance, drives it against a
live local Speechwave dev server, and asserts on real UI state. It is
agent-runnable on demand — no human required to click through the flow — but
is **not CI-gated**, mirroring the speechwave repo's existing
`docs/manual_tests.md` scripts and their stated principle: prefer full
automation with UI-based assertions, but treat it as ad-hoc verification
rather than a CI blocker.

First deliverable: `connect.spec.js`, proving the core path end to end —
supplying an API key, connecting to a talk, and reaching a real Phoenix
channel join — since that's the flow every other extension feature builds on.

Out of scope for this round: the reaction-overlay round trip, slide-number
detection, fireworks, a real-Google-Slides variant, and CI-gating. See
"Explicitly deferred" below.

---

## Section 1: Why Playwright, not rodney

The speechwave repo's `scripts/manual_tests/*.sh` already drive a real dev
server with `rodney`, a CDP-based Chrome CLI, and that pattern works well for
straightforward page-navigation flows. It does not fit extension testing:

- **Extension ID resolution.** An unpacked extension's ID isn't written
  anywhere; rodney would need to scrape `chrome://extensions` (a
  Shadow-DOM-heavy Polymer UI, painful to automate with plain CSS selectors)
  or replicate Chrome's path-hashing algorithm offline. Playwright's
  `context.serviceWorkers()` returns the running service worker directly,
  and its `chrome-extension://<id>/...` URL gives the ID with no guessing.
- **Async coordination across contexts.** This flow spans three contexts —
  popup UI, service worker (owns the WebSocket), content script (renders the
  overlay) — plus a real Phoenix channel round trip. rodney's waiting
  primitives are coarse (`waitload`, `waitstable`, `sleep`); Playwright's
  auto-retrying assertions are built for exactly this kind of
  wait-for-eventually-true-across-an-async-boundary condition, which is where
  flakiness would otherwise creep in.

This is scoped to the chrome-extension repo only. The speechwave repo's
`rodney`-based scripts are untouched and keep working as-is — this is using
the right tool where extensions are involved, not a wholesale migration.

---

## Section 2: Architecture

```text
Playwright test process (tests/e2e/)
  |
  |-- pitchfork: ensures speechwave's `web` daemon (mix phx.server) is up
  |
  |-- launches Chrome via launchPersistentContext(--load-extension=...)
  |     |-- resolves extension ID from context.serviceWorkers()
  |
  |-- opens popup page:      chrome-extension://<id>/popup/popup.html
  |-- opens fixture page:    http://localhost:<ephemeral>/  (local static server,
  |                          stands in for Google Slides; content script injected
  |                          via a temporary manifest.json patch)
  |
  |-- shells out to ../speechwave for seed data (talk, session, API key)
        and cleanup — no speechwave files modified
```

---

## Section 3: Dev server lifecycle (pitchfork)

speechwave's `pitchfork.toml` already defines a `web` daemon
(`exec mix phx.server`, port 4000, `ready_http` check at `/health`). Global
setup checks its status and starts it if not running, waiting on the
`ready_http` check rather than polling the port directly. It is **left
running** afterward — it's a persistent dev daemon the developer may also be
using, not something this test suite owns the lifecycle of.

This replaces the "check reachable, error out" pattern used by the backend's
`run_all_dev.sh` — that pattern assumes a human is watching a terminal and
will notice the error. An agent running this suite unattended needs it to
just work.

---

## Section 4: Loading the real extension & finding its ID

```js
const context = await chromium.launchPersistentContext(tmpUserDataDir, {
  headless: false, // persistent-context extension loading needs a real head
  args: [
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
  ],
});
const background =
  context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
const extensionId = background.url().split("/")[2];
```

`tmpUserDataDir` is a fresh temp directory per run (isolation — no stored API
key or connection state leaking between runs) and is removed in teardown.
`headless: false` is fine here since this runs on-demand on a dev machine,
not in CI.

---

## Section 5: Content-script injection into the fixture page

`manifest.json`'s `content_scripts[0].matches` is hardcoded to
`https://docs.google.com/presentation/*`, so the content script won't inject
into a local fixture page without a change.

New `bin/e2e_mode_on` / `bin/e2e_mode_off` scripts, mirroring the existing
`bin/dev_mode_on` / `dev_mode_off` sed-patching convention, add the fixture
server's local origin to `content_scripts[0].matches`. Unlike the existing
dev-mode toggle — which relies on a human remembering to run `dev_mode_off`
before committing — `e2e_mode_on`/`off` are invoked automatically by the
Playwright global setup/teardown (teardown runs in a `finally`, so it reverts
even on test failure). The manifest is never left patched.

---

## Section 6: Fixture "Slides" page

A new `tests/e2e/fixtures/slides.html` — a full standalone HTML document
(unlike the DOM fragment `tests/fixtures/google_slides_dom.html` used by
Jest, which relies on jsdom and doesn't need a full page) containing the same
slide-indicator element the Google Slides adapter looks for:

```html
<div class="punch-viewer-svgpage-a11yelement"
     aria-label="Slide 1 of 10: Title text" role="img" tabindex="0"></div>
```

Served by a small local static file server (Node's built-in `http` module —
no new dependency) on an ephemeral port, started in test setup and stopped in
teardown.

**Accepted tradeoff:** this doesn't catch it if Google changes their real
DOM. That risk isn't new here — the existing Jest fixture
(`tests/fixtures/google_slides_dom.html`, captured March 2026, with a comment
telling you to update it if Google's DOM changes) already made this
tradeoff. This design extends the same accepted tradeoff to the e2e layer
rather than introducing a new one. See "Explicitly deferred" for the narrower
fix if drift ever becomes a real problem.

---

## Section 7: Backend integration (speechwave repo — unmodified)

All commands run via `cd ../speechwave && ...`, matching this repo's
`AGENTS.md`, which already states speechwave lives at `../speechwave/`
relative to this project. No files in speechwave are changed.

- **Seed:** `mix run scripts/manual_tests/seed_active_session.exs <generated-email>`
  → prints `talk_slug=`, `session_id=` (existing script, reused as-is).
- **API key:** a one-off `mix run -e` invocation reading the seeded user's
  `api_key` field (auto-generated at registration; no schema change needed).
- **Cleanup:** reuse the existing `scripts/manual_tests/cleanup_manual_test_users.exs`
  / `.sh`.

---

## Section 8: First test — `connect.spec.js`

1. Global setup: ensure the `web` pitchfork daemon is up (Section 3).
2. Launch Chrome with the extension loaded; resolve the extension ID
   (Section 4).
3. Seed a talk in speechwave; fetch the seeded user's API key (Section 7).
4. Open the popup page. Assert `#setup-section` is visible (fresh profile →
   no stored key yet).
5. Enter the API key into `#api-key-input`, click `#save-api-key-btn`. Assert
   `#main-section` becomes visible.
6. Enter the talk slug into `#slug-input`, click `#connect-btn`. Assert `#dot`
   gains the `connected` class and `#status-text` updates. This is the actual
   proof: popup → service worker → real Phoenix WebSocket channel join, all
   live, no mocks.
7. Teardown: close the Playwright context, run `e2e_mode_off` (Section 5),
   run the speechwave cleanup script, remove the temp user-data dir. The
   pitchfork `web` daemon is left running (Section 3).

---

## Section 9: Docs & conventions

- A new `docs/manual_tests.md`-equivalent in this repo (or a dedicated
  section in `README.md`) documents: prerequisites (speechwave checked out
  as `../speechwave`, `npm install` done here), how to run
  (`npm run test:e2e`), what's covered, and that it's ad-hoc/agent-runnable —
  not CI-gated — mirroring the principles already stated in speechwave's
  `docs/manual_tests.md`.
- `package.json`: add `@playwright/test` as a devDependency; add a
  `test:e2e` script, kept separate from the existing `test` (Jest) script so
  unit and e2e suites stay clearly distinguished.

---

## Section 10: Explicitly deferred

Named here so scope stays tight — not designed or built in this round:

- **Reaction-overlay round trip** — a real attendee tab
  (`http://localhost:4000/t/<slug>`) sends a reaction, and the fixture page's
  content script renders it (`#speechwave-overlay` gains a `.floating-emoji`
  child). Natural next script once `connect.spec.js` is solid, same pattern.
- **Slide-number detection** via mutating the fixture page's `aria-label`,
  asserting the popup's slide indicator updates.
- **Fireworks** via the existing dev-mode `TEST_FIREWORKS` popup button.
- **Real-Google-Slides DOM-drift check** — a periodic, human-triggered
  script that authenticates once, snapshots the real Slides DOM, and diffs
  it against `tests/fixtures/google_slides_dom.html` / `tests/e2e/fixtures/slides.html`
  to flag drift. Deliberately not full interactive e2e against live
  Google — Google's login flow actively detects and blocks
  CDP/Playwright/Selenium-driven sign-ins as an anti-bot measure, so that
  path is adversarial, not just a matter of engineering effort, and any
  session obtained would need recurring re-auth (2FA/"verify it's you"
  challenges) to stay usable. Only worth building if drift actually causes a
  bug later.
- **CI-gating.**

---

## Known Limitations / Risks

- **Headed Chrome required.** `launchPersistentContext` with
  `--load-extension` needs a real display; fine for on-demand local/agent
  runs on a dev machine, but would need re-evaluation (headless-new mode
  support for MV3 extensions, or a virtual display) if this is ever
  CI-gated.
- **Extension ID resolution timing.** If the service worker hasn't started
  by the time `context.serviceWorkers()` is checked, the code falls back to
  `waitForEvent("serviceworker")` with an explicit timeout — a bare wait
  without a timeout would hang indefinitely on a genuine startup failure.
- **Manifest patch scope.** `e2e_mode_on`/`off` only ever touch
  `content_scripts[0].matches`, a field independent of what `dev_mode_on`/
  `off` touch (`DEV_MODE` consts and `host_permissions`), so the two toggles
  don't conflict even if both happen to be applied at once.
