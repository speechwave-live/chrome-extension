# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-08-22

### Added

- The emoji overlay now properly anchors to the slide when presenting
  directly from the Google Slides editor (no "Present" click needed).
  Previously it fell back to sizing off the raw browser viewport.

### Changed

- Overlay size and the fireworks toggle moved from the extension popup to
  the Speechwave account Settings page. Changes take effect the next time
  you connect to a talk, no extension update needed.

### Fixed

- Overlay position and scale no longer drift from the actual slide bounds
  in windowed or fullscreen presentation mode.
- Individual floating reactions could get stuck on screen permanently if
  their fade-out animation was interrupted (e.g. during a fullscreen
  transition). A fallback timer now guarantees they're always cleaned up.

## [1.0.0] - 2026-07-02

Initial Chrome Web Store release.

### Added

- Live emoji overlay on Google Slides during presentations.
- Per-slide reaction tracking, with session analytics on the Speechwave
  dashboard.
- Fireworks burst animation when the audience converges on one emoji.
- Auto-reconnect if Chrome suspends the extension's service worker.
- API key authentication tied to the presenter's Speechwave account.
