# Store listing page

Structured to mirror `../v1.0.0/web-store-listing.md`'s real Dashboard
capture field-for-field, so the two are directly diffable. Everything below
is unchanged from v1.0.0 except "Title from package" and "Summary from
package" (`manifest.json`'s `description` changed, `name` didn't); see the
note under Product details.

## Product details

### Title from package

Speechwave

### Summary from package

Live emoji reactions on your Google Slides. Your audience reacts in real time while you present, with per-slide analytics after.

<!-- Changed from v1.0.0, where this was "Live emoji reactions overlay for
conference talks" (manifest.json's description field, 49 chars). Both
"Title" and "Summary" are pulled directly from manifest.json (name and
description respectively), not typed into the Dashboard directly. The old
summary was never actually a "short description" field on the Dashboard;
docs/web-store-listing.md previously had draft copy for a "Short
description" section that didn't map to any real field, so it never took
effect until manifest.json's description was updated to match it. -->

### Description

```markdown
**Live audience reactions, right on your slides.**

Speechwave lets your audience send emoji reactions while you present. Reactions float up on your Google Slides in real time, so you get continuous engagement in the room and per-slide analytics afterward to see what landed.

**How it works**

1. Install the extension and paste your API key from your Speechwave account settings
2. Enter your talk slug and click Connect
3. Share the talk URL or QR code on your first slide, your audience joins instantly from their phone
4. Present as usual, emoji reactions appear as a floating overlay on your slides

**Features**

• Live emoji overlay on Google Slides (works in both editor and presentation mode)
• Audience joins from any device without installing an app or logging in
• Per-slide reaction tracking: the extension detects your current slide automatically in presentation mode
• Session analytics: review reaction counts and emoji breakdowns per slide after your talk
• Fireworks animation: when the audience converges on a single emoji, a burst animation fires
• Auto-reconnect: the connection stays up even if Chrome suspends the service worker
• Secure API key authentication: only you can start sessions for your talks

**Who it's for**

Conference speakers, meetup presenters, educators, and anyone who wants to know which parts of their talk resonated, and which fell flat, so they can improve it next time.

**Pricing**

Speechwave has a free plan with no time limit. Create your account at speechwave.live.

**Getting started**

1. Sign up at speechwave.live (free)
2. Create a talk from your dashboard
3. Copy your API key from Account Settings
4. Install this extension, paste your key, and connect to your talk

After connecting, start a new session and open your Google Slides presentation and the emoji overlay appears automatically. Your audience reacts at speechwave.live/t/your-talk-slug.

**Support**

Questions or feedback? Reach us at speechwave.live.
```

<!-- Unchanged from v1.0.0 (aside from the typo/writing-style fixes already
noted in submission-overview.md). The Dashboard's live capture of this field
showed the package summary auto-prepended to the preview
("**Live emoji reactions overlay for conference talks**Live audience
reactions..."); that's a display artifact of the Dashboard's preview pane,
not part of the stored field value. -->

### Category

Communication

### Language

English (US)

<!-- Unchanged from v1.0.0. -->

## Graphic assets

- store icon: 128x128 provided
- global promo video: none
- screenshots: 4 provided
- small promo tile: provided
- marquee promo tile: none

<!-- Unchanged from v1.0.0, but NOT independently re-verified: the four
screenshots referenced elsewhere in this repo's docs
(screenshot-extension-popup-setup.png, screenshot-extension-popup-connected.png,
screenshot-slides-overlay.png, screenshot-account-settings-presentation-overlay.png)
were checked against the current UI, but whether those are the exact four
files uploaded to the Dashboard's Graphic assets section hasn't been
confirmed. Worth checking directly in the Dashboard before submitting. -->

## Additional fields

### Official URL

speechwave.live

### Homepage URL

speechwave.live

### Support URL

none

### Mature content

off

<!-- Unchanged from v1.0.0. -->

## Additional metrics

(an opt-in link for Google Analytics)

## Item support

Visibility
