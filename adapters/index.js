// In the browser, adapter files are injected before this file (see manifest.json),
// so window.SpeechwaveGoogleSlidesAdapter is available. In Jest (jsdom), window exists
// but window.SpeechwaveGoogleSlidesAdapter is never set — the ternary falls through to
// require(), which is the intended test path. Do not reorder manifest.json injection
// without updating this logic.
const ADAPTERS = [
  {
    getSlide: (typeof window !== "undefined" && window.SpeechwaveGoogleSlidesAdapter)
      ? window.SpeechwaveGoogleSlidesAdapter.getSlide
      : (typeof require !== "undefined" ? require("./google_slides").getSlide : () => 0),
  },
];

// Matches against the manifest's own content_scripts[0].matches instead of a
// hardcoded duplicate of the Slides URL, so this stays in sync with whatever
// this content script is actually injected into — including the e2e fixture
// origin bin/e2e_mode_on adds to the manifest during test runs only. Chrome
// match patterns aren't full regexes; every pattern here is a plain
// "<origin>/*", so a prefix check after stripping the trailing "*" is
// equivalent to real match-pattern semantics for this codebase's needs.
function getAdapter(url) {
  const { matches } = chrome.runtime.getManifest().content_scripts[0];
  const isContentScriptUrl = matches.some((pattern) => url.startsWith(pattern.replace(/\*$/, "")));
  return isContentScriptUrl ? ADAPTERS[0] : { getSlide: () => 0 };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getAdapter };
} else {
  window.SpeechwaveAdapterRegistry = { getAdapter };
}
