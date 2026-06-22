# TradePro — Agentic AI Trading Terminal

## Deploy to Vercel in 2 steps

### Step 1 — Add your OpenRouter API key
After unzipping, open `.env.local` and replace the placeholder:
```
OPENROUTER_API_KEY=sk-or-your-actual-key-here
```

### Step 2 — Deploy
```bash
npm install
npx vercel
```
When Vercel asks for environment variables, add `OPENROUTER_API_KEY`.

That's it. No other setup needed.

---

## Run locally
```bash
npm install
npm run dev
# open http://localhost:3000
```

---

## How to add or swap an AI model

Open **`lib/agents.js`** and find `ROLE_MODELS` (~line 85):

```js
export const ROLE_MODELS = {
  technical:  'anthropic/claude-sonnet-4-5',
  sentiment:  'openai/gpt-4o',
  structure:  'deepseek/deepseek-chat',
  liquidity:  'openai/gpt-4o',
};
```

Change any value to any model ID from **openrouter.ai/models**.  
One line per role. That's the only file you need to edit.

---

## Architecture

- **3 directional specialists** run in parallel (Technical, Sentiment, Structure)
- **1 liquidity specialist** adjusts the stop-loss only (non-voting)
- **Deterministic scoring engine** makes the final decision — no LLM in the decision path
- **7 hard gates** (conflict, R:R, news, circuit breaker, correlation, session, drawdown)
- **Bayesian weight recalculation** after 50+ resolved signals
- **Signal history** persisted to JSON files in `/tmp` (Vercel) or `./data/` (local)

---

## API endpoints

| Endpoint | Method | What it does |
|---|---|---|
| `/api/analysis` | POST | Run full orchestration |
| `/api/prices` | GET | Forex + metals prices |
| `/api/signals` | GET | Signal history + weights |
| `/api/resolve` | POST | Resolve open signals |
| `/api/recalculate-weights` | POST | Recalculate Bayesian weights |

---

## Stack

- Next.js 15 · React 19
- Canvas API (all charts, no charting library)
- OpenRouter (Claude Sonnet 4.5, GPT-4o, DeepSeek V3)
- Binance WebSocket (real-time crypto, runs in browser)
- Frankfurter.app + gold-api.com (forex/metals, free, no key)
- JSON file storage (zero native dependencies, deploys anywhere)
