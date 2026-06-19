const FIREWORKS_MIN_COUNT = 5;
const FIREWORKS_MIN_PERCENT = 0.4;
const FIREWORKS_COOLDOWN_MS = 8000;
const FIREWORKS_BURST_COUNT = 16;

const inFlight = {};
let fireworksEnabled = false;
let fireworksActive = false;
let lastFireworksTime = 0;
let slideInterval = null;
let currentSlide = 0;

const style = document.createElement("style");
style.textContent = `
  @keyframes speechwaveFloat {
    0%   { transform: translateY(0);    opacity: 1; }
    100% { transform: translateY(-60px); opacity: 0; }
  }
`;
document.head.appendChild(style);

function getOrCreateOverlay() {
  let overlay = document.getElementById("speechwave-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "speechwave-overlay";
    overlay.style.cssText = [
      "position: fixed",
      "bottom: 40px",
      "right: 20px",
      "width: 160px",
      "height: 200px",
      "pointer-events: none",
      "z-index: 999999",
      "overflow: hidden",
    ].join(";");
    document.body.appendChild(overlay);
  }
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
    "font-size: 28px",
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
  const cx = 80;
  const cy = 100;
  let remaining = FIREWORKS_BURST_COUNT;
  const safetyTimer = setTimeout(() => { fireworksActive = false; }, 2000);

  for (let i = 0; i < FIREWORKS_BURST_COUNT; i++) {
    const angle = (i / FIREWORKS_BURST_COUNT) * 2 * Math.PI;
    const dist = 60 + Math.random() * 40;
    const tx = Math.round(Math.cos(angle) * dist);
    const ty = Math.round(Math.sin(angle) * dist);
    const delay = Math.random() * 300;

    const el = document.createElement("span");
    el.textContent = emoji;
    el.style.cssText = [
      "position: absolute",
      `left: ${cx}px`,
      `top: ${cy}px`,
      "font-size: 24px",
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
  } else if (msg.type === "SET_FIREWORKS") {
    fireworksEnabled = msg.enabled;
  } else if (msg.type === "TEST_FIREWORKS") {
    if (!fireworksActive) {
      const testEmojis = ["❤️", "😂", "👏", "🤯", "🙋🏻", "🎉", "💩", "😮", "🎯"];
      spawnFireworks(testEmojis[Math.floor(Math.random() * testEmojis.length)]);
    }
  }
});

getOrCreateOverlay();
startSlideObserver();

chrome.storage.sync.get({ fireworksEnabled: true }, ({ fireworksEnabled: val }) => {
  fireworksEnabled = val;
});
