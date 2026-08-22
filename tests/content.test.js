const fs = require("fs");
const path = require("path");

const CONTENT_JS = fs.readFileSync(
  path.join(__dirname, "../content/content.js"),
  "utf8"
);

function loadContent() {
  chrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
    if (callback) callback();
  });

  let messageHandler;
  chrome.runtime.onMessage.addListener.mockImplementation((handler) => {
    messageHandler = handler;
  });

  // eslint-disable-next-line no-eval
  eval(CONTENT_JS);

  return { messageHandler };
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  jest.resetAllMocks();
  delete window.SpeechwaveAdapterRegistry;
  window.SpeechwaveFireworks = require("../lib/fireworks");
  global.DEFAULT_REMOTE_CONFIG = require("../lib/default_remote_config").DEFAULT_REMOTE_CONFIG;
  // jsdom doesn't implement the Web Animations API used by spawnFireworks.
  Element.prototype.animate = jest.fn().mockReturnValue({ addEventListener: jest.fn() });
});

describe("overlay", () => {
  test("creates #speechwave-overlay div on load", () => {
    loadContent();
    expect(document.getElementById("speechwave-overlay")).not.toBeNull();
  });

  test("overlay is positioned fixed", () => {
    loadContent();
    const overlay = document.getElementById("speechwave-overlay");
    expect(overlay.style.position).toBe("fixed");
  });

  test("overlay has a very high z-index", () => {
    loadContent();
    const overlay = document.getElementById("speechwave-overlay");
    expect(parseInt(overlay.style.zIndex, 10)).toBeGreaterThan(9000);
  });

  test("overlay has pointer-events: none so it does not block clicks", () => {
    loadContent();
    const overlay = document.getElementById("speechwave-overlay");
    expect(overlay.style.pointerEvents).toBe("none");
  });
});

const FULL_TUNING = {
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
};

function addPresentIframe(rect) {
  const iframe = document.createElement("iframe");
  iframe.className = "punch-present-iframe";
  iframe.getBoundingClientRect = jest.fn().mockReturnValue(rect);
  document.body.appendChild(iframe);
  return iframe;
}

