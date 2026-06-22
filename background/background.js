// Phoenix UMD build loaded via importScripts exposes the Phoenix global
importScripts('../lib/phoenix.js');

const { Socket } = Phoenix;

const DEV_MODE = false; // set to true locally for testing
const HOST = DEV_MODE ? "ws://localhost:4000" : "wss://speechwave.live";

// setTimeout caps its delay at 2^31-1 ms. Infinity/null coerce to 0 (immediate).
const MAX_TIMEOUT_MS = 2147483647;

// --- State ---
let socket = null;
let channel = null;
let currentSlide = 0;
let intentionalDisconnect = false;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(...args) {
  console.log('[Speechwave SW]', ...args);
}

function isConnected() {
  return socket !== null && socket.isConnected();
}

/**
 * Send a message to all open Google Slides presentation tabs.
 * Errors per-tab (e.g. no listener) are suppressed.
 */
function broadcastToSlidesTabs(msg) {
  chrome.tabs.query({ url: 'https://docs.google.com/presentation/*' }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, msg, () => {
        void chrome.runtime.lastError; // suppress "no listener" errors
      });
    }
  });
}

/**
 * Send a message to the popup. Suppresses errors when the popup is closed.
 */
function notifyPopup(msg) {
  chrome.runtime.sendMessage(msg, () => {
    void chrome.runtime.lastError;
  });
}

/**
 * Read slug + apiKey from storage and call connect() if both are present
 * and no connection is currently active.
 */
function reconnectFromStorage() {
  chrome.storage.local.get('slug', ({ slug }) => {
    if (slug) {
      chrome.storage.sync.get('apiKey', ({ apiKey }) => {
        if (apiKey && !isConnected()) connect(slug, apiKey);
      });
    }
  });
}

// ---------------------------------------------------------------------------
// connect()
// ---------------------------------------------------------------------------

function connect(slug, apiKey) {
  // Tear down any existing connection first
  if (socket) {
    intentionalDisconnect = true;
    socket.disconnect();
    socket = null;
    channel = null;
    currentSlide = 0;
  }

  // Phoenix Socket's built-in reconnect and channel rejoin are disabled.
  // Chrome MV3 can re-run module-level code without destroying the old JS
  // context, so Phoenix's internal timers create zombie sockets our code
  // can't reach. We handle reconnection ourselves via reconnectFromStorage().
  //
  // The logger and onError callbacks use an identity check (socket === s) to
  // suppress noise from zombie sockets. After a SW restart, the module-level
  // `socket` points to the new Socket; the old Socket's callbacks see the
  // mismatch and stay silent. Without this, heartbeat timeouts on zombie
  // sockets log alarming but harmless "error" and "reconnect" messages.
  const s = new Socket(`${HOST}/socket`, {
    logger: (kind, msg, data) => {
      if (socket === s) console.debug(`[Speechwave SW] ${kind}: ${msg}`, data);
    },
    reconnectAfterMs: () => MAX_TIMEOUT_MS,
    rejoinAfterMs: () => MAX_TIMEOUT_MS,
  });

  s.onError(() => {
    if (socket === s) {
      log('Socket error — scheduling reconnect');
      socket = null;
      channel = null;
      reconnectFromStorage();
    }
  });

  s.connect();

  const c = s.channel(`reactions:${slug}`, { api_key: apiKey });
  socket = s;
  channel = c;

  c.on('new_reaction', ({ emoji }) => {
    broadcastToSlidesTabs({ type: 'RENDER_EMOJI', emoji });
  });

  c.join()
    .receive('ok', () => {
      log(`Joined reactions:${slug}`);
    })
    .receive('error', ({ reason }) => {
      console.error(`[Speechwave SW] Channel join failed: ${reason}`);
      s.disconnect();
      if (socket === s) {
        socket = null;
        channel = null;
        notifyPopup({ type: 'CONNECT_ERROR', reason });
      }
    });

  c.onClose(() => {
    if (intentionalDisconnect) {
      intentionalDisconnect = false;
      return;
    }
    s.disconnect();
    if (socket === s) {
      socket = null;
      channel = null;
      notifyPopup({ type: 'CONNECT_ERROR', reason: 'key_updated' });
    }
  });
}

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'SET_SLUG') {
    // Persist the slug so we can reconnect after service worker restart
    chrome.storage.local.set({ slug: msg.slug });
    connect(msg.slug, msg.apiKey);
    sendResponse({ connected: true }); // optimistic

  } else if (msg.type === 'DISCONNECT') {
    if (socket) {
      intentionalDisconnect = true;
      socket.disconnect();
      socket = null;
      channel = null;
      currentSlide = 0;
    }
    chrome.storage.local.remove('slug');
    sendResponse({ connected: false });

  } else if (msg.type === 'GET_STATUS') {
    sendResponse({ connected: isConnected(), slide: currentSlide });

  } else if (msg.type === 'START_SESSION') {
    if (!channel) {
      sendResponse({ error: 'not_connected' });
      return;
    }
    channel
      .push('start_session', {})
      .receive('ok', ({ session_id, label }) => sendResponse({ session_id, label }))
      .receive('error', ({ reason }) => sendResponse({ error: reason }));
    return true; // keep the message channel open for the async reply

  } else if (msg.type === 'STOP_SESSION') {
    if (!channel) {
      sendResponse({ error: 'not_connected' });
      return;
    }
    channel
      .push('stop_session', { session_id: msg.sessionId })
      .receive('ok', () => sendResponse({ stopped: true }))
      .receive('error', ({ reason }) => sendResponse({ error: reason }));
    return true; // keep the message channel open for the async reply

  } else if (msg.type === 'SLIDE_CHANGED') {
    currentSlide = msg.slide;
    if (isConnected() && channel) {
      channel.push('slide_changed', { slide: currentSlide });
    }
    notifyPopup({ type: 'SLIDE_CHANGED', slide: currentSlide });
    // no sendResponse needed

  } else if (msg.type === 'SET_FIREWORKS') {
    broadcastToSlidesTabs({ type: 'SET_FIREWORKS', enabled: msg.enabled });
    // no sendResponse needed

  } else if (msg.type === 'TEST_FIREWORKS') {
    broadcastToSlidesTabs({ type: 'TEST_FIREWORKS' });
    // no sendResponse needed
  }
});

// ---------------------------------------------------------------------------
// Auto-reconnect on service worker startup / restart
// ---------------------------------------------------------------------------

reconnectFromStorage();
