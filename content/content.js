const FIREWORKS_MIN_COUNT = 5;
const FIREWORKS_MIN_PERCENT = 0.4;
const FIREWORKS_COOLDOWN_MS = 8000;
const FIREWORKS_BURST_COUNT = 16;

// Sizes below are tuned for a slide rendered at roughly this width; actual
// values are scaled by overlayScale (slide width / this) so the overlay and
// emoji stay proportional to the slide regardless of window/present size.
const SLIDE_REFERENCE_WIDTH = 960;
const MIN_OVERLAY_SCALE = 0.4;
const MAX_OVERLAY_SCALE = 2;

const OVERLAY_WIDTH = 160;
const OVERLAY_HEIGHT = 200;
const OVERLAY_RIGHT_MARGIN = 20;
const OVERLAY_BOTTOM_MARGIN = 20;
const EMOJI_FONT_SIZE = 28;
const FIREWORK_FONT_SIZE = 24;
const FIREWORK_CENTER_X = 80;
const FIREWORK_CENTER_Y = 100;
const FIREWORK_MIN_DISTANCE = 60;
const FIREWORK_DISTANCE_RANGE = 40;
// Google renders slide content in an iframe it stacks above regular page
// content. Regardless of that iframe's own z-index, the maximum value beats
// it under normal stacking rules (see docs/decisions.md for why fullscreen
// mode additionally needs the top-layer reparenting below).
const OVERLAY_MAX_Z_INDEX = 2147483647;

const DEFAULT_CONFIG = {
  settings: { overlay_size_percent: 20, fireworks_enabled: true },
  tuning: {
    default_overlay_size_percent: 20,
    min_overlay_size_percent: 10,
    overlay_margin_px: 8,
    emoji_font_size_ratio: 0.14,
    firework_font_size_ratio: 0.12,
    firework_center_x_ratio: 0.5,
    firework_center_y_ratio: 0.5,
    firework_spread_min_ratio: 0.375,
    firework_spread_range_ratio: 0.25,
    emoji_rise_ratio: 0.3,
  },
};

let remoteConfig = DEFAULT_CONFIG;

const inFlight = {};
let fireworksEnabled = DEFAULT_CONFIG.settings.fireworks_enabled;
let fireworksActive = false;
let lastFireworksTime = 0;
let slideInterval = null;
let currentSlide = 0;
// Updated by syncOverlayPosition (called via getOrCreateOverlay before every
// spawn), so spawnEmoji/spawnFireworks always read the current slide's scale.
let overlayScale = 1;

