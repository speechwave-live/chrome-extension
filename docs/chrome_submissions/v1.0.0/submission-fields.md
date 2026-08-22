# Chrome Web Store Developer Dashboard fields: v1.0.0

Copy-paste source for the Developer Dashboard's Privacy practices tab and
permission justification fields. Verify against `manifest.json` at
submission time in case permissions changed after this was written.

## Single purpose description

Display live audience emoji reactions as a floating overlay on Google Slides
presentations.

## Permission justifications

### `storage`

Storage is used to persist the user's API key (chrome.storage.sync), talk slug
(chrome.storage.local), active session ID (chrome.storage.local), and user
preferences including the fireworks animations toggle (chrome.storage.sync).
This allows the extension to reconnect automatically and restore preferences
across browser sessions and devices.

### `tabs`

The tabs permission is used to query for open Google Slides presentation tabs
and forward emoji reaction messages from the service worker to the content
script running in those tabs. No tab data is collected or transmitted
externally.

### Host permission: `https://speechwave.live/*`

The extension connects to speechwave.live to establish a WebSocket channel (via
the Phoenix framework) for receiving live emoji reactions from the audience in
real time.

## Remote code
[x] No, I am not using Remote code

[ ] Yes, I am using Remote code

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
For example: region, IP address, GPS coordinates, or information about things near the user’s device

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

### Privacy policy
An extension must have a privacy policy if it collects user data. Learn more

Privacy policy URL: https://speechwave.live/privacy

