# Design: Remaining e2e Deferred Items (Slide Detection + Fireworks)

**Date:** 2026-08-08
**Status:** Approved

## Summary

Picks up the last two items from "Explicitly deferred" in
`docs/specs/2026-08-06-extension-playwright-e2e-testing-design.md`, following
the reaction-overlay round trip (`docs/specs/2026-08-07-reaction-overlay-e2e-design.md`):

- **Slide-number detection**: mutating the fixture page's `aria-label`,
  asserting the popup's slide indicator updates.
- **Fireworks**: triggering the existing dev-mode `TEST_FIREWORKS` popup
  button, asserting a burst of spans appears on the overlay.

Only CI-gating remains out of scope (deliberately, not "not covered yet")
and the real-Google-Slides DOM-drift check (deliberately deferred per the
original design's stated reasoning about Google's anti-automation login
flow).

## Adapter registry bug (found during design, not previously known)

`adapters/index.js`'s `getAdapter(url)` matches against a hardcoded regex,
`/docs\.google\.com\/presentation/`, independent of `manifest.json`'s
`content_scripts[0].matches` — the same class of duplication
`docs/specs/2026-08-07-reaction-overlay-e2e-design.md` found and fixed in
`background.js`. Even with `e2e_mode_on` patching the manifest and injecting
the content script into the fixture page, `content.js`'s
`startSlideObserver()` calls `registry.getAdapter(window.location.href)`
with the fixture page's `http://localhost:8973/...` URL, which the hardcoded
regex doesn't match — so it silently falls back to `{ getSlide: () => 0 }`
forever. Slide changes would never be detected on the fixture page. This is
deliberate, tested behavior (`tests/adapter_registry.test.js`'s "fallback
adapter for unknown URLs" test), not an oversight — so it's a real fix, not
loosened test-scaffolding.

**Fix:** derive the match check from
`chrome.runtime.getManifest().content_scripts[0].matches` at call time,
same as `background.js` already does. Chrome match patterns
(`https://docs.google.com/presentation/*`) aren't full regexes; rather than
writing a match-pattern parser for a single always-`/*`-suffixed pattern,
this uses a prefix check (strip the trailing `*`, then `url.startsWith`),
behaviorally equivalent to the old regex for every realistic URL:

```js
const ADAPTERS = [
  {
    getSlide: (typeof window !== "undefined" && window.SpeechwaveGoogleSlidesAdapter)
      ? window.SpeechwaveGoogleSlidesAdapter.getSlide
      : (typeof require !== "undefined" ? require("./google_slides").getSlide : () => 0),
  },
];

function getAdapter(url) {
  const { matches } = chrome.runtime.getManifest().content_scripts[0];
  const isContentScriptUrl = matches.some((pattern) => url.startsWith(pattern.replace(/\*$/, "")));
  return isContentScriptUrl ? ADAPTERS[0] : { getSlide: () => 0 };
}
```

The `match` property is dropped from the `ADAPTERS` entries entirely — it's
now derived, not stored per adapter, matching the "manifest is the single
source of truth" principle from the prior fix. **No `manifest.json`
change**: production `content_scripts[0].matches` stays exactly
`["https://docs.google.com/presentation/*"]`; only `e2e_mode_on`'s existing
temporary working-tree patch (unmodified by this design) ever adds to it.

`chrome.runtime.getManifest` is already mocked globally in
`tests/setup/chrome-mock.js` (added for the `background.js` fix), so the
three existing tests in `tests/adapter_registry.test.js` need no changes. A
new test asserts that once the mock's `matches` includes a second,
fixture-like origin, a URL under that origin also resolves to the real
adapter — the Jest-level proof the fix works, independent of the live e2e
run.

## Shared fixture-page helper

Both new specs need the same "open the fixture page, wait for
`#speechwave-overlay`" sequence `reaction-overlay.spec.js` already has
inline. New `tests/e2e/support/fixture.js`:

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

`reaction-overlay.spec.js` is updated to use this helper too (unlike
`connect.spec.js` vs. `connectViaPopup`, this block is pure boilerplate with
no test-specific nuance — no reason to leave it duplicated a third time).

## `fireworks.spec.js`

Setup mirrors the existing specs: `beforeAll` seeds a talk, `afterAll` runs
`cleanupTestUser`.

1. `connectViaPopup(...)`. `DEV_MODE` is already on for the whole e2e run
   (existing global setup), which makes `#test-fireworks-btn` visible in
   `popup/popup.js`.
2. `openFixturePage(context)`.
3. Click `#test-fireworks-btn` on the popup.
4. `expect.poll(() => fixturePage.locator("#speechwave-overlay span:not(.floating-emoji)").count()).toBeGreaterThan(1)`.

Not asserting the exact burst count (`FIREWORKS_BURST_COUNT = 16` in
`content/content.js`) — pinning that would make the test a change-detector
on an unrelated tuning constant; `> 1` proves a burst happened without
caring how large. `expect.poll()` rather than `toHaveCount()` because the
count fluctuates as staggered spans self-remove over up to ~1.5s
(`el.animate(...)`'s 1200ms duration plus up to 300ms random per-span
delay) — the same class of animation-window flakiness constraint the
reaction-overlay design named, worth calling out again here since the
window is shorter.

`:not(.floating-emoji)` scopes the selector away from reaction spans on the
off chance a future test extension fires both in the same page — not
needed for this test alone (nothing else appends spans here), but free and
consistent with the reasoning that added `.floating-emoji` in the first
place.

## `slide-detection.spec.js`

Setup mirrors the existing specs.

1. `connectViaPopup(...)`.
2. `openFixturePage(context)`.
3. Assert `popup.locator("#slide-indicator")` becomes `"Slide 1"` — proves
   the adapter-registry fix end-to-end: `content.js`'s `startSlideObserver`
   runs `checkSlide()` immediately on load, reads the fixture's default
   `aria-label="Slide 1 of 10: Title text"` through the now-fixed registry,
   and the result reaches the already-open, already-connected popup via
   `SLIDE_CHANGED`.
4. Mutate the aria-label:
   `fixturePage.locator(".punch-viewer-svgpage-a11yelement").evaluate(el => el.setAttribute("aria-label", "Slide 5 of 10: Title text"))`.
5. Assert `popup.locator("#slide-indicator")` becomes `"Slide 5"` (within
   the 500ms poll interval `startSlideObserver`'s `setInterval` uses —
   comfortably inside Playwright's default assertion timeout).

No animation-based self-destruct window applies here (the slide indicator
is persistent text, not a decaying DOM node), so this spec carries
noticeably less inherent flakiness risk than `reaction-overlay.spec.js` or
`fireworks.spec.js`.

## Docs

`docs/manual_tests.md`: move both remaining bullets from "What's not
covered (yet)" to "What's covered", describing `fireworks.spec.js` and
`slide-detection.spec.js` the same way the existing two specs are
described. Since this empties "What's not covered (yet)", that heading is
dropped rather than left as an empty placeholder — CI-gating and the
real-Google-Slides drift check are already covered by the "Out of scope"
framing in the original design doc and don't need restating here.

## Out of scope

CI-gating and the real-Google-Slides DOM-drift check remain deferred per
the original design's Section 10 — this round only picks up slide
detection and fireworks.