describe("overlay sizing: percent of the slide's actual dimensions", () => {

  function setRemoteConfig(messageHandler, { percent, fireworksEnabled = true, tuning = FULL_TUNING }) {
    messageHandler(
      {
        type: "SET_REMOTE_CONFIG",
        settings: { overlay_size_percent: percent, fireworks_enabled: fireworksEnabled },
        tuning,
      },
      {},
      jest.fn()
    );
  }

  test("falls back to a fixed viewport corner (tuning margin) when no presentation iframe is present", () => {
    loadContent();
    const overlay = document.getElementById("speechwave-overlay");
    expect(overlay.style.right).toBe("8px"); // DEFAULT_CONFIG.tuning.overlay_margin_px
    expect(overlay.style.bottom).toBe("8px");
    expect(overlay.style.left).toBe("");
    expect(overlay.style.top).toBe("");
  });

  test("no-iframe fallback still gives the overlay non-zero dimensions, so reactions stay visible", () => {
    const { messageHandler } = loadContent();
    const overlay = document.getElementById("speechwave-overlay");

    // Regression guard: width/height used to be cleared to "" in this branch,
    // which made spawnEmoji/spawnFireworks compute a 0px box (parseFloat("") === 0),
    // rendering reactions invisible whenever no presentation iframe is found.
    expect(overlay.style.width).not.toBe("");
    expect(overlay.style.height).not.toBe("");
    expect(parseFloat(overlay.style.width)).toBeGreaterThan(0);
    expect(parseFloat(overlay.style.height)).toBeGreaterThan(0);

    messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());
    const emojiSpan = overlay.querySelector("span");
    expect(emojiSpan.style.fontSize).not.toBe("");
    expect(parseFloat(emojiSpan.style.fontSize)).toBeGreaterThan(0);

    messageHandler({ type: "TEST_FIREWORKS" }, {}, jest.fn());
    const spans = overlay.querySelectorAll("span");
    const fireworkSpan = spans[spans.length - 1]; // fireworks are appended after the emoji span above
    expect(parseFloat(fireworkSpan.style.left)).toBeGreaterThan(0);
    expect(parseFloat(fireworkSpan.style.fontSize)).toBeGreaterThan(0);
  });

  test("sizes the overlay to overlay_size_percent of the slide's actual dimensions", () => {
    addPresentIframe({ left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500 });
    loadContent();

    const overlay = document.getElementById("speechwave-overlay");
    // DEFAULT_CONFIG.settings.overlay_size_percent = 20
    expect(overlay.style.width).toBe("200px"); // 1000 * 0.2
    expect(overlay.style.height).toBe("100px"); // 500 * 0.2
    // left: 1000 - 200 - 8 (margin) = 792; top: 500 - 100 - 8 = 392
    expect(overlay.style.left).toBe("792px");
    expect(overlay.style.top).toBe("392px");
  });

  test("covers the entire slide edge-to-edge at 100%, without margin overflow", () => {
    addPresentIframe({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 });
    const { messageHandler } = loadContent();

    setRemoteConfig(messageHandler, { percent: 100 });
    messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());

    const overlay = document.getElementById("speechwave-overlay");
    expect(overlay.style.width).toBe("800px");
    expect(overlay.style.height).toBe("600px");
    expect(overlay.style.left).toBe("0px");
    expect(overlay.style.top).toBe("0px");
  });

  test("clamps overlay_size_percent up to the tuning minimum if a low value ever arrives", () => {
    addPresentIframe({ left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500 });
    const { messageHandler } = loadContent();

    setRemoteConfig(messageHandler, { percent: 2 }); // below FULL_TUNING.min_overlay_size_percent (10)
    messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());

    const overlay = document.getElementById("speechwave-overlay");
    expect(overlay.style.width).toBe("100px"); // clamped to 10% of 1000, not 2%
  });

  test("scales emoji font size and rise distance with the box's actual height", () => {
    addPresentIframe({ left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500 });
    const { messageHandler } = loadContent();

    setRemoteConfig(messageHandler, { percent: 20 });
    messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());

    const span = document.getElementById("speechwave-overlay").querySelector("span");
    // box height: 500 * 0.2 = 100; font-size: 100 * 0.14 = 14
    expect(span.style.fontSize).toBe("14px");
    // rise: 100 * 0.3 = 30
    expect(span.style.getPropertyValue("--rise")).toBe("30px");
  });

  test("scales firework center and font size with the box's actual dimensions", () => {
    addPresentIframe({ left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500 });
    const { messageHandler } = loadContent();

    setRemoteConfig(messageHandler, { percent: 20 });
    messageHandler({ type: "TEST_FIREWORKS" }, {}, jest.fn());

    const span = document.getElementById("speechwave-overlay").querySelector("span");
    // box: width 200, height 100; center: (200*0.5, 100*0.5) = (100, 50)
    expect(span.style.left).toBe("100px");
    expect(span.style.top).toBe("50px");
    // font-size: 100 (height) * 0.12 = 12
    expect(span.style.fontSize).toBe("12px");
  });
});

