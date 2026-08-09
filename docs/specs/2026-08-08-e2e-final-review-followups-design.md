# Design: Follow-ups from the e2e Final Review

**Date:** 2026-08-08
**Status:** Approved

## Summary

The final whole-branch review of `docs/plans/2026-08-08-remaining-e2e-deferred-items.md`
(merged to `main`) came back clean — no Critical or Important findings — but
surfaced seven Minor findings. This picks up all seven. None were blocking,
so this is cleanup, not a fix for broken behavior; each item below is
either a doc-accuracy fix, a small defensive-code change, or a DRY
extraction, scoped to avoid turning "follow up on the minors" into a
larger refactor than the findings actually call for.

## Item 1: stale README.md adapter snippets

`README.md`'s "Slide tracking" section has two code snippets that no
longer match the real code:
- `getAdapter`'s snippet shows the pre-refactor `url.includes("docs.google.com/presentation")`
  check, replaced by the manifest-derived match in
  `docs/specs/2026-08-08-remaining-e2e-deferred-items-design.md`.
- `getSlide`'s snippet shows `input[aria-label*="Slide"]` +
  `.value` — this was already stale before that round; the real
  `adapters/google_slides.js` reads
  `.punch-viewer-svgpage-a11yelement[aria-label*="Slide"]` and parses the
  slide number out of the `aria-label` string via regex, not an `<input>`'s
  `.value`.

**Fix:** replace both snippets in `README.md` with the real current code
from `adapters/index.js` and `adapters/google_slides.js`.

## Item 2 & 4: `adapters/index.js` cleanup

**Item 4 (real defect, though narrow):** `getAdapter(url)` can now throw
if `chrome.runtime.getManifest()` fails (e.g. "Extension context
invalidated" after the extension reloads while a content script is still
running) — the old hardcoded regex could never throw. `content.js` calls
`startSlideObserver()` (which calls `getAdapter` once, at load) before its
`GET_REMOTE_CONFIG` request, so an uncaught throw here would abort the rest
of the content script's module body, silently leaving remote config
unrequested.

**Fix:** wrap the body in try/catch, returning the fallback adapter on
failure:

```js
function getAdapter(url) {
  try {
    const { matches } = chrome.runtime.getManifest().content_scripts[0];
    const isContentScriptUrl = matches.some((pattern) => url.startsWith(pattern.replace(/\*$/, "")));
    return isContentScriptUrl ? ADAPTERS[0] : { getSlide: () => 0 };
  } catch {
    return { getSlide: () => 0 };
  }
}
```

A new Jest test mocks `chrome.runtime.getManifest` to throw and asserts
`getAdapter(...)` returns the fallback instead of propagating.

**Item 2 (shape cleanup):** with per-adapter `match` dropped and the
return hardcoded to `ADAPTERS[0]`, the `ADAPTERS` array can no longer
actually register more than one adapter — it's an array shape implying an
extensibility the code no longer has. Collapse it to a single object.
Public interface (`getAdapter(url)`, `window.SpeechwaveAdapterRegistry`)
is unchanged, so nothing outside this file changes:

```js
const GOOGLE_SLIDES_ADAPTER = {
  getSlide: (typeof window !== "undefined" && window.SpeechwaveGoogleSlidesAdapter)
    ? window.SpeechwaveGoogleSlidesAdapter.getSlide
    : (typeof require !== "undefined" ? require("./google_slides").getSlide : () => 0),
};

function getAdapter(url) {
  try {
    const { matches } = chrome.runtime.getManifest().content_scripts[0];
    const isContentScriptUrl = matches.some((pattern) => url.startsWith(pattern.replace(/\*$/, "")));
    return isContentScriptUrl ? GOOGLE_SLIDES_ADAPTER : { getSlide: () => 0 };
  } catch {
    return { getSlide: () => 0 };
  }
}
```

## Item 3: prefix-check vs. Chrome's real match-pattern semantics — no action

