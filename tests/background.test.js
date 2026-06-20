const fs = require("fs");
const path = require("path");

const BACKGROUND_JS = fs.readFileSync(
  path.join(__dirname, "../background/background.js"),
  "utf8"
);

// --- Mock Phoenix Socket ---

let mockSocket = null;
let mockChannel = null;

class MockChannel {
  constructor() {
    this.onHandlers = {};
    this.joinReceiveHandlers = {};
    this._pushReceiveHandlers = {};
    this._lastPush = null;
    this._closeHandler = null;
    mockChannel = this;
  }

  on(event, handler) {
    this.onHandlers[event] = handler;
    return this;
  }

  join() {
    const self = this;
    const chain = {
      receive(status, handler) {
        self.joinReceiveHandlers[status] = handler;
        return chain;
      },
    };
    return chain;
  }

  push(event, payload) {
    this._lastPush = { event, payload };
    const self = this;
    const chain = {
      receive(status, handler) {
        self._pushReceiveHandlers[`${event}:${status}`] = handler;
        return chain;
      },
    };
    return chain;
  }

  onClose(handler) {
    this._closeHandler = handler;
  }
}

class MockSocket {
  constructor(_url, _opts) {
    this._connected = false;
    mockSocket = this;
  }

  onError(_handler) {}
  connect() {
    this._connected = true;
  }
  disconnect() {
    this._connected = false;
  }
  isConnected() {
    return this._connected;
  }
  channel(_topic, _params) {
    return new MockChannel();
  }
}

// --- Load helper ---

function loadBackground({ slug = null, apiKey = null } = {}) {
  global.importScripts = jest.fn();
  global.Phoenix = { Socket: MockSocket };

  chrome.storage.local.get.mockImplementation((_key, callback) => {
    callback(slug ? { slug } : {});
  });
  chrome.storage.sync.get.mockImplementation((_key, callback) => {
    callback(apiKey ? { apiKey } : {});
  });

  let messageHandler;
  chrome.runtime.onMessage.addListener.mockImplementation((handler) => {
    messageHandler = handler;
  });

  // eslint-disable-next-line no-eval
  eval(BACKGROUND_JS);

  return { messageHandler };
}

beforeEach(() => {
  jest.resetAllMocks();
  mockSocket = null;
  mockChannel = null;
});

// ---------------------------------------------------------------------------
// GET_STATUS
// ---------------------------------------------------------------------------

describe("GET_STATUS", () => {
  test("returns connected: false and slide 0 when no socket exists", () => {
    const { messageHandler } = loadBackground();
    const sendResponse = jest.fn();

    messageHandler({ type: "GET_STATUS" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ connected: false, slide: 0 });
  });

  test("returns connected: true after SET_SLUG initiates a connection", () => {
    const { messageHandler } = loadBackground();

    messageHandler({ type: "SET_SLUG", slug: "my-talk", apiKey: "key" }, {}, jest.fn());

    const sendResponse = jest.fn();
    messageHandler({ type: "GET_STATUS" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ connected: true, slide: 0 });
  });
});

// ---------------------------------------------------------------------------
// SET_SLUG
// ---------------------------------------------------------------------------

