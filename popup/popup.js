const DEV_MODE = false; // set to true locally for testing

// --- DOM references ---
const setupSection = document.getElementById("setup-section");
const mainSection = document.getElementById("main-section");
const apiKeyInput = document.getElementById("api-key-input");
const saveApiKeyBtn = document.getElementById("save-api-key-btn");

const slugInput = document.getElementById("slug-input");
const connectBtn = document.getElementById("connect-btn");
const dot = document.getElementById("dot");
const statusText = document.getElementById("status-text");
const sessionSection = document.getElementById("session-section");
const sessionStatus = document.getElementById("session-status");
const sessionBtn = document.getElementById("session-btn");
const slideIndicator = document.getElementById("slide-indicator");
const fireworksToggle = document.getElementById("fireworks-toggle");
const testFireworksBtn = document.getElementById("test-fireworks-btn");
const errorMsg = document.getElementById("error-msg");
const cancelSetup = document.getElementById("cancel-setup");

let currentSessionId = null;
let storedApiKey = null;

function setError(msg) {
  if (msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = "block";
  } else {
    errorMsg.textContent = "";
    errorMsg.style.display = "none";
  }
}

function showSetup() {
  setupSection.style.display = "block";
  mainSection.style.display = "none";
}

function showMain() {
  setupSection.style.display = "none";
  mainSection.style.display = "block";
}

function setStatus(connected) {
  dot.className = "dot" + (connected ? " connected" : "");
  statusText.textContent = connected ? "Connected" : "Disconnected";
  connectBtn.textContent = connected ? "Disconnect" : "Connect";
  sessionSection.style.display = connected ? "block" : "none";
}

function setSessionUI(active, label) {
  sessionStatus.textContent = active ? label : "No active session";
  sessionBtn.textContent = active ? "Stop Session" : "Start Session";
  sessionBtn.className = active ? "stop" : "";
}

function setSlideIndicator(slide) {
  slideIndicator.textContent = slide > 0 ? `Slide ${slide}` : "Slide —";
}

// --- API key setup ---
document.getElementById("change-api-key-link").addEventListener("click", (e) => {
  e.preventDefault();
  cancelSetup.style.display = "block";
  showSetup();
});

cancelSetup.querySelector("a").addEventListener("click", (e) => {
  e.preventDefault();
  cancelSetup.style.display = "none";
  showMain();
});

saveApiKeyBtn.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) return;
  chrome.storage.sync.set({ apiKey: key }, () => {
    storedApiKey = key;
    showMain();
    setError(null);
  });
});

// --- Fireworks ---
chrome.storage.sync.get({ fireworksEnabled: true }, ({ fireworksEnabled }) => {
  fireworksToggle.checked = fireworksEnabled;
});

fireworksToggle.addEventListener("change", () => {
  const enabled = fireworksToggle.checked;
  chrome.storage.sync.set({ fireworksEnabled: enabled });
  chrome.runtime.sendMessage({ type: "SET_FIREWORKS", enabled }, () => {
    void chrome.runtime.lastError;
  });
});

if (DEV_MODE) {
  testFireworksBtn.style.display = "block";
  testFireworksBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "TEST_FIREWORKS" }, () => {
      void chrome.runtime.lastError;
    });
  });
}

// --- Connect ---
connectBtn.addEventListener("click", () => {
  const slug = slugInput.value.trim();
  if (!slug || !storedApiKey) return;
  setError(null);
  chrome.runtime.sendMessage({ type: "SET_SLUG", slug, apiKey: storedApiKey }, (response) => {
    setStatus(response?.connected ?? false);
  });
});

// --- Session ---
sessionBtn.addEventListener("click", () => {
  setError(null);
  if (currentSessionId) {
    chrome.runtime.sendMessage({ type: "STOP_SESSION", sessionId: currentSessionId }, (response) => {
      if (response?.stopped) {
        currentSessionId = null;
        chrome.storage.local.remove("sessionId");
        setSessionUI(false);
      }
    });
  } else {
    chrome.runtime.sendMessage({ type: "START_SESSION" }, (response) => {
      if (response?.session_id) {
        currentSessionId = response.session_id;
        chrome.storage.local.set({ sessionId: response.session_id });
        setSessionUI(true, response.label);
      } else if (response?.error) {
        const messages = {
          session_limit_reached: "Monthly session limit reached",
          not_connected: "Not connected to a talk",
        };
        setError(messages[response.error] || "Could not start session");
      }
    });
  }
});

// --- Init ---
chrome.storage.sync.get(["apiKey"], ({ apiKey }) => {
  if (apiKey) {
    storedApiKey = apiKey;
    showMain();

    chrome.storage.local.get(["slug", "sessionId"], ({ slug, sessionId }) => {
      if (slug) slugInput.value = slug;
      if (sessionId) {
        currentSessionId = sessionId;
        setSessionUI(true, "Session active");
      }
    });

    chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
      setStatus(response?.connected ?? false);
      setSlideIndicator(response?.slide ?? 0);
    });
  } else {
    showSetup();
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SLIDE_CHANGED") {
    setSlideIndicator(msg.slide);
  } else if (msg.type === "CONNECT_ERROR") {
    const messages = {
      capacity_reached: "Talk is at capacity",
      unauthorized: "Invalid API key or you don't own this talk",
      email_not_confirmed: "Please confirm your email before using the extension",
      not_found: "Talk not found",
      key_updated: "Your API key was regenerated. Please update it in the extension.",
    };
    setError(messages[msg.reason] || "Connection failed");
    setStatus(false);
  }
});