`background.js`'s `broadcastToSlidesTabs` hands raw match patterns to
`chrome.tabs.query`, which has Chrome's real match-pattern engine built
in (handles scheme/host wildcards, etc). `adapters/index.js` has to
evaluate a URL string itself in JS, so it can't delegate the same way —
there's no shared logic between the two to unify, just two different
mechanisms solving related problems. Writing a full match-pattern parser
to close a gap that only matters if the manifest ever gains a
scheme/host-wildcard pattern (it doesn't today, and nothing in this
codebase's design anticipates one) is exactly the scope the original
`docs/specs/2026-08-07-reaction-overlay-e2e-design.md` explicitly
rejected for the analogous `background.js` fix. The existing code comment
in `adapters/index.js` already discloses this assumption. No code change.

## Item 5: `fireworks.spec.js` doesn't need a seeded talk at all

Tracing what actually gates `#test-fireworks-btn`'s visibility:
`popup/popup.js`'s `saveApiKeyBtn` handler only checks the key's *format*
(`/^[0-9a-f]{64}$/i`) client-side and calls `chrome.storage.sync.set(...)`
— no server round trip. `showMain()` (which reveals `#main-section`, and
therefore the button) fires from that same client-side path. So
`fireworks.spec.js` never needed `connectViaPopup`, a real channel join,
or a seeded talk/session — it was doing unnecessary backend work and, as
a side effect, adding a third caller to the shared `manual-test-*` cleanup
that `docs/specs/2026-08-07-reaction-overlay-e2e-design.md`'s final review
already flagged as fragile if `playwright.config.js`'s `workers: 1` is
ever changed.

**Fix:** drop `beforeAll`/`afterAll`/`seedTalk`/`fetchApiKey`/`cleanupTestUser`
from `fireworks.spec.js` entirely. Save a syntactically-valid dummy key
directly:

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

This is a real shape change (removing the seed lifecycle entirely, not
just narrowing what `cleanupTestUser` deletes), larger than the
reviewer's one-line suggestion — called out explicitly since it's a
bigger diff than "fix the finding" usually implies.

## Item 6: shared `seedTalkForSuite()` helper

After Item 5, three specs (`connect.spec.js`, `reaction-overlay.spec.js`,
`slide-detection.spec.js`) still share the identical 11-line
seed/cleanup preamble. New `tests/e2e/support/seed.js`:

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

`test.beforeAll` always completes before any `test(...)` body in the same
file runs, so `seeded.email`/`seeded.talkSlug` are populated by the time
test bodies read them — same ordering guarantee the inline version had.
This is a new file rather than an addition to `tests/e2e/support/speechwave.js`,
which is pure backend-shellout logic with zero Playwright dependency
today; adding `test.beforeAll`/`afterAll` registration there would blur
that file's single responsibility (mirrors the reasoning that put
`openFixturePage` in its own `fixture.js` rather than folding it into an
existing file).

Each of the three specs shrinks its preamble to one line
(`const seeded = seedTalkForSuite();`) and reads `seeded.email` /
`seeded.talkSlug` instead of the old `email` / `talkSlug` module-level
`let`s.

## Item 7: restore the out-of-scope pointer in `docs/manual_tests.md`

The prior round's docs edit dropped the "What's not covered (yet)"
section, including its real-Google-Slides bullet — correct call for the
"(yet)" framing, since both prior items are now covered, but it also
deleted the only place in *living* documentation (as opposed to a dated
design doc) stating that real-Google-Slides behavior has no automated
coverage. `docs/manual_tests.md` is the file a human or agent opens to
decide what still needs manual verification; it should keep saying so.

**Fix:** add a new section after "What's covered", not reviving the "(yet)"
framing since this is permanent, not pending:

```markdown
## Deliberately out of scope

- Behavior against real Google Slides — Google's login flow actively
  blocks automated sign-in, so there's no automated way to verify this;
  see `docs/specs/2026-08-06-extension-playwright-e2e-testing-design.md`
  for the full reasoning.
```
