const DEV_MODE = true; // set to true locally for testing

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

let currentSessionId = null;

chrome.storage.local.get(["slug", "sessionId"], ({ slug, sessionId }) => {
  if (slug) slugInput.value = slug;
  if (sessionId) {
    currentSessionId = sessionId;
    setSessionUI(true, "Session active");
  }
});

chrome.storage.sync.get({ fireworksEnabled: true }, ({ fireworksEnabled }) => {
  fireworksToggle.checked = fireworksEnabled;
});

fireworksToggle.addEventListener("change", () => {
  const enabled = fireworksToggle.checked;
  chrome.storage.sync.set({ fireworksEnabled: enabled });
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { type: "SET_FIREWORKS", enabled }, () => {
      void chrome.runtime.lastError;
    });
  });
});

if (DEV_MODE) {
  testFireworksBtn.style.display = "block";
  testFireworksBtn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      chrome.tabs.sendMessage(tab.id, { type: "TEST_FIREWORKS" }, () => {
        void chrome.runtime.lastError;
      });
    });
  });
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

connectBtn.addEventListener("click", () => {
  const slug = slugInput.value.trim();
  if (!slug) return;

  chrome.storage.local.set({ slug });

  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, { type: "SET_SLUG", slug }, (response) => {
      setStatus(response?.connected ?? false);
    });
  });
});

sessionBtn.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (currentSessionId) {
      chrome.tabs.sendMessage(
        tab.id,
        { type: "STOP_SESSION", sessionId: currentSessionId },
        (response) => {
          if (response?.stopped) {
            currentSessionId = null;
            chrome.storage.local.remove("sessionId");
            setSessionUI(false);
          }
        }
      );
    } else {
      chrome.tabs.sendMessage(tab.id, { type: "START_SESSION" }, (response) => {
        if (response?.session_id) {
          currentSessionId = response.session_id;
          chrome.storage.local.set({ sessionId: response.session_id });
          setSessionUI(true, response.label);
        }
      });
    }
  });
});

// Check current status on popup open
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  chrome.tabs.sendMessage(tab.id, { type: "GET_STATUS" }, (response) => {
    setStatus(response?.connected ?? false);
    setSlideIndicator(response?.slide ?? 0);
  });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "SLIDE_CHANGED") {
    setSlideIndicator(msg.slide);
  }
});