describe("overlay sizing: edit-view canvas anchoring", () => {
  function addCanvasContainer(rect) {
    const el = document.createElement("div");
    el.id = "canvas-container";
    el.getBoundingClientRect = jest.fn().mockReturnValue(rect);
    document.body.appendChild(el);
    return el;
  }

  test("anchors to canvas-container's rect when no present iframe is found", () => {
    addCanvasContainer({ left: 0, top: 0, right: 800, bottom: 450, width: 800, height: 450 });
    loadContent();

    const overlay = document.getElementById("speechwave-overlay");
    // DEFAULT_CONFIG.settings.overlay_size_percent = 20
    expect(overlay.style.width).toBe("160px"); // 800 * 0.2
    expect(overlay.style.height).toBe("90px"); // 450 * 0.2
    // left: 800 - 160 - 8 (margin) = 632; top: 450 - 90 - 8 = 352
    expect(overlay.style.left).toBe("632px");
    expect(overlay.style.top).toBe("352px");
    expect(overlay.style.right).toBe("");
    expect(overlay.style.bottom).toBe("");
  });

  test("present iframe takes priority over canvas-container when both exist", () => {
    addPresentIframe({ left: 0, top: 0, right: 1000, bottom: 500, width: 1000, height: 500 });
    addCanvasContainer({ left: 0, top: 0, right: 800, bottom: 450, width: 800, height: 450 });
    loadContent();

    const overlay = document.getElementById("speechwave-overlay");
    // 1000 * 0.2 = 200, from the iframe's rect — not canvas-container's 800 * 0.2 = 160
    expect(overlay.style.width).toBe("200px");
  });

  test("falls back to viewport fallback when canvas-container has a zero-size rect", () => {
    addCanvasContainer({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 });
    loadContent();

    const overlay = document.getElementById("speechwave-overlay");
    // A present-but-hidden/not-yet-laid-out canvas-container is still truthy,
    // so without a width/height guard syncOverlayPosition would take the
    // rect branch and produce a 0px-sized overlay (invisible reactions)
    // instead of degrading gracefully to the viewport fallback.
    expect(overlay.style.right).toBe("8px");
    expect(overlay.style.bottom).toBe("8px");
  });
});

describe("remote config", () => {
  test("requests GET_REMOTE_CONFIG on load", () => {
    loadContent();

    const call = chrome.runtime.sendMessage.mock.calls.find(
      ([msg]) => msg.type === "GET_REMOTE_CONFIG"
    );
    expect(call).toBeDefined();
  });

  test("SET_REMOTE_CONFIG with fireworks_enabled: false suppresses firework triggering", () => {
    const { messageHandler } = loadContent();

    messageHandler(
      {
        type: "SET_REMOTE_CONFIG",
        settings: { overlay_size_percent: 20, fireworks_enabled: false },
        tuning: { min_overlay_size_percent: 10 },
      },
      {},
      jest.fn()
    );

    for (let i = 0; i < 6; i++) {
      messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());
    }

    expect(Element.prototype.animate).not.toHaveBeenCalled();
  });

  test("SET_REMOTE_CONFIG with fireworks_enabled: true allows firework triggering", () => {
    const { messageHandler } = loadContent();

    messageHandler(
      {
        type: "SET_REMOTE_CONFIG",
        settings: { overlay_size_percent: 20, fireworks_enabled: true },
        tuning: { min_overlay_size_percent: 10 },
      },
      {},
      jest.fn()
    );

    for (let i = 0; i < 6; i++) {
      messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());
    }

    expect(Element.prototype.animate).toHaveBeenCalled();
  });

  test("defaults to fireworks enabled before any config arrives", () => {
    const { messageHandler } = loadContent();

    for (let i = 0; i < 6; i++) {
      messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());
    }

    expect(Element.prototype.animate).toHaveBeenCalled();
  });

  test("SET_REMOTE_CONFIG with a partial payload backfills missing keys from DEFAULT_CONFIG", () => {
    const { messageHandler } = loadContent();

    messageHandler(
      {
        type: "SET_REMOTE_CONFIG",
        settings: { overlay_size_percent: 50 }, // omits fireworks_enabled entirely
        tuning: { min_overlay_size_percent: 10 }, // omits overlay_margin_px and everything else
      },
      {},
      jest.fn()
    );

    // No presentation iframe is present in this test, so syncOverlayPosition
    // takes the no-iframe fallback branch. RENDER_EMOJI re-runs
    // getOrCreateOverlay -> syncOverlayPosition using the post-SET_REMOTE_CONFIG
    // remoteConfig.
    messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());

    const overlay = document.getElementById("speechwave-overlay");
    // overlay_margin_px was omitted from the tuning payload; a correct merge
    // backfills DEFAULT_CONFIG.tuning.overlay_margin_px (8) instead of
    // producing "undefinedpx" (or NaN) from the missing key.
    expect(overlay.style.right).toBe("8px");
    expect(overlay.style.bottom).toBe("8px");

    // fireworks_enabled was omitted from the settings payload; a correct
    // merge backfills DEFAULT_CONFIG.settings.fireworks_enabled (true)
    // instead of leaving it undefined, which is falsy and would silently
    // suppress fireworks.
    for (let i = 0; i < 6; i++) {
      messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());
    }
    expect(Element.prototype.animate).toHaveBeenCalled();
  });
});

