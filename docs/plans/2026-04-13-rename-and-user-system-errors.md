# Rename joyconf→speechwave + User System Error Handling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all `joyconf`/`JoyConf` identifiers to `speechwave`/`Speechwave` throughout the extension, and surface the two new server error reasons (`capacity_reached`, `session_limit_reached`) introduced by the user system in the popup UI.

**Architecture:** Two independent change sets. Task 1–3 are a mechanical rename across 6 files — no logic changes. Tasks 4–6 add a `#error-msg` div to the popup and wire up error messages from `content.js` channel events and session responses. All changes are in existing files; no new files are created.

**Tech Stack:** Vanilla JS, Chrome Extension Manifest V3, Jest (jsdom), Phoenix WebSocket channel

---

## File Map

| File | Change |
|---|---|
| `manifest.json` | Rename `name`/`default_title`, update host permission URL |
| `popup/popup.html` | Rename heading, add `#error-msg` div |
| `lib/fireworks.js` | Rename `window.JoyconfFireworks` global |
| `adapters/google_slides.js` | Rename `window.JoyconfGoogleSlidesAdapter` global |
| `adapters/index.js` | Rename both window globals |
| `content/content.js` | Rename DOM IDs, keyframe name, console prefix, window globals, prod URL; add `CONNECT_ERROR` send on join failure |
| `popup/popup.js` | Add `setError()` helper, clear error on connect, handle `CONNECT_ERROR` message, handle `session_limit_reached` in START_SESSION response |

---

## Task 1: Rename manifest.json and popup.html

**Files:**
- Modify: `manifest.json`
- Modify: `popup/popup.html`

- [ ] **Step 1: Update manifest.json**

Replace the entire file content with:

```json
{
  "manifest_version": 3,
  "name": "Speechwave",
  "version": "1.0.0",
  "description": "Live emoji reactions overlay for conference talks",
  "permissions": ["storage", "tabs"],
  "host_permissions": [
    "http://localhost/*",
    "https://speechwave.fly.dev/*"
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_title": "Speechwave"
  },
  "content_scripts": [
    {
      "matches": ["https://docs.google.com/presentation/*"],
      "js": ["lib/phoenix.js", "lib/fireworks.js", "adapters/google_slides.js", "adapters/index.js", "content/content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: Update the heading in popup/popup.html**

Change line 24 from:
```html
  <h3>JoyConf</h3>
```
to:
```html
  <h3>Speechwave</h3>
```

- [ ] **Step 3: Commit**

```bash
git add manifest.json popup/popup.html
git commit -m "refactor: rename JoyConf → Speechwave in manifest and popup heading"
```

---

## Task 2: Rename JS globals in lib and adapters

**Files:**
- Modify: `lib/fireworks.js`
- Modify: `adapters/google_slides.js`
- Modify: `adapters/index.js`

- [ ] **Step 1: Update lib/fireworks.js**

Change the last two lines from:
```js
} else {
  window.JoyconfFireworks = { checkFireworksTrigger };
}
```
to:
```js
} else {
  window.SpeechwaveFireworks = { checkFireworksTrigger };
}
```

- [ ] **Step 2: Update adapters/google_slides.js**

Change the last two lines from:
```js
} else {
  window.JoyconfGoogleSlidesAdapter = { getSlide };
}
```
to:
```js
} else {
  window.SpeechwaveGoogleSlidesAdapter = { getSlide };
}
```

- [ ] **Step 3: Update adapters/index.js**

Replace the entire file content with:

```js
// In the browser, adapter files are injected before this file (see manifest.json),
// so window.SpeechwaveGoogleSlidesAdapter is available. In Jest (jsdom), window exists
// but window.SpeechwaveGoogleSlidesAdapter is never set — the ternary falls through to
// require(), which is the intended test path. Do not reorder manifest.json injection
// without updating this logic.
const ADAPTERS = [
  {
    match: /docs\.google\.com\/presentation/,
    getSlide: (typeof window !== "undefined" && window.SpeechwaveGoogleSlidesAdapter)
      ? window.SpeechwaveGoogleSlidesAdapter.getSlide
      : (typeof require !== "undefined" ? require("./google_slides").getSlide : () => 0),
  },
];

