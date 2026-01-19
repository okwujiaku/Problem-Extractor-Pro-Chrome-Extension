/* Background service worker for Problem Extractor Pro. */

const STORAGE_KEYS = {
  userId: "pep_user_id",
  history: "pep_history"
};

const DEFAULT_HISTORY_LIMIT = 20;

// Generate a stable anonymous user id for usage tracking.
async function ensureUserId() {
  const stored = await chrome.storage.sync.get([STORAGE_KEYS.userId]);
  if (stored[STORAGE_KEYS.userId]) {
    return stored[STORAGE_KEYS.userId];
  }
  const newId = `pep_${crypto.randomUUID()}`;
  await chrome.storage.sync.set({ [STORAGE_KEYS.userId]: newId });
  return newId;
}

// Store a lightweight history entry for the user.
async function saveHistoryEntry(entry) {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.history]);
  const history = stored[STORAGE_KEYS.history] || [];
  history.unshift(entry);
  if (history.length > DEFAULT_HISTORY_LIMIT) {
    history.length = DEFAULT_HISTORY_LIMIT;
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history });
}

// Inject the content script and request extraction from the active tab.
async function extractFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    throw new Error("No active tab found.");
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["contentScript.js"]
  });

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: "pep_extract_reddit"
  });

  return { response, tab };
}

// Ensure a user id exists as soon as the extension is installed.
chrome.runtime.onInstalled.addListener(() => {
  void ensureUserId();
});

// Central message router for popup <-> background communication.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "pep_start_extraction") {
    (async () => {
      try {
        const userId = await ensureUserId();
        const { response, tab } = await extractFromActiveTab();
        const payload = {
          userId,
          url: tab?.url || "",
          extractedText: response?.cleanText || "",
          meta: response?.meta || {}
        };

        sendResponse({ ok: true, payload });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error?.message || "Extraction failed."
        });
      }
    })();

    return true;
  }

  if (message?.type === "pep_save_history") {
    (async () => {
      try {
        await saveHistoryEntry(message.entry);
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || "Save failed." });
      }
    })();
    return true;
  }

  sendResponse({ ok: false, error: "Unknown message." });
  return false;
});
