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
  window.SpeechwaveFireworks = {
    checkFireworksTrigger: jest.fn((inFlight, emoji, options) => {
      const count = inFlight[emoji] || 0;
      const total = Object.values(inFlight).reduce((a, b) => a + b, 0);
      return count >= options.minCount && (count / total) >= options.minPercent;
    }),
  };
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

describe("overlay position relative to the presentation iframe", () => {
  function addPresentIframe(rect) {
    const iframe = document.createElement("iframe");
    iframe.className = "punch-present-iframe";
    iframe.getBoundingClientRect = jest.fn().mockReturnValue(rect);
    document.body.appendChild(iframe);
    return iframe;
  }

  // Google letterboxes the rendered slide within the iframe to preserve its
  // aspect ratio, so the iframe's own rect isn't the slide's visible rect.
  // The a11y element used for slide tracking happens to be sized/positioned
  // to match the visible slide exactly (confirmed via live inspection), so
  // we reuse it here instead of the iframe's outer bounds.
  function addPresentIframeWithSlide(iframeRect, slideRect) {
    const iframe = addPresentIframe(iframeRect);

    const innerDoc = document.implementation.createHTMLDocument("");
    const a11y = innerDoc.createElement("div");
    a11y.className = "punch-viewer-svgpage-a11yelement";
    a11y.setAttribute("aria-label", "Slide 1");
    a11y.getBoundingClientRect = jest.fn().mockReturnValue(slideRect);
    innerDoc.body.appendChild(a11y);

    Object.defineProperty(iframe, "contentDocument", {
      value: innerDoc,
      configurable: true,
    });

    return iframe;
  }

  test("falls back to a fixed viewport corner when no presentation iframe is present", () => {
    loadContent();
    const overlay = document.getElementById("speechwave-overlay");
    expect(overlay.style.right).toBe("20px");
    expect(overlay.style.bottom).toBe("20px");
    expect(overlay.style.left).toBe("");
    expect(overlay.style.top).toBe("");
  });

  // These use a slide width of 960 (the reference width — see SLIDE_REFERENCE_WIDTH
  // in content.js) so scale is exactly 1 and the position math stays simple.
  // Scaling itself is covered separately below.
  test("anchors to the presentation iframe's bottom-right corner when present at load", () => {
    addPresentIframe({ left: 40, top: 20, right: 1000, bottom: 620, width: 960, height: 600 });
    loadContent();

    const overlay = document.getElementById("speechwave-overlay");
    // right edge: 1000 - 160 (width) - 20 (margin) = 820
    expect(overlay.style.left).toBe("820px");
    // bottom edge: 620 - 200 (height) - 20 (margin) = 400
    expect(overlay.style.top).toBe("400px");
    expect(overlay.style.right).toBe("");
    expect(overlay.style.bottom).toBe("");
  });

  test("uses a maximum z-index when anchored to the presentation iframe", () => {
    addPresentIframe({ left: 0, top: 0, right: 960, bottom: 600, width: 960, height: 600 });
    loadContent();

    const overlay = document.getElementById("speechwave-overlay");
    expect(parseInt(overlay.style.zIndex, 10)).toBe(2147483647);
  });

  test("re-syncs position on the next spawn when the iframe appears after the overlay was created", () => {
    const { messageHandler } = loadContent();
    const overlay = document.getElementById("speechwave-overlay");
    expect(overlay.style.left).toBe("");

    addPresentIframe({ left: 0, top: 0, right: 960, bottom: 400, width: 960, height: 400 });
    messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());

    // left: 960 - 160 - 20 = 780; top: 400 - 200 - 20 = 180
    expect(overlay.style.left).toBe("780px");
    expect(overlay.style.top).toBe("180px");
  });

  test("anchors to the letterboxed slide's rect, not the iframe's outer rect, when Google renders black bars", () => {
    // A 960x1200 iframe letterboxing a 960x600 slide vertically centered
    // inside it (y offset 300 = (1200 - 600) / 2).
    addPresentIframeWithSlide(
      { left: 0, top: 0, right: 960, bottom: 1200, width: 960, height: 1200 },
      { left: 0, top: 300, right: 960, bottom: 900, width: 960, height: 600 }
    );
    loadContent();

    const overlay = document.getElementById("speechwave-overlay");
    // slide right/bottom in top-document coords: 0+960=960, 0+900=900
    // left: 960 - 160 (width) - 20 (margin) = 780; top: 900 - 200 (height) - 20 (margin) = 680
    expect(overlay.style.left).toBe("780px");
    expect(overlay.style.top).toBe("680px");
  });

  test("falls back to the iframe's own rect when no slide element is found inside it", () => {
    addPresentIframe({ left: 0, top: 0, right: 960, bottom: 600, width: 960, height: 600 });
    loadContent();

    const overlay = document.getElementById("speechwave-overlay");
    // left: 960 - 160 - 20 = 780; top: 600 - 200 - 20 = 380
    expect(overlay.style.left).toBe("780px");
    expect(overlay.style.top).toBe("380px");
  });
});

