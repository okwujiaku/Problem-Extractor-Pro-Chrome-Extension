/* Popup logic for Problem Extractor Pro. */

const API_BASE_URL = "https://problem-extractor-pro-chrome-extens.vercel.app/api";
const FREE_LIMIT = 3;
const HISTORY_LIMIT = 5;

// Cache DOM nodes for quick UI updates.
const elements = {
  extractBtn: document.getElementById("extractBtn"),
  statusText: document.getElementById("statusText"),
  results: document.getElementById("results"),
  usageStatus: document.getElementById("usageStatus"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  exportMdBtn: document.getElementById("exportMdBtn"),
  historyList: document.getElementById("historyList")
};

// Update status banner text.
function setStatus(message) {
  elements.statusText.textContent = message;
}

// Retrieve or create a stable anonymous user id.
async function getUserId() {
  const stored = await chrome.storage.sync.get(["pep_user_id"]);
  if (stored.pep_user_id) {
    return stored.pep_user_id;
  }
  const newId = `pep_${crypto.randomUUID()}`;
  await chrome.storage.sync.set({ pep_user_id: newId });
  return newId;
}

// Ask the backend for usage limits and paid status.
async function fetchStatus(userId) {
  try {
    const response = await fetch(`${API_BASE_URL}/status?userId=${encodeURIComponent(userId)}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "Status unavailable.");
    }
    return data;
  } catch (error) {
    return {
      ok: false,
      isPaid: false,
      remaining: 0,
      usage: 0,
      message: error?.message || "Status unavailable."
    };
  }
}

// Display the current usage tier and remaining free uses.
function updateUsageDisplay(status) {
  if (!status || !status.ok) {
    elements.usageStatus.textContent = "Usage: unavailable";
    return;
  }
  const label = status.isPaid
    ? "Paid: unlimited"
    : `Free trials: ${status.remaining} of ${FREE_LIMIT} left`;
  elements.usageStatus.textContent = label;
}

// Render problems, evidence, and ideas in the popup.
function renderResults(payload) {
  elements.results.innerHTML = "";
  if (!payload?.problems?.length) {
    elements.results.innerHTML = "<p>No problems found. Try another thread.</p>";
    return;
  }

  payload.problems.forEach((problem, index) => {
    const card = document.createElement("div");
    card.className = "problem-card";

    const title = document.createElement("h3");
    title.textContent = problem.statement || `Problem ${index + 1}`;
    card.appendChild(title);

    const badge = document.createElement("div");
    badge.className = "pill";
    badge.textContent = `Problem ${index + 1}`;
    card.appendChild(badge);

    (problem.evidence || []).forEach((quote) => {
      const quoteEl = document.createElement("div");
      quoteEl.className = "quote";
      quoteEl.textContent = `"${quote}"`;
      card.appendChild(quoteEl);
    });

    const ideasHeader = document.createElement("div");
    ideasHeader.textContent = "Startup ideas:";
    ideasHeader.style.fontSize = "12px";
    ideasHeader.style.marginTop = "6px";
    card.appendChild(ideasHeader);

    const ideasList = document.createElement("ul");
    ideasList.className = "ideas";
    (problem.ideas || []).forEach((idea) => {
      const li = document.createElement("li");
      li.className = "idea-item";

      const ideaText = document.createElement("span");
      ideaText.textContent = idea;
      li.appendChild(ideaText);

      const ideaCopyBtn = document.createElement("button");
      ideaCopyBtn.className = "secondary copy-btn";
      ideaCopyBtn.textContent = "Copy";
      ideaCopyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(idea);
        ideaCopyBtn.textContent = "Copied!";
        setTimeout(() => {
          ideaCopyBtn.textContent = "Copy";
        }, 1200);
      });
      li.appendChild(ideaCopyBtn);

      ideasList.appendChild(li);
    });
    card.appendChild(ideasList);

    const statementCopyBtn = document.createElement("button");
    statementCopyBtn.className = "secondary copy-btn";
    statementCopyBtn.textContent = "Copy statement";
    statementCopyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(problem.statement || "");
      statementCopyBtn.textContent = "Copied!";
      setTimeout(() => {
        statementCopyBtn.textContent = "Copy statement";
      }, 1200);
    });
    card.appendChild(statementCopyBtn);

    const copyBtn = document.createElement("button");
    copyBtn.className = "secondary copy-btn";
    copyBtn.textContent = "Copy problem + ideas";
    copyBtn.addEventListener("click", () => {
      const text = `${problem.statement}\n\nEvidence:\n- ${(problem.evidence || []).join("\n- ")}\n\nIdeas:\n- ${(problem.ideas || []).join("\n- ")}`;
      navigator.clipboard.writeText(text);
      copyBtn.textContent = "Copied!";
      setTimeout(() => {
        copyBtn.textContent = "Copy problem + ideas";
      }, 1200);
    });
    card.appendChild(copyBtn);

    elements.results.appendChild(card);
  });
}

// Convert problems into a CSV string for export.
function buildCsv(problems) {
  const rows = [["Problem", "Evidence", "Ideas"]];
  problems.forEach((problem) => {
    rows.push([
      problem.statement || "",
      (problem.evidence || []).join(" | "),
      (problem.ideas || []).join(" | ")
    ]);
  });
  return rows
    .map((row) => row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

// Convert problems into Markdown for export.
function buildMarkdown(problems) {
  return problems
    .map((problem, index) => {
      const evidence = (problem.evidence || []).map((q) => `- "${q}"`).join("\n");
      const ideas = (problem.ideas || []).map((idea) => `- ${idea}`).join("\n");
      return `## Problem ${index + 1}\n\n**Statement:** ${problem.statement}\n\n**Evidence:**\n${evidence}\n\n**Startup Ideas:**\n${ideas}`;
    })
    .join("\n\n");
}

// Trigger file download in the popup.
function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// Enable export buttons and bind export handlers.
function enableExports(problems) {
  elements.exportCsvBtn.disabled = !problems?.length;
  elements.exportMdBtn.disabled = !problems?.length;

  elements.exportCsvBtn.onclick = () => {
    downloadFile("problem-extractor-pro.csv", buildCsv(problems), "text/csv");
  };
  elements.exportMdBtn.onclick = () => {
    downloadFile("problem-extractor-pro.md", buildMarkdown(problems), "text/markdown");
  };
}

// Render recent extraction history from local storage.
async function renderHistory() {
  const stored = await chrome.storage.local.get(["pep_history"]);
  const history = stored.pep_history || [];
  elements.historyList.innerHTML = "";
  history.slice(0, HISTORY_LIMIT).forEach((entry) => {
    const li = document.createElement("li");
    const time = new Date(entry.timestamp).toLocaleString();
    li.textContent = `${time} • ${entry.problemCount} problems`;
    elements.historyList.appendChild(li);
  });
}

// Full flow: extract Reddit text, call backend, and render results.
async function runExtraction() {
  elements.extractBtn.disabled = true;
  setStatus("Extracting and analyzing...");
  elements.results.innerHTML = "";

  try {
    const userId = await getUserId();
    const status = await fetchStatus(userId);
    updateUsageDisplay(status);

    if (!status.ok || (!status.isPaid && status.remaining <= 0)) {
      setStatus(status.message || "Free limit reached. Upgrade to continue.");
      elements.extractBtn.disabled = false;
      return;
    }

    const extraction = await chrome.runtime.sendMessage({ type: "pep_start_extraction" });
    if (!extraction?.ok) {
      throw new Error(extraction?.error || "Extraction failed.");
    }

    if (!extraction.payload?.extractedText) {
      throw new Error("No Reddit text found. Open a subreddit or thread.");
    }

    const response = await fetch(`${API_BASE_URL}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(extraction.payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || "Analysis failed.");
    }

    renderResults(data);
    enableExports(data.problems || []);
    updateUsageDisplay({
      ok: true,
      isPaid: data.isPaid,
      remaining: data.remaining,
      usage: data.usage
    });

    await chrome.runtime.sendMessage({
      type: "pep_save_history",
      entry: {
        timestamp: Date.now(),
        problemCount: data.problems?.length || 0
      }
    });

    await renderHistory();
    setStatus("Done.");
  } catch (error) {
    setStatus(error?.message || "Something went wrong.");
  } finally {
    elements.extractBtn.disabled = false;
  }
}

// Initial popup load: get user id, status, and history.
async function init() {
  const userId = await getUserId();
  const status = await fetchStatus(userId);
  updateUsageDisplay(status);
  await renderHistory();
}

elements.extractBtn.addEventListener("click", runExtraction);
init();
