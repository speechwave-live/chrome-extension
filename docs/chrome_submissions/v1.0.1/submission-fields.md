# Chrome Web Store Developer Dashboard fields: v1.0.1

Copy-paste source for the Developer Dashboard's Privacy practices tab and
permission justification fields. Diffed against `v1.0.0/submission-fields.md`
(the real answers pulled from the live dashboard) and kept identical except
where the extension's actual behavior changed: the dashboard pre-fills
forms from the prior submission, so unnecessary rewording just adds noise
to that diff. Verify against `manifest.json` at submission time in case
permissions changed after this was written.

## Single purpose description

Display live audience emoji reactions as a floating overlay on Google Slides
presentations.

## Permission justifications

### `storage`

Storage is used to persist the user's API key (chrome.storage.sync), talk
slug (chrome.storage.local), active session ID (chrome.storage.local), and a
cached copy of the presenter's overlay and fireworks settings
(chrome.storage.local) so the extension can restore its last known
configuration if the service worker restarts before reconnecting. This
allows the extension to reconnect automatically and restore state across
browser sessions and devices.

<!-- Changed from v1.0.0: that version described this last bullet as "user
preferences including the fireworks animations toggle (chrome.storage.sync)".
The fireworks toggle moved to the account Settings page on 2026-07-28. It's
no longer a locally stored user preference: it's now delivered over the
channel and cached in chrome.storage.local purely so the extension has a
config to fall back on immediately after a service-worker restart, before a
fresh update arrives. See background/background.js's `lastKnownSettings`/
`lastKnownTuning` handling. -->

### `tabs`

The tabs permission is used to query for open Google Slides presentation
tabs and forward emoji reaction and remote configuration messages from the
service worker to the content script running in those tabs. No tab data is
collected or transmitted externally.

<!-- Changed from v1.0.0: that version said "forward emoji reaction
messages" only. Since then, remote configuration updates (SET_REMOTE_CONFIG,
sent when the presenter changes overlay size or the fireworks toggle in
Settings) are also forwarded to Slides tabs over this same permission. -->

### Host permission: `https://speechwave.live/*`

The extension connects to speechwave.live to establish a WebSocket channel
(via the Phoenix framework) for receiving live emoji reactions from the
audience in real time.

<!-- Unchanged from v1.0.0. -->

## Remote code

[x] No, I am not using Remote code

[ ] Yes, I am using Remote code

<!-- Unchanged from v1.0.0. -->

## Data usage

The content of this form will be displayed publicly on the item detail page. By
publishing your item, you are certifying that these disclosures reflect the
most up-to-date content of your privacy policy.

### What user data do you plan to collect from users now or in the future? (See FAQ for more information)

[ ] Personally identifiable information
For example: name, address, email address, age, or identification number

[ ] Health information
For example: heart rate data, medical history, symptoms, diagnoses, or procedures

[ ] Financial and payment information
For example: transactions, credit card numbers, credit ratings, financial statements, or payment history

[x] Authentication information
For example: passwords, credentials, security question, or personal identification number (PIN)

[ ] Personal communications
For example: emails, texts, or chat messages

[ ] Location
For example: region, IP address, GPS coordinates, or information about things near the user's device

[ ] Web history
The list of web pages a user has visited, as well as associated data such as page title and time of visit

[x] User activity
For example: network monitoring, clicks, mouse position, scroll, or keystroke logging

[ ] Website content
For example: text, images, sounds, videos, or hyperlinks

I certify that the following disclosures are true:

[x] I do not sell or transfer user data to third parties, outside of the approved use cases

[x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose

[x] I do not use or transfer user data to determine creditworthiness or for lending purposes
You must certify all three disclosures to comply with our Developer Program Policies

<!-- Unchanged from v1.0.0. The underlying data categories haven't changed
in kind: the API key is still "Authentication information", and slide-number
tracking is still categorized as "User activity" rather than "Website
content" (it's a derived integer read from the DOM, not page text/images/
etc. being transmitted). Same reasoning as before, just now also true in
edit view, not only presentation mode. -->

### Privacy policy

An extension must have a privacy policy if it collects user data. Learn more

Privacy policy URL: https://speechwave.live/privacy

<!-- Reminder, not a dashboard field: as of this writing, the privacy
policy doesn't yet disclose the extension's data handling on the live site.
The fix is committed on `docs/privacy-policy-chrome-extension-disclosure`
in the `speechwave` repo (commit 377cc48) but not yet merged/deployed.
Merge and deploy that before submitting, since this form's checkboxes
should match what's actually live at that URL. -->
