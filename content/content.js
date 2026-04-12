// Phoenix UMD build loaded before this file exposes window.Phoenix
const { Socket } = window.Phoenix;

// const HOST = "wss://joyconf.fly.dev";
const HOST = "ws://localhost:4000";

let socket = null;
let channel = null;
let slideInterval = null;
let currentSlide = 0;

const FIREWORKS_MIN_COUNT = 5;
const FIREWORKS_MIN_PERCENT = 0.4;
const FIREWORKS_COOLDOWN_MS = 8000;
const FIREWORKS_BURST_COUNT = 16;

const inFlight = {};
let fireworksEnabled = false;
let fireworksActive = false;
let lastFireworksTime = 0;

// Inject animation keyframes once
const style = document.createElement("style");
style.textContent = `
  @keyframes joyconfFloat {
    0%   { transform: translateY(0);    opacity: 1; }
    100% { transform: translateY(-60px); opacity: 0; }
  }
`;
document.head.appendChild(style);

function getOrCreateOverlay() {
  let overlay = document.getElementById("joyconf-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "joyconf-overlay";
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

// When the browser enters/exits fullscreen, the fullscreen element forms its own
// stacking context — elements appended to <body> won't appear on top of it.
// Re-parent the overlay into the fullscreen element so it remains visible.
document.addEventListener("fullscreenchange", () => {
  const overlay = document.getElementById("joyconf-overlay");
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
    "animation: joyconfFloat 2.5s ease-out forwards",
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
  if (window.JoyconfFireworks.checkFireworksTrigger(inFlight, emoji, {
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
  const cx = 80;  // overlay is always 160px wide
  const cy = 100; // overlay is always 200px tall
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

function connect(slug) {
  if (socket) {
    socket.disconnect();
    socket = null;
    channel = null;
    stopSlideObserver();
  }

  socket = new Socket(`${HOST}/socket`, {
    logger: (kind, msg, data) => console.debug(`[JoyConf] ${kind}: ${msg}`, data)
  });
  socket.onError(() => console.error("[JoyConf] Socket error — check HOST and that the server is running"));
  socket.connect();

  channel = socket.channel(`reactions:${slug}`, {});
  channel.on("new_reaction", ({ emoji }) => spawnEmoji(emoji));
  channel
    .join()
    .receive("ok", () => {
      console.log(`[JoyConf] Joined reactions:${slug}`);
      startSlideObserver();
    })
    .receive("error", ({ reason }) => {
      console.error(`[JoyConf] Channel join failed: ${reason}`);
      socket.disconnect();
      socket = null;
    });

  getOrCreateOverlay();
  return true;
}

function isConnected() {
  return socket !== null && socket.isConnected();
}

function startSlideObserver() {
  const registry = window.JoyconfAdapterRegistry;
  if (!registry) return;

  const adapter = registry.getAdapter(window.location.href);

  function checkSlide() {
    const slide = adapter.getSlide();
    if (slide !== currentSlide) {
      currentSlide = slide;
      if (channel) {
        channel.push("slide_changed", { slide: currentSlide });
      }
      chrome.runtime.sendMessage({ type: "SLIDE_CHANGED", slide: currentSlide }, () => {
        void chrome.runtime.lastError; // suppress "no listener" error when popup is closed
      });
    }
  }

  checkSlide(); // read immediately on connect
  slideInterval = setInterval(checkSlide, 500);
}

function stopSlideObserver() {
  if (slideInterval) {
    clearInterval(slideInterval);
    slideInterval = null;
  }
  currentSlide = 0;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "SET_SLUG") {
    const connected = connect(msg.slug);
    sendResponse({ connected });
  } else if (msg.type === "GET_STATUS") {
    sendResponse({ connected: isConnected(), slide: currentSlide });
  } else if (msg.type === "START_SESSION") {
    if (!channel) {
      sendResponse({ error: "not_connected" });
      return;
    }
    channel
      .push("start_session", {})
      .receive("ok", ({ session_id, label }) => sendResponse({ session_id, label }))
      .receive("error", ({ reason }) => sendResponse({ error: reason }));
    return true; // keep the message channel open for the async reply
  } else if (msg.type === "STOP_SESSION") {
    if (!channel) {
      sendResponse({ error: "not_connected" });
      return;
    }
    channel
      .push("stop_session", { session_id: msg.sessionId })
      .receive("ok", () => sendResponse({ stopped: true }))
      .receive("error", ({ reason }) => sendResponse({ error: reason }));
    return true; // keep the message channel open for the async reply
  } else if (msg.type === "SET_FIREWORKS") {
    fireworksEnabled = msg.enabled;
    // no response needed — popup fires and forgets
  } else if (msg.type === "TEST_FIREWORKS") {
    if (!fireworksActive) {
      const testEmojis = ["❤️", "😂", "👏", "🤯", "🙋🏻", "🎉", "💩", "😮", "🎯"];
      spawnFireworks(testEmojis[Math.floor(Math.random() * testEmojis.length)]);
    }
  }
});

// Auto-connect on page load if slug is saved
chrome.storage.local.get("slug", ({ slug }) => {
  if (slug) connect(slug);
});

chrome.storage.sync.get({ fireworksEnabled: true }, ({ fireworksEnabled: val }) => {
  fireworksEnabled = val;
});