function getAdapter(url) {
  const adapter = ADAPTERS.find((a) => a.match.test(url));
  return adapter || { getSlide: () => 0 };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getAdapter };
} else {
  window.SpeechwaveAdapterRegistry = { getAdapter };
}
```

- [ ] **Step 4: Run the test suite**

```bash
npm test
```

Expected: all tests pass. The tests use `require()` paths, not the window globals, so the rename has no effect on test behaviour. If any test fails, the failure is unrelated to this change — investigate before continuing.

- [ ] **Step 5: Commit**

```bash
git add lib/fireworks.js adapters/google_slides.js adapters/index.js
git commit -m "refactor: rename Joyconf* window globals to Speechwave*"
```

---

## Task 3: Rename references in content.js

**Files:**
- Modify: `content/content.js`

- [ ] **Step 1: Rename the CSS keyframe and animation reference**

Change:
```js
style.textContent = `
  @keyframes joyconfFloat {
    0%   { transform: translateY(0);    opacity: 1; }
    100% { transform: translateY(-60px); opacity: 0; }
  }
`;
```
to:
```js
style.textContent = `
  @keyframes speechwaveFloat {
    0%   { transform: translateY(0);    opacity: 1; }
    100% { transform: translateY(-60px); opacity: 0; }
  }
`;
```

And change the animation reference in `spawnEmoji`:
```js
    "animation: joyconfFloat 2.5s ease-out forwards",
```
to:
```js
    "animation: speechwaveFloat 2.5s ease-out forwards",
```

- [ ] **Step 2: Rename the overlay DOM ID**

There are three occurrences of `"joyconf-overlay"` — in `getOrCreateOverlay()` (the `getElementById` call and the `overlay.id` assignment) and in the `fullscreenchange` handler. Change all three:

```js
// getOrCreateOverlay — two occurrences:
let overlay = document.getElementById("speechwave-overlay");
  ...
overlay.id = "speechwave-overlay";

// fullscreenchange handler:
const overlay = document.getElementById("speechwave-overlay");
```

- [ ] **Step 3: Rename console log prefixes**

Change all four console calls:
```js
// In socket construction:
logger: (kind, msg, data) => console.debug(`[Speechwave] ${kind}: ${msg}`, data)

// In socket.onError:
socket.onError(() => console.error("[Speechwave] Socket error — check HOST and that the server is running"));

// In channel join receive("ok"):
console.log(`[Speechwave] Joined reactions:${slug}`);