describe("SET_SLUG", () => {
  test("saves slug to local storage", () => {
    const { messageHandler } = loadBackground();

    messageHandler({ type: "SET_SLUG", slug: "my-talk", apiKey: "key" }, {}, jest.fn());

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ slug: "my-talk" });
  });

  test("responds optimistically with connected: true", () => {
    const { messageHandler } = loadBackground();
    const sendResponse = jest.fn();

    messageHandler({ type: "SET_SLUG", slug: "my-talk", apiKey: "key" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ connected: true });
  });

  test("creates a Phoenix socket and connects", () => {
    const { messageHandler } = loadBackground();

    messageHandler({ type: "SET_SLUG", slug: "my-talk", apiKey: "key" }, {}, jest.fn());

    expect(mockSocket).not.toBeNull();
    expect(mockSocket.isConnected()).toBe(true);
  });

  test("joins channel for the given slug", () => {
    const { messageHandler } = loadBackground();

    messageHandler({ type: "SET_SLUG", slug: "cool-talk", apiKey: "key" }, {}, jest.fn());

    expect(mockChannel).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SLIDE_CHANGED
// ---------------------------------------------------------------------------

describe("SLIDE_CHANGED", () => {
  test("stores the slide number", () => {
    const { messageHandler } = loadBackground();

    messageHandler({ type: "SLIDE_CHANGED", slide: 5 }, {}, jest.fn());

    const sendResponse = jest.fn();
    messageHandler({ type: "GET_STATUS" }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ connected: false, slide: 5 });
  });

  test("notifies popup with SLIDE_CHANGED", () => {
    const { messageHandler } = loadBackground();

    chrome.runtime.sendMessage.mockImplementation((_msg, callback) => {
      if (callback) callback();
    });

    messageHandler({ type: "SLIDE_CHANGED", slide: 3 }, {}, jest.fn());

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: "SLIDE_CHANGED", slide: 3 },
      expect.any(Function)
    );
  });

  test("pushes slide_changed to channel when connected", () => {
    const { messageHandler } = loadBackground();

    messageHandler({ type: "SET_SLUG", slug: "talk", apiKey: "key" }, {}, jest.fn());
    messageHandler({ type: "SLIDE_CHANGED", slide: 9 }, {}, jest.fn());

    expect(mockChannel._lastPush).toMatchObject({
      event: "slide_changed",
      payload: { slide: 9 },
    });
  });

  test("skips channel push when not connected", () => {
    const { messageHandler } = loadBackground();

    messageHandler({ type: "SLIDE_CHANGED", slide: 4 }, {}, jest.fn());

    // mockChannel is null because SET_SLUG was never called
    expect(mockChannel).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SET_FIREWORKS
// ---------------------------------------------------------------------------

describe("SET_FIREWORKS", () => {
  test("queries Google Slides tabs and broadcasts to each", () => {
    const { messageHandler } = loadBackground();

    chrome.tabs.query.mockImplementation((_query, callback) => {
      callback([{ id: 1 }, { id: 2 }]);
    });

    messageHandler({ type: "SET_FIREWORKS", enabled: true }, {}, jest.fn());

    expect(chrome.tabs.query).toHaveBeenCalledWith(
      { url: "https://docs.google.com/presentation/*" },
      expect.any(Function)
    );
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      { type: "SET_FIREWORKS", enabled: true },
      expect.any(Function)
    );
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      2,
      { type: "SET_FIREWORKS", enabled: true },
      expect.any(Function)
    );
  });

  test("broadcasts enabled: false to Slides tabs", () => {
    const { messageHandler } = loadBackground();

    chrome.tabs.query.mockImplementation((_query, callback) => {
      callback([{ id: 7 }]);
    });

    messageHandler({ type: "SET_FIREWORKS", enabled: false }, {}, jest.fn());

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      7,
      { type: "SET_FIREWORKS", enabled: false },
      expect.any(Function)
    );
  });
});

// ---------------------------------------------------------------------------
// TEST_FIREWORKS
// ---------------------------------------------------------------------------

describe("TEST_FIREWORKS", () => {
  test("queries Google Slides tabs and sends TEST_FIREWORKS to each", () => {
    const { messageHandler } = loadBackground();

    chrome.tabs.query.mockImplementation((_query, callback) => {
      callback([{ id: 10 }, { id: 11 }]);
    });

    messageHandler({ type: "TEST_FIREWORKS" }, {}, jest.fn());

    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      10,
      { type: "TEST_FIREWORKS" },
      expect.any(Function)
    );
  });
});

// ---------------------------------------------------------------------------
// START_SESSION / STOP_SESSION
// ---------------------------------------------------------------------------

