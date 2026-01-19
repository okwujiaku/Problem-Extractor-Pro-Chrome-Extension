/* Backend API for Problem Extractor Pro. */

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

const FREE_LIMIT = Number(process.env.FREE_LIMIT || 3);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const PAID_USER_IDS = new Set(
  (process.env.PAID_USER_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

// In-memory usage tracking (replace with DB/Redis in production).
const usageStore = new Map();
// In-memory analytics for most frequent problems.
const analyticsStore = new Map();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Normalize Vercel /api prefix so routes work as /health, /status, /analyze.
app.use((req, _res, next) => {
  if (req.url === "/api") {
    req.url = "/";
  } else if (req.url.startsWith("/api/")) {
    req.url = req.url.replace("/api", "");
  }
  next();
});

// Get or create usage record for the user.
function getUsage(userId) {
  if (!usageStore.has(userId)) {
    usageStore.set(userId, { count: 0 });
  }
  return usageStore.get(userId);
}

// Paid users bypass limits.
function isPaidUser(userId) {
  return PAID_USER_IDS.has(userId);
}

// Check if the user can run another analysis.
function canAnalyze(userId) {
  if (isPaidUser(userId)) {
    return { allowed: true, remaining: Infinity };
  }
  const usage = getUsage(userId);
  const remaining = Math.max(FREE_LIMIT - usage.count, 0);
  return { allowed: remaining > 0, remaining };
}

// Increment usage only for free-tier users.
function incrementUsage(userId) {
  if (isPaidUser(userId)) return;
  const usage = getUsage(userId);
  usage.count += 1;
}

// Record analytics for most frequent problems.
function recordAnalytics(problems) {
  problems.forEach((problem) => {
    const key = (problem.statement || "").trim();
    if (!key) return;
    analyticsStore.set(key, (analyticsStore.get(key) || 0) + 1);
  });
}

// Build the AI prompt for complaint extraction.
function buildPrompt(text) {
  return `
You are an analyst extracting product pain points from Reddit.

Task:
1. Identify sentences showing frustration, complaints, or pain points.
2. Group similar complaints into clear problem statements.
3. Generate 3-5 actionable startup ideas per problem.
4. Include evidence quotes from the Reddit posts/comments.

Return JSON only with this schema:
{
  "problems": [
    {
      "statement": "string",
      "evidence": ["string", "..."],
      "ideas": ["string", "..."]
    }
  ]
}

Reddit text:
${text}
`.trim();
}

// Call OpenAI for structured JSON output.
async function analyzeWithOpenAI(text) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "You extract structured product problems from Reddit text." },
        { role: "user", content: buildPrompt(text) }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "OpenAI request failed.");
  }

  const raw = data?.choices?.[0]?.message?.content || "{}";
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error("Failed to parse AI response.");
  }
}

// Provide a mock response if no AI key is configured.
function buildMockAnalysis() {
  return {
    problems: [
      {
        statement: "People struggle to find reliable, summarized solutions in long Reddit threads.",
        evidence: [
          "I spent 30 minutes scrolling and still can't find a clear answer.",
          "Every comment says something different."
        ],
        ideas: [
          "Thread summarizer that highlights consensus answers.",
          "Browser extension that ranks comments by evidence.",
          "Q&A digest delivered daily for specific subreddits."
        ]
      },
      {
        statement: "Users are frustrated by outdated advice and broken links.",
        evidence: ["Most of these links are dead or from 2018."],
        ideas: [
          "Auto-checker for freshness of shared resources.",
          "Community tool to request updated alternatives.",
          "AI assistant that validates and updates recommendations."
        ]
      }
    ]
  };
}

// Health check for monitoring.
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Usage status endpoint used by the extension.
app.get("/status", (req, res) => {
  const userId = req.query.userId;
  if (!userId) {
    res.status(400).json({ ok: false, error: "Missing userId." });
    return;
  }
  const usage = getUsage(userId);
  const isPaid = isPaidUser(userId);
  const remaining = isPaid ? Infinity : Math.max(FREE_LIMIT - usage.count, 0);
  res.json({
    ok: true,
    isPaid,
    usage: usage.count,
    remaining,
    freeLimit: FREE_LIMIT,
    message: isPaid ? "Paid: unlimited." : `${remaining} free trials left.`
  });
});

// Analyze extracted Reddit text and enforce limits.
app.post("/analyze", async (req, res) => {
  const { userId, extractedText, url } = req.body || {};
  if (!userId) {
    res.status(400).json({ ok: false, error: "Missing userId." });
    return;
  }
  if (!extractedText || extractedText.length < 50) {
    res.status(400).json({ ok: false, error: "Not enough text to analyze." });
    return;
  }

  const status = canAnalyze(userId);
  if (!status.allowed) {
    res.status(402).json({
      ok: false,
      error: "Free limit reached. Upgrade to continue.",
      isPaid: false,
      remaining: status.remaining
    });
    return;
  }

  try {
    const analysis = OPENAI_API_KEY ? await analyzeWithOpenAI(extractedText) : buildMockAnalysis();
    incrementUsage(userId);
    recordAnalytics(analysis.problems || []);

    const usage = getUsage(userId);
    const isPaid = isPaidUser(userId);
    const remaining = isPaid ? Infinity : Math.max(FREE_LIMIT - usage.count, 0);

    res.json({
      ok: true,
      sourceUrl: url || "",
      problems: analysis.problems || [],
      isPaid,
      usage: usage.count,
      remaining
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error?.message || "Analysis failed." });
  }
});

// Optional analytics endpoint for most common problems.
app.get("/analytics", (_req, res) => {
  const top = Array.from(analyticsStore.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([statement, count]) => ({ statement, count }));
  res.json({ ok: true, top });
});

// Placeholder webhook for payment provider integrations.
app.post("/webhook/stripe", (req, res) => {
  // Placeholder for paid status updates.
  // In production, verify Stripe signature and update PAID_USER_IDS storage.
  res.json({ ok: true });
});

module.exports = app;
