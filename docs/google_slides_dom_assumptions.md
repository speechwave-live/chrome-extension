# Google Slides DOM Assumptions

Every place our code assumes something about real Google Slides' DOM
structure that we can't verify automatically — Google's login flow blocks
automated sign-in, so there's no way to run this against real Slides in
CI or e2e (see
`docs/specs/2026-08-06-extension-playwright-e2e-testing-design.md`).

Instead, these get verified by hand: a human runs
`docs/manual_tests/capture_real_google_slides_dom.js` against a real,
logged-in Slides presentation (see `docs/manual_tests.md`'s "Verifying
fixture assumptions against real Google Slides" section) and compares the
output against this table.

**If you touch any of the code cited below, re-run that procedure before
merging, and update this table's "Last verified" column with the new
capture file.**

| # | Assumption | Encoded in | What breaks if wrong | Last verified |
|---|---|---|---|---|
| 1 | The slide-number element is `.punch-viewer-svgpage-a11yelement[aria-label*="Slide"]`, with an `aria-label` matching `/^Slide (\d+)/`, present in the top document or a same-origin iframe. | `adapters/google_slides.js:23-42` (`getSlide`) | Slide tracking silently returns `0` (the "unknown slide" sentinel) — reactions route to slide 0 server-side instead of the real current slide. | 2026-08-14 |
| 2 | The live slideshow renders inside `iframe.punch-present-iframe`. | `content/content.js:59-61` (`getPresentIframe`) | The overlay falls back to viewport-relative sizing instead of anchoring to the slide. | **Contradicted 2026-08-14 — see "2026-08-14 findings" below** |
| 3 | The a11y element's `getBoundingClientRect()` within the iframe's own document represents the visible slide's bounds; offsetting by the iframe's own top-document rect gives correct top-document coordinates. | `content/content.js:71-91` (`getSlideRect`) | Overlay/emoji render off-slide in windowed present mode — the exact bug `tests/e2e/overlay-windowed-position.spec.js` exists to catch. | 2026-08-14 (partial — see findings) |
| 4 | Whether real Google Slides fullscreens the bare `iframe.punch-present-iframe`, or a wrapping element. Confirmed: a wrapping element (`div.punch-full-screen-element.punch-full-window-overlay`), at least for the in-editor overlay present flow — see findings. | `content/content.js:166-174` (`fullscreenchange` listener) | If the bare iframe: the overlay is appended into a node that never renders light-DOM children, and silently fails to render in fullscreen present mode. | 2026-08-14 |

## Capture history

Each verification run should append a row here, oldest first, so drift
over time is visible without digging through git blame.

| Date | Capture files | Result |
|---|---|---|
| 2026-08-14 | `docs/manual_tests/captures/2026-08-14-windowed.json`, `2026-08-14-fullscreen.json` | #1 confirmed. #2 contradicted for the dedicated `/present`-tab flow (no `punch-present-iframe` found at all). #3 confirmed for the flow where the iframe exists (letterbox sub-rect observed), not stress-tested for the offset arithmetic specifically. #4 confirmed for the flow where the iframe exists. See findings below — the two captures turned out to be from two structurally different Slides present-mode flows, not the same flow in two states. |

## 2026-08-14 findings

The two captures' URLs revealed they came from different real Slides
flows, not "the same present session, windowed vs. fullscreen" as the
procedure assumed:

- **`2026-08-14-windowed.json`** — the dedicated `/present` tab
  (`.../present?token=...`). The a11y element was found directly in the
  **top document** (`hostIframeClassName: null`), with the correct live
  slide number. `iframe.punch-present-iframe` was **not found anywhere on
  the page** — assumption #2 is directly contradicted for this flow.
- **`2026-08-14-fullscreen.json`** — the in-editor overlay present flow
  (still on the `/edit` URL). Here `iframe.punch-present-iframe` exists as
  expected, containing the a11y element, and fullscreening it fullscreens
  a wrapping `div.punch-full-screen-element.punch-full-window-overlay` —
  confirming #4, and confirming #2/#3 for *this specific flow*. The
  captured geometry (`slideRectWithinIframe` 1512×851, inset ~49px
  top/bottom from the iframe's own 1512×949 rect) is genuine letterboxing,
  confirming #3's core mechanism — though the iframe's own rect happened
  to sit at `(0,0)` in this capture, so the offset-addition step of
  `getSlideRect` specifically wasn't stress-tested.

**Open question:** for the `/present`-tab flow (no iframe at all), does
the a11y element's rect fill the browser viewport exactly, or is it
letterboxed by some non-iframe means within the top document? If the
former, `content.js`'s existing no-iframe fallback (size off
`window.innerWidth`/`innerHeight`) is already correct for that flow by
coincidence. If the latter, that fallback has the same off-slide bug the
iframe-based code already guards against, just via a different code path
— a real, currently-shipping issue, since the `/present`-tab flow is
likely the primary way most users invoke "Present."

The capture script was extended on 2026-08-14 to record `a11yElement.rect`
(now populated regardless of whether an iframe was found) and a top-level
`viewport` field specifically to answer this on the next capture — compare
`a11yElement.rect` against `viewport` when `hostIframeClassName` is `null`.
Not yet re-run against the `/present`-tab flow with the updated script.