describe("START_SESSION", () => {
  test("returns not_connected error when no channel exists", () => {
    const { messageHandler } = loadBackground();
    const sendResponse = jest.fn();

    messageHandler({ type: "START_SESSION" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ error: "not_connected" });
  });

  test("pushes start_session to channel when connected", () => {
    const { messageHandler } = loadBackground();

    messageHandler({ type: "SET_SLUG", slug: "talk", apiKey: "key" }, {}, jest.fn());

    const sendResponse = jest.fn();
    messageHandler({ type: "START_SESSION" }, {}, sendResponse);

    expect(mockChannel._lastPush).toMatchObject({ event: "start_session" });
  });
});

describe("STOP_SESSION", () => {
  test("returns not_connected error when no channel exists", () => {
    const { messageHandler } = loadBackground();
    const sendResponse = jest.fn();

    messageHandler({ type: "STOP_SESSION", sessionId: "abc" }, {}, sendResponse);

    expect(sendResponse).toHaveBeenCalledWith({ error: "not_connected" });
  });

  test("pushes stop_session with sessionId to channel when connected", () => {
    const { messageHandler } = loadBackground();

    messageHandler({ type: "SET_SLUG", slug: "talk", apiKey: "key" }, {}, jest.fn());

    messageHandler({ type: "STOP_SESSION", sessionId: "session-1" }, {}, jest.fn());

    expect(mockChannel._lastPush).toMatchObject({
      event: "stop_session",
      payload: { session_id: "session-1" },
    });
  });
});

// ---------------------------------------------------------------------------
// Channel events
// ---------------------------------------------------------------------------

describe("new_reaction channel event", () => {
  test("broadcasts RENDER_EMOJI to Google Slides tabs", () => {
    const { messageHandler } = loadBackground();

    messageHandler({ type: "SET_SLUG", slug: "talk", apiKey: "key" }, {}, jest.fn());

    chrome.tabs.query.mockImplementation((_query, callback) => {
      callback([{ id: 42 }]);
    });

    mockChannel.onHandlers["new_reaction"]({ emoji: "👍" });

    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(
      42,
      { type: "RENDER_EMOJI", emoji: "👍" },
      expect.any(Function)
    );
  });
});

// ---------------------------------------------------------------------------
// Auto-reconnect on service worker startup
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Stale connection handler race condition
// ---------------------------------------------------------------------------

describe("stale connection handlers", () => {
  test("join error from a previous connect() does not kill the current connection", () => {
    const { messageHandler } = loadBackground();

    // First connect (e.g., auto-reconnect with old API key)
    messageHandler({ type: "SET_SLUG", slug: "talk", apiKey: "old-key" }, {}, jest.fn());
    const staleChannel = mockChannel;

    // Second connect before the first join completes (user entered new key)
    messageHandler({ type: "SET_SLUG", slug: "talk", apiKey: "new-key" }, {}, jest.fn());

    // Current connection should be alive
    const statusBefore = jest.fn();
    messageHandler({ type: "GET_STATUS" }, {}, statusBefore);
    expect(statusBefore).toHaveBeenCalledWith({ connected: true, slide: 0 });

    // Server responds to the FIRST join with "unauthorized" (old key is invalid).
    // This stale error handler must not disconnect the current (second) connection.
    staleChannel.joinReceiveHandlers["error"]({ reason: "unauthorized" });

    // Current connection should STILL be alive
    const statusAfter = jest.fn();
    messageHandler({ type: "GET_STATUS" }, {}, statusAfter);
    expect(statusAfter).toHaveBeenCalledWith({ connected: true, slide: 0 });
  });
});

// ---------------------------------------------------------------------------
// Auto-reconnect on service worker startup
// ---------------------------------------------------------------------------

describe("auto-reconnect on startup", () => {
  test("calls connect when slug and apiKey are found in storage", () => {
    loadBackground({ slug: "saved-talk", apiKey: "saved-key" });

    expect(mockSocket).not.toBeNull();
    expect(mockSocket.isConnected()).toBe(true);
  });

  test("does not connect when no slug in storage", () => {
    loadBackground({ slug: null, apiKey: "saved-key" });

    expect(mockSocket).toBeNull();
  });

  test("does not connect when slug exists but no apiKey", () => {
    loadBackground({ slug: "saved-talk", apiKey: null });

    expect(mockSocket).toBeNull();
  });
});
