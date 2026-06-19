const fs = require("fs");
const path = require("path");

const POPUP_HTML = `
  <div id="setup-section" style="display:none">
    <input id="api-key-input" type="text" />
    <button id="save-api-key-btn">Save Key</button>
  </div>
  <div id="main-section" style="display:none">
    <div id="dot"></div>
    <span id="status-text">Disconnected</span>
    <input id="slug-input" type="text" />
    <button id="connect-btn">Connect</button>
    <div id="error-msg" style="display:none"></div>
    <div id="session-section" style="display:none">
      <div id="slide-indicator">Slide —</div>
      <div id="session-status">No active session</div>
      <button id="session-btn">Start Session</button>
    </div>
    <input type="checkbox" id="fireworks-toggle" />
    <button id="test-fireworks-btn" style="display:none">Test</button>
    <a id="change-api-key-link" href="#">Change API key</a>
  </div>
`;

const POPUP_JS = fs.readFileSync(
  path.join(__dirname, "../popup/popup.js"),
  "utf8"
);

function loadPopup({ apiKey = null, localData = {} } = {}) {
  chrome.storage.sync.get.mockImplementation((keys, callback) => {
    if (Array.isArray(keys)) {
      callback(apiKey ? { apiKey } : {});
    } else {
      // { fireworksEnabled: true } call for fireworks toggle
      callback({ fireworksEnabled: true });
    }
  });

  chrome.storage.local.get.mockImplementation((_keys, callback) => {
    callback(localData);
  });

  chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
    if (callback && msg.type === "GET_STATUS") {
      callback({ connected: false, slide: 0 });
    }
  });

  let messageHandler;
  chrome.runtime.onMessage.addListener.mockImplementation((handler) => {
    messageHandler = handler;
  });

  // eslint-disable-next-line no-eval
  eval(POPUP_JS);

  return { messageHandler };
}

beforeEach(() => {
  document.body.innerHTML = POPUP_HTML;
  jest.resetAllMocks();
});

describe("initialization", () => {
  test("shows setup section when no API key is stored", () => {
    loadPopup({ apiKey: null });
    expect(document.getElementById("setup-section").style.display).toBe(
      "block"
    );
    expect(document.getElementById("main-section").style.display).toBe("none");
  });

  test("shows main section when API key exists", () => {
    loadPopup({ apiKey: "test-key" });
    expect(document.getElementById("main-section").style.display).toBe(
      "block"
    );
    expect(document.getElementById("setup-section").style.display).toBe(
      "none"
    );
  });

  test("restores slug from local storage when API key exists", () => {
    loadPopup({ apiKey: "test-key", localData: { slug: "my-talk" } });
    expect(document.getElementById("slug-input").value).toBe("my-talk");
  });
});

describe("saving API key", () => {
  test("saves key to sync storage and transitions to main section", () => {
    loadPopup({ apiKey: null });
    document.getElementById("api-key-input").value = "new-api-key";

    chrome.storage.sync.set.mockImplementation((_data, callback) => {
      callback();
    });

    document.getElementById("save-api-key-btn").click();

    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      { apiKey: "new-api-key" },
      expect.any(Function)
    );
    expect(document.getElementById("main-section").style.display).toBe(
      "block"
    );
    expect(document.getElementById("setup-section").style.display).toBe(
      "none"
    );
  });

  test("does not save when input is empty", () => {
    loadPopup({ apiKey: null });
    document.getElementById("api-key-input").value = "";
    document.getElementById("save-api-key-btn").click();
    expect(chrome.storage.sync.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: expect.anything() }),
      expect.any(Function)
    );
  });
});

describe("connect button", () => {
  test("sends SET_SLUG with slug and stored API key", () => {
    loadPopup({ apiKey: "stored-key" });
    document.getElementById("slug-input").value = "my-talk";

    chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
      if (msg.type === "SET_SLUG" && callback) callback({ connected: true });
      if (msg.type === "GET_STATUS" && callback)
        callback({ connected: false, slide: 0 });
    });

    document.getElementById("connect-btn").click();

    const setSlugCall = chrome.runtime.sendMessage.mock.calls.find(
      ([msg]) => msg.type === "SET_SLUG"
    );
    expect(setSlugCall).toBeDefined();
    expect(setSlugCall[0]).toMatchObject({
      type: "SET_SLUG",
      slug: "my-talk",
      apiKey: "stored-key",
    });
  });

  test("updates status text on successful connect", () => {
    loadPopup({ apiKey: "stored-key" });
    document.getElementById("slug-input").value = "my-talk";

    chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
      if (callback) callback(msg.type === "SET_SLUG" ? { connected: true } : { connected: false, slide: 0 });
    });

    document.getElementById("connect-btn").click();

    expect(document.getElementById("status-text").textContent).toBe(
      "Connected"
    );
  });

  test("does nothing when slug is empty", () => {
    loadPopup({ apiKey: "stored-key" });
    document.getElementById("slug-input").value = "";
    document.getElementById("connect-btn").click();

    const setSlugCall = chrome.runtime.sendMessage.mock.calls.find(
      ([msg]) => msg.type === "SET_SLUG"
    );
    expect(setSlugCall).toBeUndefined();
  });
});

describe("session management", () => {
  test("START_SESSION shows error when not connected", () => {
    loadPopup({ apiKey: "key" });

    chrome.runtime.sendMessage.mockImplementation((msg, callback) => {
      if (msg.type === "START_SESSION" && callback)
        callback({ error: "not_connected" });
      if (msg.type === "GET_STATUS" && callback)
        callback({ connected: false, slide: 0 });
    });

    document.getElementById("session-btn").click();

    expect(document.getElementById("error-msg").textContent).toBe(
      "Not connected to a talk"
    );
  });
});

describe("incoming messages", () => {
  test("CONNECT_ERROR shows error message and sets disconnected status", () => {
    const { messageHandler } = loadPopup({ apiKey: "key" });

    messageHandler({ type: "CONNECT_ERROR", reason: "unauthorized" });

    expect(document.getElementById("error-msg").textContent).toBe(
      "Invalid API key or you don't own this talk"
    );
    expect(document.getElementById("status-text").textContent).toBe(
      "Disconnected"
    );
  });

  test("CONNECT_ERROR with unknown reason shows generic message", () => {
    const { messageHandler } = loadPopup({ apiKey: "key" });

    messageHandler({ type: "CONNECT_ERROR", reason: "something_weird" });

    expect(document.getElementById("error-msg").textContent).toBe(
      "Connection failed"
    );
  });

  test("SLIDE_CHANGED updates slide indicator", () => {
    const { messageHandler } = loadPopup({ apiKey: "key" });

    messageHandler({ type: "SLIDE_CHANGED", slide: 7 });

    expect(document.getElementById("slide-indicator").textContent).toBe(
      "Slide 7"
    );
  });

  test("SLIDE_CHANGED with slide 0 shows dash", () => {
    const { messageHandler } = loadPopup({ apiKey: "key" });

    messageHandler({ type: "SLIDE_CHANGED", slide: 0 });

    expect(document.getElementById("slide-indicator").textContent).toBe(
      "Slide —"
    );
  });
});

describe("change API key link", () => {
  test("shows setup section when clicked", () => {
    loadPopup({ apiKey: "existing-key" });

    document.getElementById("change-api-key-link").click();

    expect(document.getElementById("setup-section").style.display).toBe(
      "block"
    );
    expect(document.getElementById("main-section").style.display).toBe("none");
  });
});
