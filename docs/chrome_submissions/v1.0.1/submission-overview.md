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
- [x] Screenshots (external docs repo, `assets/images/`) reviewed against
      current UI. `screenshot-extension-popup-setup.png`,
      `screenshot-slides-overlay.png`, and
      `screenshot-account-settings-presentation-overlay.png` still accurate.
      `screenshot-extension-popup-connected.png` was stale (showed a
      "Fireworks animations" checkbox removed from the popup on 2026-07-28)
      and has been replaced. Committed on
      `docs/extension-md-store-resubmission-prep` in the `docs` repo, not
      yet merged.
- [x] Submission zip built via `bin/create_submission_zip.sh` (new: a
      repeatable, drift-checked replacement for the ad hoc zip used for
      1.0.0). Output lives alongside this file as `speechwave-v1.0.1.zip`.
- [x] `submission-fields.md` diffed against `../v1.0.0/submission-fields.md`
      (real dashboard answers). Kept identical except two material updates
      (storage and tabs justifications, both explained inline) since the
      dashboard pre-fills forms from the prior submission. Also carried
      forward the real "Data usage" checkboxes and privacy policy URL,
      which the earlier draft had only paraphrased, not reproduced.
- [ ] Submitted via Chrome Web Store Developer Dashboard

## Known gaps in the v1.0.0 record

`v1.0.0/web-store-listing.md` doesn't include the short description (132
char) field, so there's no baseline to diff `web-store-listing.md`'s short
description against. Other Dashboard fields (category, language,
screenshots/promo tile as actually uploaded, demo video URL) also weren't
captured. Worth grabbing if exact parity tracking matters, though these are
likely unchanged static assets.

## Files in this folder

- `web-store-listing.md`: snapshot of the listing copy submitted for this
  version
- `submission-fields.md`: permission justifications, single-purpose
  description, and other Developer Dashboard form fields
- `release-notes.md`: the "what's new" text for this version
