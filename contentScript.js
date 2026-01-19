/* Content script for Problem Extractor Pro. */

const MAX_TEXT_LENGTH = 20000;

// Confirm the current site is Reddit before extracting.
function isRedditPage() {
  return window.location.hostname.includes("reddit.com");
}

// Thread pages are typically /comments/ URLs.
function isThreadPage() {
  return /\/comments\//.test(window.location.pathname);
}

// Subreddit pages follow /r/{name} patterns.
function isSubredditPage() {
  return /^\/r\/[^/]+\/?$/.test(window.location.pathname);
}

// Only capture visible text to avoid hidden UI noise.
function isVisible(element) {
  if (!element) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

// Filter likely non-content UI regions or ads.
function isUiNoise(element) {
  if (!element) return true;
  const tag = element.tagName?.toLowerCase() || "";
  if (["nav", "aside", "header", "footer", "button"].includes(tag)) return true;
  if (element.getAttribute("role") === "navigation") return true;
  const className = element.className?.toString().toLowerCase() || "";
  if (className.includes("ad") || className.includes("promoted")) return true;
  if (className.includes("share") || className.includes("award")) return true;
  return false;
}

// Collect text from a selector with optional count limit.
function extractTextFromSelector(selector, limit) {
  const nodes = Array.from(document.querySelectorAll(selector));
  const texts = [];
  for (const node of nodes) {
    if (!isVisible(node) || isUiNoise(node)) continue;
    const text = node.innerText?.trim();
    if (text) {
      texts.push(text);
      if (limit && texts.length >= limit) break;
    }
  }
  return texts;
}

// Build a clean payload with titles, bodies, and comments.
function buildRedditExtraction() {
  const titles = extractTextFromSelector("h1, h2, h3", 50);
  const bodies = extractTextFromSelector(
    "div[data-test-id='post-content'], div[data-adclicklocation='title']",
    50
  );
  const comments = extractTextFromSelector(
    "div[data-test-id='comment'], shreddit-comment, div.Comment",
    100
  );

  const rawParts = [
    "POST TITLES:\n" + titles.join("\n"),
    "POST BODIES:\n" + bodies.join("\n"),
    "TOP COMMENTS:\n" + comments.join("\n")
  ];

  const cleanText = rawParts.join("\n\n").slice(0, MAX_TEXT_LENGTH);

  return {
    cleanText,
    meta: {
      pageType: isThreadPage() ? "thread" : isSubredditPage() ? "subreddit" : "other",
      titleCount: titles.length,
      bodyCount: bodies.length,
      commentCount: comments.length
    }
  };
}

// Listen for extraction requests from the background service worker.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "pep_extract_reddit") {
    if (!isRedditPage()) {
      sendResponse({ cleanText: "", meta: { error: "Not a Reddit page." } });
      return false;
    }

    const payload = buildRedditExtraction();
    sendResponse(payload);
    return false;
  }
  return false;
});
