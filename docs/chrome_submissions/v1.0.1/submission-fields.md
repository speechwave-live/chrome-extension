# Chrome Web Store Developer Dashboard fields: v1.0.1

Copy-paste source for the Developer Dashboard's Privacy practices tab and
permission justification fields. Verify against `manifest.json` at
submission time in case permissions changed after this was written.

## Single purpose description

Overlays live emoji reactions from a presenter's audience onto their Google
Slides presentation in real time.

## Permission justifications

### `storage`

Speechwave stores the user's Speechwave API key, connected talk slug, and
current session ID locally in the browser (`chrome.storage.sync`/`local`) so
the presenter doesn't have to re-enter their key or reconnect every time they
open the popup or restart Chrome.

### `tabs`

The background service worker uses `chrome.tabs.query`/`chrome.tabs.sendMessage`
to find open Google Slides tabs and forward live reaction and config updates
to the content script running there. It is not used to read browsing history
or the content of unrelated tabs.

### Host permission: `https://speechwave.live/*`

Used to open and maintain the WebSocket (Phoenix Channels) connection from
the service worker to the Speechwave backend, to authenticate the presenter's
session and receive live audience emoji reactions in real time.

## Remote code

No. All JavaScript ships in the extension package as static files with no
build step. Nothing is fetched or evaluated remotely at runtime (see
README's "Stack" section).

## Data usage disclosure (for the Privacy practices tab)

What the extension actually handles, for cross-checking against whichever
checkboxes the Dashboard's data-usage form presents:

- **Authentication information**: the user's Speechwave API key, stored
  locally via `chrome.storage.sync`.
- **Website content**: the current Google Slides slide number, read from the
  page DOM and sent to the Speechwave server so reactions can be attributed
  to a slide. No other page content is read or transmitted.

None of this is sold or shared with third parties; it's transmitted only to
the user's own Speechwave account on `speechwave.live`.

**Known gap:** `speechwave.live/privacy` doesn't yet mention the extension,
local API key storage, or slide-number transmission specifically. See
`submission-overview.md`'s checklist: this should be closed before
submitting, since the Dashboard's data-usage declarations should match what's
disclosed to users.
