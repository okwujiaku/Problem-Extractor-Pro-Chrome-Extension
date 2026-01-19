# Problem Extractor Pro

Paid-ready MVP Chrome extension that extracts problems and startup ideas from Reddit threads or subreddits.

## Folder Structure
- `manifest.json`: Chrome extension manifest (MV3).
- `background.js`: Handles script injection, messaging, and history storage.
- `contentScript.js`: Extracts Reddit content from the active page.
- `popup.html`: Popup UI layout.
- `popup.css`: Popup UI styles.
- `popup.js`: Popup UI logic, API calls, exports.
- `backend/`: Node.js API server.
  - `index.js`: API endpoints, usage gating, AI pipeline.
  - `package.json`: Backend dependencies and scripts.
  - `env.example`: Environment variable template.

## How It Works (Simple English)
1. You click the extension button.
2. The popup button runs extraction on the current Reddit page.
3. The content script collects visible titles, bodies, and top comments.
4. Cleaned text is sent to the backend API.
5. The backend asks the AI to find complaints and ideas.
6. Results return to the popup with copy/export options.

## Local Setup

### 1) Backend
```
cd backend
npm install
```

Create a `.env` file in `backend/` based on `env.example`:
```
PORT=8787
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-4o-mini
FREE_LIMIT=3
PAID_USER_IDS=
```

Run the server:
```
npm start
```

### 2) Chrome Extension
1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the `ProblemExtractorPro` folder.
5. Visit a Reddit thread or subreddit.
6. Click the extension icon → **Extract Problems**.

## OpenAI API Key (Step-by-Step)
1. Go to `https://platform.openai.com/`.
2. Sign in or create an account.
3. Open the **API keys** page.
4. Click **Create new secret key**.
5. Copy the key and store it securely.
6. Add it to your backend `.env` as `OPENAI_API_KEY=...`.

## Deploy Backend to Vercel (Step-by-Step)
1. Push this project to GitHub (or GitLab).
2. Go to `https://vercel.com/new` and import the repo.
3. When asked for **Root Directory**, select `backend/`.
4. Framework preset: **Other**.
5. Build command: leave blank.
6. Output directory: leave blank.
7. Add Environment Variables:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional)
   - `FREE_LIMIT`
   - `PAID_USER_IDS`
8. Click **Deploy**.
9. Copy the deployed URL (e.g., `https://your-app.vercel.app`).
10. Update `API_BASE_URL` in `popup.js` to the Vercel URL and reload the extension.

## Vercel Notes
- Vercel uses `backend/api/index.js` as a serverless entry.
- Local dev still uses `backend/index.js` with `npm start`.

## Backend API

### `GET /status?userId=...`
Returns usage limits and paid status.

### `POST /analyze`
Body:
```
{
  "userId": "pep_xxx",
  "url": "https://reddit.com/...",
  "extractedText": "cleaned reddit text",
  "meta": { "pageType": "thread" }
}
```
Response:
```
{
  "ok": true,
  "problems": [
    {
      "statement": "string",
      "evidence": ["string"],
      "ideas": ["string"]
    }
  ],
  "isPaid": false,
  "usage": 1,
  "remaining": 2
}
```

### `GET /analytics`
Returns the most frequent problem statements (optional analytics).

## AI Prompt Example
```
You are an analyst extracting product pain points from Reddit.
1. Identify sentences showing frustration, complaints, or pain points.
2. Group similar complaints into clear problem statements.
3. Generate 3-5 actionable startup ideas per problem.
4. Include evidence quotes from the Reddit posts/comments.
Return JSON with: { problems: [{ statement, evidence, ideas }] }
```

## Paid Access Logic
- Free tier: 3 total trials (configurable with `FREE_LIMIT`).
- Paid tier: unlimited (set `PAID_USER_IDS` env var).
- The extension checks `/status` before analysis.
- `/analyze` enforces limits on the server.

### Suggested Pricing
- One-time: $15–$30
- Subscription: $7–$12/month

## Safe API Key Handling
- Store API keys only in the backend `.env`.
- The extension never sees the API key.
- For production, use a hosted backend and secure secrets (e.g., AWS Secrets Manager).

## Extending to Other Platforms
The content script is modular. Add new extraction functions and detection logic for:
- Quora
- IndieHackers
- X/Twitter
- Hacker News

## Notes for Chrome Store
- No extra permissions used (only `activeTab`, `scripting`, `storage`).
- Content script runs only after user action.
- Avoids scraping outside active tab context.

## Troubleshooting
- If you see “No Reddit text found,” open a thread or subreddit and retry.
- If you hit limits, add your user ID to `PAID_USER_IDS`.
  - Find it in `chrome://extensions` → Problem Extractor Pro → Service worker → `chrome.storage.sync.get("pep_user_id")`.

