# Design: Reaction-Overlay Round Trip (e2e)

**Date:** 2026-08-07
**Status:** Approved

## Summary

Builds the first item named in "Explicitly deferred" of
`docs/specs/2026-08-06-extension-playwright-e2e-testing-design.md`: a
`reaction-overlay.spec.js` Playwright test proving the full reaction path —
a real attendee tapping an emoji on speechwave's `/t/:slug` LiveView page,
through a real Phoenix channel broadcast, through the extension's service
worker, into the content script rendering it on the fixture "Slides" page.

All infrastructure from the original design (pitchfork lifecycle, extension
loading/ID resolution, `e2e_mode_on`/`off`, the fixture server) is reused
as-is. This spec covers only what's new: a production bug the reaction path
exposes, a small production change, shared test setup, and the test itself.

## Background broadcast bug (found during design, not previously known)

`background.js`'s `broadcastToSlidesTabs()` finds tabs to deliver
`RENDER_EMOJI` to via:

```js
chrome.tabs.query({ url: 'https://docs.google.com/presentation/*' }, ...)
```

This URL is hardcoded independently of `content_scripts[0].matches` in
`manifest.json`. `e2e_mode_on` already patches the manifest's `matches` to
add the fixture server's origin so the content script injects into the
fixture page — but `broadcastToSlidesTabs` has no idea that happened, so a
`new_reaction` event would never reach the fixture tab even though the
content script is running there and listening. This isn't a test-scaffolding
gap; it's a real latent bug (today, nothing exercises the reaction path
against anything other than production Google Slides, so it's never been
observed).

**Fix:** stop duplicating the URL. `broadcastToSlidesTabs` reads the match
patterns from the manifest at call time instead:

```js
function broadcastToSlidesTabs(msg) {
  const { matches } = chrome.runtime.getManifest().content_scripts[0];
  chrome.tabs.query({ url: matches }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, msg, () => {
        void chrome.runtime.lastError;
      });
    }
  });
}
```

`chrome.tabs.query`'s `url` filter accepts an array of match patterns
(OR'd), so this is a drop-in behavioral no-op in production —
`content_scripts[0].matches` there is still exactly
`["https://docs.google.com/presentation/*"]`. Only in e2e mode, where
`e2e_mode_on` has already patched that array, does the broadcast now also
reach the fixture tab. No new e2e-specific patching logic is needed, and
**nothing about what ships to the Chrome Web Store changes** — production
`manifest.json` and its declared match patterns are untouched; `e2e_mode_on`
edits the working tree only for the duration of a local test run and
`e2e_mode_off` reverts it before anything could be committed or published.

**Test-side consequence:** `tests/setup/chrome-mock.js` (Jest) needs
`chrome.runtime.getManifest` added, mocked to return the same
`content_scripts[0].matches` shape as `manifest.json`. The four existing
`chrome.tabs.query.mockImplementation(...)` call sites in
`tests/background.test.js` don't assert on the query's shape, so they need
no changes.

## Content script: name the reaction span

`content/content.js`'s `spawnEmoji()` currently appends an unclassed
`<span>` to `#speechwave-overlay`. `spawnFireworks()` also appends unclassed
spans to the same overlay. A test asserting on "a span appeared under
`#speechwave-overlay`" can't distinguish a floating reaction from a
fireworks burst span if both happen to be in flight — a bare structural
selector is fragile in a way a semantic one isn't.

**Fix:** give the reaction span a class, `spawnEmoji()`:

```js
el.className = "floating-emoji";
```

No visual change — all of this element's styling is inline via
`el.style.cssText`, so the class is a pure marker. `spawnFireworks()`'s
spans are intentionally left unclassed; renaming them isn't needed for this
work. This also brings the extension's naming in line with speechwave's own
attendee-side reaction element, which already uses `.floating-emoji`
(`scripts/manual_tests/reaction_flow.sh` asserts on it there).

## Shared test setup: `connectViaPopup`

Both `connect.spec.js` and the new spec need to reach a live, joined channel
before they can do anything interesting. New
`tests/e2e/support/popup.js`:

```js
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
```

`connect.spec.js` is not refactored to use this — it's specifically testing
the connect flow's own intermediate states (`#setup-section`/`#main-section`
visibility toggling), so its more detailed inline assertions stay as-is.
`reaction-overlay.spec.js` uses the helper since, for that test, a connected
popup is setup, not the thing under test.

## `reaction-overlay.spec.js`

Setup mirrors `connect.spec.js`: `beforeAll` seeds a talk (`seedTalk`,
`fetchApiKey`), `afterAll` runs `cleanupTestUser`.

Test body:

1. `connectViaPopup(...)` — reach a joined `reactions:<slug>` channel.
2. Open the fixture page in a new tab; assert `#speechwave-overlay` is
   visible. This confirms the content script has injected and is listening
   *before* the reaction fires — sending into a not-yet-ready tab would
   silently drop the message (no listener, no queueing).
3. Open a third tab at `http://localhost:4000/t/<talk_slug>` (real
   speechwave attendee page, no extension involvement — its URL matches
   neither the Slides pattern nor the fixture origin); assert
   `#emoji-buttons` is visible.
4. Click `[phx-value-emoji="❤️"]` on the attendee page — same interaction
   `scripts/manual_tests/reaction_flow.sh` (speechwave repo) drives.
5. On the fixture page, assert `#speechwave-overlay .floating-emoji` with
   text `❤️` becomes visible. This is the round-trip proof: attendee
   LiveView → `Phoenix.PubSub.broadcast(..., "reactions:<slug>",
   "new_reaction", ...)` → `ReactionChannel` (speechwave) → extension
   service worker's `c.on('new_reaction', ...)` → `broadcastToSlidesTabs` →
   content script's `spawnEmoji`.

**Known flakiness constraint:** the `.floating-emoji` span self-removes
after a 2.5s CSS animation (`spawnEmoji`'s `animationend` listener), so the
assertion must observe it within that window. On localhost the full round
trip (LiveView event → PubSub → channel → service worker → tab message →
DOM append) is expected to land in well under a second, but this is a real
timing constraint worth naming rather than a hidden source of future
flakiness.

## Docs

`docs/manual_tests.md`: move "the reaction-overlay round trip" from "What's
not covered (yet)" to "What's covered", describing `reaction-overlay.spec.js`
the same way `connect.spec.js` is described there.

## Out of scope (still deferred)

Slide-number detection, fireworks, the real-Google-Slides DOM-drift check,
and CI-gating remain deferred per the original design's Section 10 — this
round only picks up the reaction-overlay item.
