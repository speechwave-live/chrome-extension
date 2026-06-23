const fs = require("fs");
const path = require("path");

const CONTENT_JS = fs.readFileSync(
  path.join(__dirname, "../content/content.js"),
  "utf8"
);

function loadContent() {
  chrome.storage.sync.get.mockImplementation((_keys, callback) => {
    callback({ fireworksEnabled: false });
  });

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

describe("SET_FIREWORKS message", () => {
  test("accepts enabled: true without errors", () => {
    const { messageHandler } = loadContent();
    expect(() => {
      messageHandler({ type: "SET_FIREWORKS", enabled: true }, {}, jest.fn());
    }).not.toThrow();
  });

  test("accepts enabled: false without errors", () => {
    const { messageHandler } = loadContent();
    expect(() => {
      messageHandler({ type: "SET_FIREWORKS", enabled: false }, {}, jest.fn());
    }).not.toThrow();
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