describe("overlay and emoji scale with the slide's rendered size", () => {
  function addPresentIframe(rect) {
    const iframe = document.createElement("iframe");
    iframe.className = "punch-present-iframe";
    iframe.getBoundingClientRect = jest.fn().mockReturnValue(rect);
    document.body.appendChild(iframe);
    return iframe;
  }

  test("shrinks overlay size, position, and margin when the slide renders at half the reference width", () => {
    // 480 is half of the 960 reference width -> scale 0.5. Margin scales
    // too, so the overlay covers roughly the same proportion of the slide
    // at any size, not just the same box in a fixed-size gap.
    addPresentIframe({ left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300 });
    loadContent();

    const overlay = document.getElementById("speechwave-overlay");
    expect(overlay.style.width).toBe("80px"); // 160 * 0.5
    expect(overlay.style.height).toBe("100px"); // 200 * 0.5
    // left: 480 - 80 - 10 (20 * 0.5) = 390; top: 300 - 100 - 10 (20 * 0.5) = 190
    expect(overlay.style.left).toBe("390px");
    expect(overlay.style.top).toBe("190px");
  });

  test("shrinks emoji font size to match a smaller slide", () => {
    addPresentIframe({ left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300 });
    const { messageHandler } = loadContent();

    messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());

    const span = document.getElementById("speechwave-overlay").querySelector("span");
    expect(span.style.fontSize).toBe("14px"); // 28 * 0.5
  });

  test("uses full size at the reference width", () => {
    addPresentIframe({ left: 0, top: 0, right: 960, bottom: 600, width: 960, height: 600 });
    const { messageHandler } = loadContent();

    messageHandler({ type: "RENDER_EMOJI", emoji: "🎉" }, {}, jest.fn());

    const overlay = document.getElementById("speechwave-overlay");
    const span = overlay.querySelector("span");
    expect(overlay.style.width).toBe("160px");
    expect(span.style.fontSize).toBe("28px");
  });

  test("clamps scale to a minimum so emoji don't vanish on a tiny slide", () => {
    // 96 / 960 = 0.1, below the minimum clamp
    addPresentIframe({ left: 0, top: 0, right: 96, bottom: 60, width: 96, height: 60 });
    loadContent();

    const overlay = document.getElementById("speechwave-overlay");
    expect(overlay.style.width).toBe("64px"); // 160 * 0.4 (MIN_OVERLAY_SCALE)
  });

  test("clamps scale to a maximum so emoji don't dominate an oversized slide", () => {
    // 4800 / 960 = 5, above the maximum clamp
    addPresentIframe({ left: 0, top: 0, right: 4800, bottom: 3000, width: 4800, height: 3000 });
    loadContent();

    const overlay = document.getElementById("speechwave-overlay");
    expect(overlay.style.width).toBe("320px"); // 160 * 2 (MAX_OVERLAY_SCALE)
  });

  test("scales fireworks' center point and font size with the slide", () => {
    addPresentIframe({ left: 0, top: 0, right: 480, bottom: 300, width: 480, height: 300 });
    const { messageHandler } = loadContent();

    messageHandler({ type: "TEST_FIREWORKS" }, {}, jest.fn());

    const span = document.getElementById("speechwave-overlay").querySelector("span");
    expect(span.style.left).toBe("40px"); // 80 * 0.5
    expect(span.style.top).toBe("50px"); // 100 * 0.5
    expect(span.style.fontSize).toBe("12px"); // 24 * 0.5
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
});

describe("RENDER_EMOJI message", () => {
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

    chrome.storage.sync.get.mockImplementation((_keys, callback) => {
      callback({ fireworksEnabled: false });
    });
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

    chrome.storage.sync.get.mockImplementation((_keys, callback) => {
      callback({ fireworksEnabled: false });
    });
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