describe("RENDER_EMOJI message", () => {
  test("emoji span has the floating-emoji class", () => {
    const { messageHandler } = loadContent();

    messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());

    const span = document.getElementById("speechwave-overlay").querySelector("span");
    expect(span.className).toBe("floating-emoji");
  });

  test("appends emoji span to the overlay", () => {
    const { messageHandler } = loadContent();

    messageHandler({ type: "RENDER_EMOJI", emoji: "👍" }, {}, jest.fn());

    const overlay = document.getElementById("speechwave-overlay");
    const spans = overlay.querySelectorAll("span");
    expect(spans.length).toBeGreaterThan(0);
    expect(spans[0].textContent).toBe("👍");
  });

  test("spawned emoji span has animation style", () => {
    const { messageHandler } = loadContent();

    messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());

    const overlay = document.getElementById("speechwave-overlay");
    const span = overlay.querySelector("span");
    expect(span.style.animation).toContain("speechwaveFloat");
  });

  test("emoji span is positioned at bottom of overlay", () => {
    const { messageHandler } = loadContent();

    messageHandler({ type: "RENDER_EMOJI", emoji: "🙋" }, {}, jest.fn());

    const span = document.getElementById("speechwave-overlay").querySelector("span");
    expect(span.style.bottom).toBe("0px");
  });

  test("multiple emojis each produce their own span", () => {
    const { messageHandler } = loadContent();

    messageHandler({ type: "RENDER_EMOJI", emoji: "👍" }, {}, jest.fn());
    messageHandler({ type: "RENDER_EMOJI", emoji: "❤️" }, {}, jest.fn());
    messageHandler({ type: "RENDER_EMOJI", emoji: "😂" }, {}, jest.fn());

    const spans = document
      .getElementById("speechwave-overlay")
      .querySelectorAll("span");
    expect(spans.length).toBe(3);
  });
});

describe("slide observer", () => {
  test("sends SLIDE_CHANGED to service worker when adapter reports slide > 0", () => {
    const mockAdapter = { getSlide: jest.fn().mockReturnValue(3) };
    window.SpeechwaveAdapterRegistry = {
      getAdapter: jest.fn().mockReturnValue(mockAdapter),
    };

    chrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
      if (callback) callback();
    });
    chrome.runtime.onMessage.addListener.mockImplementation(() => {});

    // eslint-disable-next-line no-eval
    eval(CONTENT_JS);

    const slideChangedCall = chrome.runtime.sendMessage.mock.calls.find(
      ([msg]) => msg.type === "SLIDE_CHANGED"
    );
    expect(slideChangedCall).toBeDefined();
    expect(slideChangedCall[0]).toMatchObject({ type: "SLIDE_CHANGED", slide: 3 });
  });

  test("does not send SLIDE_CHANGED when adapter returns 0", () => {
    const mockAdapter = { getSlide: jest.fn().mockReturnValue(0) };
    window.SpeechwaveAdapterRegistry = {
      getAdapter: jest.fn().mockReturnValue(mockAdapter),
    };

    chrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
      if (callback) callback();
    });
    chrome.runtime.onMessage.addListener.mockImplementation(() => {});

    // eslint-disable-next-line no-eval
    eval(CONTENT_JS);

    const slideChangedCall = chrome.runtime.sendMessage.mock.calls.find(
      ([msg]) => msg.type === "SLIDE_CHANGED"
    );
    expect(slideChangedCall).toBeUndefined();
  });

  test("skips slide observation when no adapter registry is present", () => {
    delete window.SpeechwaveAdapterRegistry;
    const { messageHandler } = loadContent();

    const slideChangedCalls = chrome.runtime.sendMessage.mock.calls.filter(
      ([msg]) => msg.type === "SLIDE_CHANGED"
    );
    expect(slideChangedCalls).toHaveLength(0);
    // messageHandler still available for emoji rendering
    expect(messageHandler).toBeDefined();
  });
});
