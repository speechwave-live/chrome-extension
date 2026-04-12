/**
 * Google Slides adapter.
 *
 * Reads the current slide number from the a11y element's aria-label attribute.
 * Returns 0 if the element is absent or the value cannot be parsed — this
 * is the "unknown slide" sentinel used by the server (reactions go to slide 0).
 *
 * The element lives inside a same-origin presentation iframe that Google Slides
 * loads when the slideshow is running (fullscreen or windowed). It is NOT present
 * in the editor view. Slide tracking therefore only works once the slideshow has
 * started. The adapter searches all accessible iframes so no changes to
 * content.js are needed if Google moves the element to a different iframe.
 *
 * BRITTLE: depends on Google Slides DOM structure. When this test starts
 * failing, update the selector here and the fixture in
 * tests/fixtures/google_slides_dom.html to match the new structure.
 */
function getSlide() {
  const docs = [document];
  for (const iframe of document.querySelectorAll("iframe")) {
    try {
      if (iframe.contentDocument) docs.push(iframe.contentDocument);
    } catch (e) {
      // cross-origin iframe — skip
    }
  }

  for (const doc of docs) {
    const el = doc.querySelector('.punch-viewer-svgpage-a11yelement[aria-label*="Slide"]');
    if (el) {
      const match = el.getAttribute("aria-label").match(/^Slide (\d+)/);
      if (match) return parseInt(match[1], 10);
    }
  }

  return 0;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getSlide };
} else {
  window.JoyconfGoogleSlidesAdapter = { getSlide };
}
