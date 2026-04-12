// In the browser, adapter files are injected before this file (see manifest.json),
// so window.JoyconfGoogleSlidesAdapter is available. In Jest (jsdom), window exists
// but window.JoyconfGoogleSlidesAdapter is never set — the ternary falls through to
// require(), which is the intended test path. Do not reorder manifest.json injection
// without updating this logic.
const ADAPTERS = [
  {
    match: /docs\.google\.com\/presentation/,
    getSlide: (typeof window !== "undefined" && window.JoyconfGoogleSlidesAdapter)
      ? window.JoyconfGoogleSlidesAdapter.getSlide
      : (typeof require !== "undefined" ? require("./google_slides").getSlide : () => 0),
  },
];

function getAdapter(url) {
  const adapter = ADAPTERS.find((a) => a.match.test(url));
  return adapter || { getSlide: () => 0 };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getAdapter };
} else {
  window.JoyconfAdapterRegistry = { getAdapter };
}
