// Paste this into DevTools console while a Google Slides presentation is
// in Present mode (windowed or fullscreen) to capture the DOM facts
// recorded in docs/google_slides_dom_assumptions.md.
//
// After running, use DevTools' `copy(result)` to copy the JSON to your
// clipboard, then save it as
// docs/manual_tests/captures/YYYY-MM-DD-<windowed|fullscreen>.json — see
// docs/manual_tests.md's "Verifying fixture assumptions against real
// Google Slides" section for the full procedure.
//
// NOTE: tests/e2e/capture-script-sanity.spec.js calls
// window.captureGoogleSlidesDom() directly after injecting this file via a
// classic <script> tag, so captureGoogleSlidesDom must stay a top-level
// `function` declaration — not wrapped in an IIFE, not a `const`/arrow
// function — or it won't attach to `window` and that test will fail.
function captureGoogleSlidesDom() {
  function findA11yElement() {
    const candidates = [{ doc: document, hostIframeClassName: null }];
    for (const iframe of document.querySelectorAll("iframe")) {
      try {
        if (iframe.contentDocument) {
          candidates.push({
            doc: iframe.contentDocument,
            hostIframeClassName: iframe.className || null,
          });
        }
      } catch (e) {
        // cross-origin iframe — skip
      }
    }
    for (const { doc, hostIframeClassName } of candidates) {
      const el = doc.querySelector('.punch-viewer-svgpage-a11yelement[aria-label*="Slide"]');
      if (el) {
        return {
          found: true,
          ariaLabel: el.getAttribute("aria-label"),
          // getAttribute, not .className: if el is an SVG element,
          // .className returns an SVGAnimatedString, not a plain string,
          // and JSON-serializing it (via copy(result)) silently produces
          // {} instead of the real class list.
          className: el.getAttribute("class"),
          hostIframeClassName,
        };
      }
    }
    return { found: false, ariaLabel: null, className: null, hostIframeClassName: null };
  }

  function findPresentIframe() {
    const iframe = document.querySelector("iframe.punch-present-iframe");
    if (!iframe) {
      return { found: false, className: null, rect: null };
    }
    const rect = iframe.getBoundingClientRect();
    return {
      found: true,
      // getAttribute, not .className — see note in findA11yElement.
      className: iframe.getAttribute("class"),
      rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
    };
  }

  function findSlideRectWithinIframe() {
    const iframe = document.querySelector("iframe.punch-present-iframe");
    if (!iframe) return null;
    let idoc;
    try {
      idoc = iframe.contentDocument;
    } catch (e) {
      return null;
    }
    if (!idoc) return null;
    const slideEl = idoc.querySelector('.punch-viewer-svgpage-a11yelement[aria-label*="Slide"]');
    if (!slideEl) return null;
    const r = slideEl.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }

  function findFullscreenInfo() {
    const el = document.fullscreenElement;
    if (!el) {
      return {
        active: false,
        fullscreenElementTagName: null,
        fullscreenElementClassName: null,
        fullscreenElementIsPresentIframe: null,
        fullscreenElementContainsPresentIframe: null,
      };
    }
    const presentIframe = document.querySelector("iframe.punch-present-iframe");
    return {
      active: true,
      fullscreenElementTagName: el.tagName,
      // getAttribute, not .className — see note in findA11yElement. The
      // fullscreen element is exactly the kind of element (a wrapping SVG
      // container) this bug bites in practice.
      fullscreenElementClassName: el.getAttribute("class"),
      fullscreenElementIsPresentIframe: presentIframe ? el === presentIframe : null,
      fullscreenElementContainsPresentIframe: presentIframe ? el.contains(presentIframe) : null,
    };
  }

  return {
    capturedAt: new Date().toISOString(),
    url: window.location.href,
    a11yElement: findA11yElement(),
    presentIframe: findPresentIframe(),
    slideRectWithinIframe: findSlideRectWithinIframe(),
    fullscreen: findFullscreenInfo(),
  };
}

const result = captureGoogleSlidesDom();
result;
