# Speechwave Chrome Extension

Chrome Manifest V3 extension for
[Speechwave](https://github.com/speechwave-live/speechwave). Connects to a
running talk and overlays live emoji reactions on Google Slides. Tracks the
current slide number and sends it to the server so reactions can be stamped
with slide context.

## How it works

The extension has three parts:

**Popup (`popup/popup.html` + `popup/popup.js`)** — The UI shown when you click
the extension icon. The speaker enters their API key (once), then a talk slug,
and clicks Connect. All messages go to the service worker via
`chrome.runtime.sendMessage`.

**Service worker (`background/background.js`)** — Owns the Phoenix WebSocket
connection and channel. Runs independently of any tab, so connecting does not
require a Google Slides tab to be open. Routes messages between the popup and
content scripts, and pushes slide changes to the server.

**Content script (`content/content.js`)** — Injected into Google Slides pages
only. Manages the emoji overlay, runs slide number detection, and renders
emojis and fireworks when the service worker forwards reactions.

```
Popup UI                Service Worker              Content Script
(enters slug,      <->  (Phoenix Socket,        ->  (overlay, emojis,
 shows status)           channel, routing)       <-   slide detection)
                              |
                              v
                     Speechwave Server
                     ReactionChannel
```

Message flow:
- **Popup -> Service Worker**: `SET_SLUG`, `GET_STATUS`, `START_SESSION`,
  `STOP_SESSION`, `SET_FIREWORKS`, `TEST_FIREWORKS`
- **Service Worker -> Popup**: `SLIDE_CHANGED`, `CONNECT_ERROR`
- **Service Worker -> Content Scripts** (Slides tabs only): `RENDER_EMOJI`,
  `SET_FIREWORKS`, `TEST_FIREWORKS`
- **Content Script -> Service Worker**: `SLIDE_CHANGED`

---

## Install (developer mode)

1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** -> select this repo's root directory
4. The Speechwave icon appears in the toolbar

## Connect to a talk

1. Click the Speechwave extension icon (works from **any tab**)
2. Enter your API key on first use (find it in Account Settings)
3. Enter the talk slug (e.g. `elixir-for-rubyists`)
4. Click **Connect** -- the dot turns green when connected
5. Open a Google Slides presentation to see the emoji overlay

The extension auto-reconnects on service worker restart if a slug and API key
were previously saved.

---

## Running tests

```bash
npm install
npm test        # run all Jest tests (64 tests across 6 suites)
```

Tests cover popup UI state, content script overlay/emoji rendering, service
worker message routing, and adapter/fireworks logic. Chrome APIs are mocked
via `tests/setup/chrome-mock.js`.

---

## Development flags

The extension has two `DEV_MODE` flags in separate files. **Both must be set
to `true` for full local development and reset to `false` before committing.**

| File | Controls | `true` | `false` |
|------|----------|--------|---------|
| `background/background.js` | WebSocket host | `ws://localhost:4000` | `wss://speechwave.live` |
| `popup/popup.js` | Test Fireworks button | Shown in popup | Hidden |

After changing either flag:
1. Reload the extension in `chrome://extensions` (click the refresh icon)
2. **Reload any open Google Slides tabs** -- Chrome does not reinject content
   scripts when an extension is reloaded

To debug the service worker, go to `chrome://extensions`, find Speechwave,
and click the "service worker" link under "Inspect views." Console messages
are prefixed with `[Speechwave SW]`.

To debug the content script, open DevTools on a Google Slides tab (F12) and
check the Console.

---

## Fireworks animation

When the crowd converges on a single emoji, a radial burst animation fires in
the overlay instead of individual floaters. The trigger condition is
intentionally compound:

```
count(emoji) >= FIREWORKS_MIN_COUNT  &&  count(emoji) / total_in_flight >= FIREWORKS_MIN_PERCENT
```

The absolute count guard (`MIN_COUNT = 5`) prevents bursts from firing with
tiny audiences. The percentage guard (`MIN_PERCENT = 0.4`) prevents bursts
from firing when the crowd is sending many different emojis -- it requires
this emoji to be dominant, not merely frequent. A global cooldown
(`FIREWORKS_COOLDOWN_MS = 8000`) prevents back-to-back bursts, and only one
burst can play at a time (`fireworksActive` flag).

The presenter can toggle fireworks on or off at any time from the **Fireworks
animations** checkbox in the popup. The preference is saved to
`chrome.storage.sync` (persists across devices and page reloads).

**In-flight tracking** -- `spawnEmoji()` increments a per-emoji counter
(`inFlight["❤️"]++`) when an element is created, and decrements it in the
`animationend` listener when the element is removed. The 2.5s animation
duration acts as a natural sliding window: `total_in_flight` reflects
reactions from the last ~2.5 seconds, making it a real-time proxy for current
crowd engagement.

**Trigger logic** is extracted to `lib/fireworks.js` as a pure function
(`checkFireworksTrigger(inFlight, emoji, opts)`) that is easy to unit test
with Jest without a browser environment. The file uses the same dual-export
pattern as the adapter modules -- `module.exports` for Jest,
`window.SpeechwaveFireworks` for the browser.

The trigger thresholds (`FIREWORKS_MIN_COUNT`, `FIREWORKS_MIN_PERCENT`,
`FIREWORKS_COOLDOWN_MS`) are named constants at the top of
`content/content.js` and can be tuned without touching any other code.

**Burst animation** -- `spawnFireworks()` creates `FIREWORKS_BURST_COUNT` (16)
`<span>` elements at the overlay center, each animated outward at a unique
angle using the Web Animations API. The Web Animations API is used (rather
than CSS `@keyframes`) because each element needs a unique computed
`translate(tx, ty)` target. A safety timeout resets `fireworksActive` after
2 seconds in case `finish` events fail to fire (e.g., when the overlay is
re-parented during a fullscreen transition).

**Testing fireworks in production** -- Set `DEV_MODE = true` in `popup/popup.js`
to reveal the "Test Fireworks" button. This sends `TEST_FIREWORKS` to the
service worker, which broadcasts it to all Slides tabs. The content script
picks a random emoji and fires a burst. Remember to set it back to `false`
before committing.

> **Note:** Slide number tracking requires the slideshow to be running. The
> popup shows "Slide --" in the editor view because the slide indicator
> element only appears in the presentation iframe that Google Slides loads
> when the slideshow starts.

---

## Fullscreen overlay

When the speaker enters fullscreen mode in Google Slides, the browser creates
a new stacking context for the fullscreen element. Any `position: fixed`
elements on `<body>` become invisible. The extension handles this by
re-parenting the overlay `<div>` into the fullscreen element when a
`fullscreenchange` event fires:

```javascript
document.addEventListener("fullscreenchange", () => {
  const overlay = document.getElementById("speechwave-overlay");
  if (document.fullscreenElement) {
    document.fullscreenElement.appendChild(overlay); // move into fullscreen
  } else {
    document.body.appendChild(overlay);              // move back
  }
});
```

---

## Slide tracking

### Adapter registry

Different presentation tools expose the current slide number differently. The
extension uses an **adapter registry** (`adapters/index.js`) that picks the
right adapter based on the current page URL:

```javascript
function getAdapter(url) {
  if (url.includes("docs.google.com/presentation")) {
    return GoogleSlidesAdapter;
  }
  return { getSlide: () => 0 };  // fallback for unknown platforms
}
```

The Google Slides adapter (`adapters/google_slides.js`) reads the slide number
from the DOM:

```javascript
function getSlide() {
  const input = document.querySelector('input[aria-label*="Slide"]');
  if (!input) return 0;
  const n = parseInt(input.value, 10);
  return isNaN(n) ? 0 : n;
}
```

This is brittle by nature (Google could change the DOM), but it's the only
option without a first-party API. The fixture-based Jest tests in `tests/`
snapshot the relevant DOM so regressions are caught before they ship.

If Google changes the DOM, update `tests/fixtures/google_slides_dom.html` and
the selector in `adapters/google_slides.js`.

### Polling

The content script polls the adapter every 500ms via `setInterval`. When the
slide number changes, it sends a `SLIDE_CHANGED` message to the service
worker, which pushes `slide_changed` to the server channel and notifies the
popup.

Slide `0` is a sentinel for "unknown" and is never sent -- the content script
only reports changes to non-zero slide numbers. The popup displays the current
slide number in real time ("Slide 3" or "Slide --" for unknown), which serves
as an immediate sanity check that the adapter is reading the DOM correctly.

---

## Troubleshooting

**No emojis appearing on Google Slides**

After installing, updating, or reloading the extension, **refresh any Google
Slides tabs** that were already open. Chrome does not reinject content scripts
into existing tabs.

**Duplicate emojis in the overlay**

If each reaction shows up more than once, a stale content script from a
previous extension version is likely still running. **Reload the Google Slides
tab** to get a fresh content script.

**"Invalid API key" after regenerating**

After regenerating your API key in Account Settings, click "Change API key"
in the popup, paste the new key, and save. The extension suppresses spurious
errors from the old key's auto-reconnect attempt.

---

## Project structure

| Path | What it does |
|------|--------------|
| `manifest.json` | Manifest V3 config, permissions, content/service worker registration |
| `background/background.js` | Service worker: Phoenix Socket, channel, message routing, auto-reconnect |
| `popup/popup.html` | API key setup, slug input, connection/session status |
| `popup/popup.js` | Popup logic: save key, send messages to service worker, show status |
| `content/content.js` | Overlay, emoji/fireworks rendering, slide polling, message listener |
| `lib/phoenix.js` | Phoenix JS client (loaded by service worker via `importScripts`) |
| `lib/fireworks.js` | Pure trigger logic: `checkFireworksTrigger(inFlight, emoji, opts)` |
| `adapters/index.js` | Adapter registry (returns adapter for current URL) |
| `adapters/google_slides.js` | Reads current slide number from Google Slides DOM |
| `icons/` | Extension icons (16, 48, 128px PNG + SVG source) |
| `tests/` | Jest tests for popup, content, background, fireworks, adapters |
| `tests/setup/` | Chrome API mocks for test environment |
| `tests/fixtures/` | DOM snapshots for adapter tests |
