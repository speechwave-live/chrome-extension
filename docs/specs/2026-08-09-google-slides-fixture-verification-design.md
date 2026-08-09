# Verifying e2e Fixtures Against Real Google Slides — Design

## Context

The e2e fixtures added in `docs/plans/2026-08-08-overlay-positioning-e2e-gaps.md`
(`tests/e2e/fixtures/windowed-slide.html`, `slide-frame.html`) simulate Google
Slides' presentation DOM structure — a `.punch-present-iframe` letterboxing a
`.punch-viewer-svgpage-a11yelement`-bearing slide — based on assumptions
nobody has automated a way to check against the real thing (Google's login
flow blocks automated sign-in against real Slides; see
`docs/specs/2026-08-06-extension-playwright-e2e-testing-design.md`). That
branch's final review surfaced a concrete instance of the risk this creates:
nobody has confirmed whether real Google Slides fullscreens the bare
presentation iframe or a wrapping element, and `content.js`'s
`fullscreenchange` listener would silently fail to render the overlay if the
former turns out to be true — a risk currently recorded only as a doc note
in `docs/manual_tests.md`.

More broadly, `adapters/google_slides.js` already carries a `BRITTLE`
comment acknowledging the same class of risk for the slide-number selector.
Every one of these assumptions can drift out from under us in two different
ways: we change our own code/fixtures based on a wrong assumption, or Google
changes their DOM and we never find out until a customer notices the overlay
is broken.

## Goal

Give ourselves a cheap, repeatable way to check our fixtures' assumptions
against real Google Slides, split into a human step (capture real DOM facts
from a live, logged-in browser — the one thing that can't be automated) and
an agent step (compare the capture against a documented list of what we
assume and report drift).

## Non-goals

- **Automating the capture itself.** Still blocked by Google's login flow,
  same as full e2e automation. Out of scope, not attempted here.
- **Catching Google-side drift proactively, without a human in the loop.**
  That needs either a real recurring cadence or a runtime canary in the
  shipped extension (have `content.js` notice when its selectors
  unexpectedly stop matching for real users, and surface that). Both were
  considered; this design deliberately ships only the cheaper half now —
  re-verify when *our own* code touches a load-bearing assumption. A
  runtime canary is a meaningfully larger project (telemetry/logging
  infrastructure, privacy considerations) and is logged below as a future
  follow-up, not designed here.
- **A packaged skill or slash command for the comparison step.** Considered
  and deferred — invoking this is infrequent enough (only when a PR touches
  a load-bearing selector) that a documented ad hoc procedure is enough
  process. Revisit if it turns out to recur often enough that re-deriving
  the framing each time becomes real overhead.

## Components

### 1. `docs/google_slides_dom_assumptions.md` — the assumptions ledger

A table enumerating every place our code assumes something about real
Google Slides' DOM that we can't verify automatically. Columns: Assumption,
Encoded in (file:line), What breaks if wrong, Last verified (date + capture
file). Seeded with the four assumptions known today:

1. **Slide-number selector**: `.punch-viewer-svgpage-a11yelement[aria-label*="Slide"]`
   exists, with an `aria-label` matching `/^Slide (\d+)/`, inside the
   top document or a same-origin iframe. Encoded in
   `adapters/google_slides.js:29-32`. If wrong: slide tracking silently
   returns 0 (the "unknown slide" sentinel), reactions route to slide 0
   server-side.
2. **Presentation iframe class**: the live slideshow renders inside
   `iframe.punch-present-iframe`. Encoded in `content/content.js:59-61`
   (`getPresentIframe`). If wrong: overlay falls back to viewport-relative
   sizing/position instead of anchoring to the slide — the exact bug the
   windowed-position e2e spec exists to catch, just via a different failure
   path (selector never matches, vs. matches but returns the wrong rect).
3. **Letterbox geometry**: the a11y element's `getBoundingClientRect()`
   within the iframe's own document represents the visible slide's bounds;
   offsetting by the iframe's own top-document rect gives correct
   top-document coordinates. Encoded in `content/content.js:71-91`
   (`getSlideRect`). If wrong: overlay/emoji render off-slide in windowed
   present mode.
4. **Fullscreen target** *(open, unconfirmed — see `docs/manual_tests.md`)*:
   whether real Google Slides fullscreens the bare `punch-present-iframe`
   or a wrapping element. Encoded implicitly in `content/content.js:158-166`
   (`fullscreenchange` listener, which appends into whatever
   `document.fullscreenElement` is). If the bare iframe: the overlay is
   appended into a node that never renders light-DOM children, and silently
   fails to render in fullscreen present mode.

### 2. `docs/manual_tests/capture_real_google_slides_dom.js` — the capture script

A small, dependency-free script pasted into DevTools console against a
**real, logged-in** Google Slides presentation in Present mode. Gathers
exactly the facts the ledger needs into one JSON object, meant to be pulled
out via Chrome DevTools' `copy()` helper. Not a full-page save (already
ruled out — Chrome's Save-As-Complete doesn't reliably serialize nested
iframe documents, and wouldn't capture `document.fullscreenElement` state
at all).