// In channel join receive("error"):
console.error(`[Speechwave] Channel join failed: ${reason}`);
```

- [ ] **Step 4: Rename the Fireworks and AdapterRegistry global references**

Change:
```js
  if (window.JoyconfFireworks.checkFireworksTrigger(inFlight, emoji, {
```
to:
```js
  if (window.SpeechwaveFireworks.checkFireworksTrigger(inFlight, emoji, {
```

And change:
```js
  const registry = window.JoyconfAdapterRegistry;
```
to:
```js
  const registry = window.SpeechwaveAdapterRegistry;
```

- [ ] **Step 5: Update the commented production HOST URL**

Change:
```js
// const HOST = "wss://joyconf.fly.dev";
```
to:
```js
// const HOST = "wss://speechwave.fly.dev";
```

- [ ] **Step 6: Run the test suite**

```bash
npm test
```

Expected: all tests pass. `content.js` has no unit tests — the test suite covers adapters and fireworks only. A clean pass confirms the adapter and fireworks renames are consistent.

- [ ] **Step 7: Commit**

```bash
git add content/content.js
git commit -m "refactor: rename joyconf identifiers in content.js"
```

---

## Task 4: Add error message UI to the popup

**Files:**
- Modify: `popup/popup.html`
- Modify: `popup/popup.js`

- [ ] **Step 1: Add the #error-msg div to popup.html**

After the connect button (line 27), add one new line:
```html
  <button id="connect-btn">Connect</button>
  <div id="error-msg" style="display:none; color:#ea4335; font-size:11px; margin-top:6px;"></div>
```

- [ ] **Step 2: Wire up the errorMsg element and setError helper in popup.js**

After the existing element declarations at the top of `popup.js` (after line 10, `const testFireworksBtn = ...`), add:

```js
const errorMsg = document.getElementById("error-msg");

function setError(msg) {
  if (msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = "block";
  } else {
    errorMsg.textContent = "";
    errorMsg.style.display = "none";
  }
}
```

- [ ] **Step 3: Clear the error on each connect attempt**

In the `connectBtn.addEventListener("click", ...)` handler, add `setError(null)` as the first line inside the callback body (after the `if (!slug) return;` guard):

```js
connectBtn.addEventListener("click", () => {
  const slug = slugInput.value.trim();
  if (!slug) return;

  setError(null);

  chrome.storage.local.set({ slug });
  // ... rest unchanged
```

- [ ] **Step 4: Manual smoke test**

Load the unpacked extension in Chrome (`chrome://extensions` → Load unpacked → select the repo root). Open the popup. Verify the heading says "Speechwave" and no error div is visible. Click Connect with a valid slug — verify the error div stays hidden on success.

- [ ] **Step 5: Commit**

```bash
git add popup/popup.html popup/popup.js
git commit -m "feat: add error message UI to popup"
```

---

## Task 5: Surface capacity_reached on channel join

**Files:**
- Modify: `content/content.js`
- Modify: `popup/popup.js`

- [ ] **Step 1: Send CONNECT_ERROR from content.js on join failure**

In the `connect()` function, replace the channel join receive("error") handler:

```js
  channel
    .join()
    .receive("ok", () => {
      console.log(`[Speechwave] Joined reactions:${slug}`);
      startSlideObserver();
    })
    .receive("error", ({ reason }) => {
      console.error(`[Speechwave] Channel join failed: ${reason}`);
      socket.disconnect();
      socket = null;
      chrome.runtime.sendMessage({ type: "CONNECT_ERROR", reason }, () => {
        void chrome.runtime.lastError;
      });
    });
```

The `void chrome.runtime.lastError` suppresses the "no listener" error when the popup is closed at the time the join fails — the same pattern used for `SLIDE_CHANGED`.

- [ ] **Step 2: Handle CONNECT_ERROR in popup.js**

In `popup.js`, extend the existing `chrome.runtime.onMessage.addListener` callback at the bottom of the file:

```js
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SLIDE_CHANGED") {
    setSlideIndicator(msg.slide);
  } else if (msg.type === "CONNECT_ERROR") {
    const messages = { capacity_reached: "Talk is at capacity" };
    setError(messages[msg.reason] || "Connection failed");
  }
});
```

- [ ] **Step 3: Manual smoke test**

To trigger `capacity_reached` you need a talk on a plan that has reached its participant limit. If you have a dev environment available: set the plan limit to 0 in `Plans`, connect with any slug, and verify the popup shows "Talk is at capacity". If a live test isn't convenient, verify visually that the code path is wired correctly by reviewing the changes.

- [ ] **Step 4: Commit**

```bash
git add content/content.js popup/popup.js
git commit -m "feat: surface capacity_reached error in popup on channel join failure"
```

---

## Task 6: Surface session_limit_reached on session start

**Files:**
- Modify: `popup/popup.js`

- [ ] **Step 1: Handle the error response in the START_SESSION handler**

In `popup.js`, the `sessionBtn.addEventListener("click", ...)` handler contains a `chrome.tabs.sendMessage` call for the `START_SESSION` case. Replace it:

```js
      chrome.tabs.sendMessage(tab.id, { type: "START_SESSION" }, (response) => {
        if (response?.session_id) {
          currentSessionId = response.session_id;
          chrome.storage.local.set({ sessionId: response.session_id });
          setSessionUI(true, response.label);
        } else if (response?.error) {
          const messages = { session_limit_reached: "Monthly session limit reached" };
          setError(messages[response.error] || "Could not start session");
        }
      });
```

- [ ] **Step 2: Manual smoke test**

To trigger `session_limit_reached`: in the dev environment, set the plan's `full_sessions_per_month` limit to 0 in `Plans`, connect to a talk, click "Start Session", and verify the popup shows "Monthly session limit reached". The session button should remain in its pre-click state (not switch to "Stop Session").

- [ ] **Step 3: Commit**

```bash
git add popup/popup.js
git commit -m "feat: surface session_limit_reached error in popup on session start failure"
```
