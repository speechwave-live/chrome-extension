// In the browser, adapter files are injected before this file (see manifest.json),
// so window.SpeechwaveGoogleSlidesAdapter is available. In Jest (jsdom), window exists
// but window.SpeechwaveGoogleSlidesAdapter is never set — the ternary falls through to
// require(), which is the intended test path. Do not reorder manifest.json injection
// without updating this logic.
const GOOGLE_SLIDES_ADAPTER = {
  getSlide: (typeof window !== "undefined" && window.SpeechwaveGoogleSlidesAdapter)
    ? window.SpeechwaveGoogleSlidesAdapter.getSlide
    : (typeof require !== "undefined" ? require("./google_slides").getSlide : () => 0),
};

// Matches against the manifest's own content_scripts[0].matches instead of a
// hardcoded duplicate of the Slides URL, so this stays in sync with whatever
// this content script is actually injected into — including the e2e fixture
// origin bin/e2e_mode_on adds to the manifest during test runs only. Chrome
// match patterns aren't full regexes; every pattern here is a plain
// "<origin>/*", so a prefix check after stripping the trailing "*" is
// equivalent to real match-pattern semantics for this codebase's needs.
// Wrapped in try/catch because chrome.runtime.getManifest() can throw if the
// extension context is invalidated (e.g. reloaded while this content script
// is still running). Falls back to the null adapter rather than letting the
// throw itself propagate out of getAdapter — doesn't guarantee anything else
// in content.js still works afterward (a truly invalidated context will
// likely fail the next chrome.runtime call too), just that this call won't
// be the one that aborts the module body.
function getAdapter(url) {
  try {
    const { matches } = chrome.runtime.getManifest().content_scripts[0];
    const isContentScriptUrl = matches.some((pattern) => url.startsWith(pattern.replace(/\*$/, "")));
    return isContentScriptUrl ? GOOGLE_SLIDES_ADAPTER : { getSlide: () => 0 };
  } catch {
    return { getSlide: () => 0 };
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getAdapter };
} else {
  window.SpeechwaveAdapterRegistry = { getAdapter };
}
