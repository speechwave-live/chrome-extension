# Chrome Web Store submission: v1.0.1

## Why we're resubmitting

Version 1.0.0 was submitted 2026-07-02. Since then: the overlay now
anchors correctly to the slide across all three presentation states (edit
view, windowed present, fullscreen present) instead of falling back to
viewport-relative sizing in edit view; overlay size and fireworks moved
from the popup to the account Settings page; and a latent robustness gap
in the reaction-cleanup path was hardened. See
[CHANGELOG.md](../../../CHANGELOG.md) for the full list.

## Pre-submission checklist

- [x] `docs/web-store-listing.md` reviewed, a stale typo and several
      writing-style violations fixed, confirmed accurate for this version
      (snapshotted in `web-store-listing.md` in this folder)
- [x] `docs/extension.md` (external docs repo) updated to cover windowed
      present mode and the slide-tracking/editor-view caveat
- [x] `manifest.json` version bumped to 1.0.1
- [x] `package.json` renamed from `joyconf-extension` to
      `speechwave-extension`, `package-lock.json` resynced
- [x] Jest suite green (97/97), Playwright e2e suite green (9/9)
- [x] `npm audit` clean (0 vulnerabilities, fixed via `npm audit fix`)
- [x] Manual smoke test: connect flow, session start, live reaction
      pipeline, and all three overlay-anchoring modes, all confirmed
      working against a real Speechwave talk
- [x] `spawnEmoji`'s animation-cleanup path hardened with a safety-timeout
      fallback, mirroring the existing `spawnFireworks` pattern
- [x] Privacy policy (`speechwave` repo,
      `lib/speechwave_web/controllers/page_html/privacy.html.heex`) updated
      to disclose extension data handling (API key storage, slide-number
      transmission). Committed on `docs/privacy-policy-chrome-extension-disclosure`
      in the `speechwave` repo, not yet merged.
- [ ] Screenshots reviewed against current UI
- [ ] Submitted via Chrome Web Store Developer Dashboard

## Files in this folder

- `web-store-listing.md`: snapshot of the listing copy submitted for this
  version
- `submission-fields.md`: permission justifications, single-purpose
  description, and other Developer Dashboard form fields
- `release-notes.md`: the "what's new" text for this version