const style = document.createElement("style");
style.textContent = `
  @keyframes speechwaveFloat {
    0%   { transform: translateY(0);    opacity: 1; }
    100% { transform: translateY(-60px); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Google Slides renders the live presentation inside this iframe (present
// mode, fullscreen or windowed). Anchoring to it (instead of assuming
// slide == viewport) is what makes the overlay track the slide correctly
// in windowed present mode.
function getPresentIframe() {
  return document.querySelector("iframe.punch-present-iframe");
}

// The iframe letterboxes the slide to preserve its aspect ratio (black bars
// above/below or beside it), so the iframe's own rect is not the visible
// slide's rect. The a11y element already used for slide-number tracking
// (see adapters/google_slides.js) happens to be sized/positioned to match
// the visible slide exactly, so we reuse it here instead of guessing at
// the letterbox math ourselves. Its rect is relative to the iframe's own
// viewport, so we offset it by the iframe's own rect to get top-document
// coordinates.
function getSlideRect(iframe) {
  let idoc;
  try {
    idoc = iframe.contentDocument;
  } catch (e) {
    return null; // cross-origin — shouldn't happen for our own present iframe, but don't crash
  }
  if (!idoc) return null;

  const slideEl = idoc.querySelector('.punch-viewer-svgpage-a11yelement[aria-label*="Slide"]');
  if (!slideEl) return null;

  const iframeRect = iframe.getBoundingClientRect();
  const innerRect = slideEl.getBoundingClientRect();
  return {
    left: iframeRect.left + innerRect.left,
    right: iframeRect.left + innerRect.right,
    top: iframeRect.top + innerRect.top,
    bottom: iframeRect.top + innerRect.bottom,
  };
}

function syncOverlayPosition(overlay) {
  const iframe = getPresentIframe();
  const rect = iframe && (getSlideRect(iframe) || iframe.getBoundingClientRect());

  if (rect) {
    const rawScale = (rect.right - rect.left) / SLIDE_REFERENCE_WIDTH;
    overlayScale = Math.min(MAX_OVERLAY_SCALE, Math.max(MIN_OVERLAY_SCALE, rawScale));

    const width = OVERLAY_WIDTH * overlayScale;
    const height = OVERLAY_HEIGHT * overlayScale;
    // Margin scales with everything else so the overlay covers roughly the
    // same proportion of the slide at any size (not just the same box size
    // in a fixed-size gap).
    const rightMargin = OVERLAY_RIGHT_MARGIN * overlayScale;
    const bottomMargin = OVERLAY_BOTTOM_MARGIN * overlayScale;

    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
    overlay.style.left = `${rect.right - width - rightMargin}px`;
    overlay.style.top = `${rect.bottom - height - bottomMargin}px`;
    overlay.style.right = "";
    overlay.style.bottom = "";
    overlay.style.zIndex = OVERLAY_MAX_Z_INDEX;
  } else {
    overlayScale = 1;
    overlay.style.width = `${OVERLAY_WIDTH}px`;
    overlay.style.height = `${OVERLAY_HEIGHT}px`;
    overlay.style.left = "";
    overlay.style.top = "";
    overlay.style.right = `${OVERLAY_RIGHT_MARGIN}px`;
    overlay.style.bottom = `${OVERLAY_BOTTOM_MARGIN}px`;
    overlay.style.zIndex = 999999;
  }
}

function getOrCreateOverlay() {
  let overlay = document.getElementById("speechwave-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "speechwave-overlay";
    overlay.style.cssText = [
      "position: fixed",
      "pointer-events: none",
      "overflow: hidden",
    ].join(";");
    document.body.appendChild(overlay);
  }
  syncOverlayPosition(overlay);
  return overlay;
}

document.addEventListener("fullscreenchange", () => {
  const overlay = document.getElementById("speechwave-overlay");
  if (!overlay) return;
  if (document.fullscreenElement) {
    document.fullscreenElement.appendChild(overlay);
  } else {
    document.body.appendChild(overlay);
  }
});

function spawnEmoji(emoji) {
  inFlight[emoji] = (inFlight[emoji] || 0) + 1;

  const overlay = getOrCreateOverlay();
  const el = document.createElement("span");
  el.textContent = emoji;
  el.style.cssText = [
    "position: absolute",
    "bottom: 0",
    `left: ${Math.floor(Math.random() * 70)}%`,
    `font-size: ${EMOJI_FONT_SIZE * overlayScale}px`,
    "animation: speechwaveFloat 2.5s ease-out forwards",
    "pointer-events: none",
  ].join(";");
  overlay.appendChild(el);
  el.addEventListener("animationend", () => {
    el.remove();
    inFlight[emoji] = Math.max(0, (inFlight[emoji] || 0) - 1);
    if (inFlight[emoji] === 0) delete inFlight[emoji];
  });

  maybeSpawnFireworks(emoji);
}

function maybeSpawnFireworks(emoji) {
  if (!fireworksEnabled) return;
  if (fireworksActive) return;
  if (Date.now() - lastFireworksTime < FIREWORKS_COOLDOWN_MS) return;
  if (window.SpeechwaveFireworks.checkFireworksTrigger(inFlight, emoji, {
    minCount: FIREWORKS_MIN_COUNT,
    minPercent: FIREWORKS_MIN_PERCENT,
  })) {
    spawnFireworks(emoji);
  }
}

function spawnFireworks(emoji) {
  fireworksActive = true;
  lastFireworksTime = Date.now();

  if (FIREWORKS_BURST_COUNT === 0) {
    fireworksActive = false;
    return;
  }

  const overlay = getOrCreateOverlay();
  const cx = FIREWORK_CENTER_X * overlayScale;
  const cy = FIREWORK_CENTER_Y * overlayScale;
  let remaining = FIREWORKS_BURST_COUNT;
  const safetyTimer = setTimeout(() => { fireworksActive = false; }, 2000);

  for (let i = 0; i < FIREWORKS_BURST_COUNT; i++) {
    const angle = (i / FIREWORKS_BURST_COUNT) * 2 * Math.PI;
    const dist = (FIREWORK_MIN_DISTANCE + Math.random() * FIREWORK_DISTANCE_RANGE) * overlayScale;
    const tx = Math.round(Math.cos(angle) * dist);
    const ty = Math.round(Math.sin(angle) * dist);
    const delay = Math.random() * 300;

    const el = document.createElement("span");
    el.textContent = emoji;
    el.style.cssText = [
      "position: absolute",
      `left: ${cx}px`,
      `top: ${cy}px`,
      `font-size: ${FIREWORK_FONT_SIZE * overlayScale}px`,
      "pointer-events: none",
    ].join(";");
    overlay.appendChild(el);

    const anim = el.animate(
      [
        { transform: "translate(0, 0) scale(1)", opacity: 1 },
        { transform: `translate(${tx}px, ${ty}px) scale(0.3)`, opacity: 0 },
      ],
      { duration: 1200, delay, easing: "ease-out", fill: "forwards" }
    );
    anim.addEventListener("finish", () => {
      el.remove();
      remaining--;
      if (remaining === 0) {
        clearTimeout(safetyTimer);
        fireworksActive = false;
      }
    });
  }
}

function startSlideObserver() {
  const registry = window.SpeechwaveAdapterRegistry;
  if (!registry) return;

  const adapter = registry.getAdapter(window.location.href);
  if (!adapter) return;

  function checkSlide() {
    const slide = adapter.getSlide();
    if (slide !== currentSlide) {
      currentSlide = slide;
      chrome.runtime.sendMessage({ type: "SLIDE_CHANGED", slide: currentSlide }, () => {
        void chrome.runtime.lastError;
      });
    }
  }

  checkSlide();
  slideInterval = setInterval(checkSlide, 500);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "RENDER_EMOJI") {
    spawnEmoji(msg.emoji);
  } else if (msg.type === "SET_REMOTE_CONFIG") {
    remoteConfig = { settings: msg.settings, tuning: msg.tuning };
    fireworksEnabled = remoteConfig.settings.fireworks_enabled;
  } else if (msg.type === "TEST_FIREWORKS") {
    if (!fireworksActive) {
      const testEmojis = ["❤️", "😂", "👏", "🤯", "🙋🏻", "🎉", "💩", "😮", "🎯"];
      spawnFireworks(testEmojis[Math.floor(Math.random() * testEmojis.length)]);
    }
  }
});

getOrCreateOverlay();
startSlideObserver();

chrome.runtime.sendMessage({ type: "GET_REMOTE_CONFIG" }, (response) => {
  if (chrome.runtime.lastError) return;
  if (response && response.settings && response.tuning) {
    remoteConfig = response;
    fireworksEnabled = remoteConfig.settings.fireworks_enabled;
  }
});
