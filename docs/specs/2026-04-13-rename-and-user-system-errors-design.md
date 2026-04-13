# Design: Rename joyconf → speechwave + User System Error Handling

**Date:** 2026-04-13
**Status:** Approved

## Summary

Two coordinated changes to keep the chrome extension in sync with the speechwave
core app after its recent rename and user system introduction:

1. **Mechanical rename** — replace all `joyconf`/`JoyConf`/`Joyconf` identifiers
   with `speechwave`/`Speechwave` throughout the extension.
2. **Surface new server error types** — the new `ReactionChannel` returns two
   error reasons the extension currently silently swallows:
   `capacity_reached` (join) and `session_limit_reached` (start session).
   These will be shown in a new `#error-msg` div in the popup.

No other functional changes. Extension-side user authentication is explicitly
deferred (see Known Limitations).

---

## Section 1: Rename

### Files changed

| File | What changes |
|---|---|
| `manifest.json` | `name` + `default_title` → `"Speechwave"`; host permission `joyconf.fly.dev` → `speechwave.fly.dev` |
| `popup/popup.html` | `<h3>JoyConf</h3>` → `<h3>Speechwave</h3>` |
| `content/content.js` | DOM ID `joyconf-overlay` → `speechwave-overlay`; CSS keyframe `joyconfFloat` → `speechwaveFloat`; console prefix `[JoyConf]` → `[Speechwave]`; globals `JoyconfFireworks`/`JoyconfAdapterRegistry` → `SpeechwaveFireworks`/`SpeechwaveAdapterRegistry`; commented prod URL → `speechwave.fly.dev` |
| `lib/fireworks.js` | `window.JoyconfFireworks` → `window.SpeechwaveFireworks` |
| `adapters/google_slides.js` | `window.JoyconfGoogleSlidesAdapter` → `window.SpeechwaveGoogleSlidesAdapter` |
| `adapters/index.js` | Both globals renamed to match above |

### Scope

Pure identifier rename. No logic changes, no file renames, no test changes
(the global names don't appear in test files — tests use `require()` paths).

---

## Section 2: Error Handling

### New error reasons from the server

| Error reason | Where raised | Meaning |
|---|---|---|
| `capacity_reached` | `ReactionChannel.join/3` | Talk is at plan participant limit |
| `session_limit_reached` | `ReactionChannel.handle_in("start_session")` | Speaker has used their monthly session quota |

### Changes to `content.js`

- Channel join `.receive("error", ...)`: after logging and disconnecting, also
  send `chrome.runtime.sendMessage({ type: "CONNECT_ERROR", reason }, () => { void chrome.runtime.lastError; })`
  so the popup can surface the reason. The `lastError` suppression follows the
  same pattern as `SLIDE_CHANGED` — if the popup is closed when the join fails,
  the message is silently dropped (no persistence to storage; acceptable for now).

- `START_SESSION` handler: the `sendResponse({ error: reason })` path already
  exists but `popup.js` ignores it. No change needed in `content.js` — the
  existing response payload is sufficient.

### Changes to `popup.js`

- Add `setError(msg)` helper: sets `#error-msg` text content and shows the div;
  passing `null` or `""` hides it.
- Call `setError(null)` at the start of each Connect click (clears any prior error).
- Add `chrome.runtime.onMessage` case for `CONNECT_ERROR`: call
  `setError(friendlyMessage(reason))` where the friendly messages are:
  - `"capacity_reached"` → `"Talk is at capacity"`
  - default → `"Connection failed"`
- In the `START_SESSION` response handler: check `response?.error` and call
  `setError(friendlyMessage(response.error))` where:
  - `"session_limit_reached"` → `"Monthly session limit reached"`
  - default → `"Could not start session"`

### Changes to `popup.html`

Add one element after the Connect button:

```html
<div id="error-msg" style="display:none; color:#ea4335; font-size:11px; margin-top:6px;"></div>
```

---

## Known Limitations

### Extension-side authentication is not implemented

The `UserSocket` accepts all connections anonymously. The talk slug is used as
the sole credential for connecting to a channel and performing speaker operations
(start/stop session, slide tracking). Because the slug is shared publicly with
the audience to enable reactions, it is not a meaningful secret — any audience
member could use the extension to start or stop sessions.

**Deferred to a future phase.** The fix requires:
- `UserSocket.connect/3` to accept and validate a user token
- `ReactionChannel` to gate session operations on the connecting user being the
  talk's owner
- The extension to authenticate the speaker (email/password or token) before
  connecting

---

## Out of Scope

- File renames (no `.js` files are renamed)
- Test file changes (test globals use `require()`, not the window globals being renamed)
- Any changes to the speechwave core app
- Extension-side user authentication