Output shape:

```json
{
  "capturedAt": "2026-08-09T14:32:00.000Z",
  "url": "https://docs.google.com/presentation/d/.../present",
  "a11yElement": {
    "found": true,
    "ariaLabel": "Slide 1 of 12: Title text",
    "className": "punch-viewer-svgpage-a11yelement",
    "hostIframeClassName": "punch-present-iframe"
  },
  "presentIframe": {
    "found": true,
    "className": "punch-present-iframe",
    "rect": { "left": 0, "top": 0, "right": 1280, "bottom": 720 }
  },
  "slideRectWithinIframe": { "left": 0, "top": 40, "right": 1280, "bottom": 680 },
  "fullscreen": {
    "active": false,
    "fullscreenElementTagName": null,
    "fullscreenElementClassName": null,
    "fullscreenElementIsPresentIframe": null,
    "fullscreenElementContainsPresentIframe": null
  }
}
```

The same script runs unchanged in both windowed and fullscreen present
mode — it introspects whatever's true at the moment it's run.
`fullscreen.active` and its siblings are simply `false`/`null` when not
in fullscreen; running the script again after entering fullscreen fills
them in. No mode parameter, no branching the human has to configure.

### 3. New section in `docs/manual_tests.md`: capturing and comparing

Step-by-step human procedure:
1. Open a real Google Slides presentation you own, start Present
   (windowed, not fullscreen).
2. Open DevTools console, paste the contents of
   `docs/manual_tests/capture_real_google_slides_dom.js`, run it.
3. `copy(result)` and save the clipboard contents as
   `docs/manual_tests/captures/YYYY-MM-DD-windowed.json`.
4. Enter fullscreen present mode, re-run the same script, save as
   `docs/manual_tests/captures/YYYY-MM-DD-fullscreen.json`.
5. Hand both files to Claude in a normal conversation and ask it to compare
   them against `docs/google_slides_dom_assumptions.md`.

Captures are committed to git — the ledger's "last verified" column points
at real, timestamped evidence rather than an unverifiable claim, and future
captures give a diffable history if Google's DOM changes.

The agent side of step 5 is intentionally just a plain instruction, not a
packaged skill (see Non-goals): read the ledger, read the capture(s), report
each assumption as confirmed / contradicted / inconclusive (element not
found — capture may need a different point in the flow), with file:line
evidence for each. A contradicted assumption becomes a normal bug-fix task:
update the code/fixture, update the ledger's row, note the new capture file
as evidence.

### 4. The trigger: pointers at the point of risk

- `adapters/google_slides.js`'s existing `BRITTLE` comment gets a line
  added: touching this selector means re-running the capture-and-compare
  procedure in `docs/manual_tests.md` before merging, and updating
  `docs/google_slides_dom_assumptions.md`'s row.
- `content/content.js` gets an equivalent comment near the
  `fullscreenchange` listener (content.js:158-166), since that code
  currently has no comment at all acknowledging it rests on an unconfirmed
  assumption.
- Both comments point at the ledger by path so the assumption list itself
  stays the single source of truth, rather than duplicating the "what
  breaks if wrong" reasoning in three places.

## Validating the capture script itself

Before asking a human to spend time running this against a real,
logged-in Google account, sanity-check the script's own correctness
locally: open `tests/e2e/fixtures/windowed-slide.html` directly in a
browser (or via the e2e fixture server), paste the capture script, and
confirm its output matches what that fixture is built to represent (e.g.
`presentIframe.rect` matching the fixture's declared CSS geometry,
`a11yElement.found: true`). This doesn't validate the *assumptions* — only
a real capture can do that — it only validates that the script itself
doesn't have bugs that would produce a misleading "capture" from a real
session.

## Future follow-up (not designed here)

A runtime canary in the shipped extension — `content.js` noticing when
`getSlide()`/`getPresentIframe()`/`getSlideRect()` unexpectedly fail to find
their expected elements for real users, and surfacing that — is the only
way to catch Google-side DOM drift without waiting for a human to manually
re-capture. This is a meaningfully larger project (what to log, where it
goes, privacy considerations for anything leaving the user's browser) and
is deliberately out of scope for this design.
