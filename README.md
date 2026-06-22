# SignalAI — Agentic AI Trading Terminal

Multi-model AI trading analysis tool. Routes multiple LLMs (Claude, GPT-4o, DeepSeek) to analyse charts with user-defined entry points and stop loss levels — comparing model outputs side by side to inform trade decisions.

Live demo: [signalai-kappa.vercel.app](https://signalai-kappa.vercel.app/)

---

## Quick Start

### 1. Clone and install
```bash
git clone https://github.com/koredeve/signalai.git
cd signalai
npm install
```

### 2. Set up environment variables
```bash
cp .env.example .env.local
```
Then open `.env.local` and add your keys:
```
OPENROUTER_API_KEY=sk-or-your-actual-key-here
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```
Get a free OpenRouter key at [openrouter.ai](https://openrouter.ai).

### 3. Run locally
```bash
npm run dev
# open http://localhost:3000
```

> The app works without an API key — you get the local technical analysis only. Add the key to enable the full 4-model orchestration.

---

## Deploy to Vercel

1. Push this repo to GitHub
2. Import the project on [vercel.com](https://vercel.com)
3. Add environment variables in Vercel dashboard:
   - `OPENROUTER_API_KEY` — your OpenRouter key
   - `NEXT_PUBLIC_SITE_URL` — your deployed URL (e.g. `https://signalai.vercel.app`)
4. Deploy

---

## How to swap AI models

Open `lib/agents.js` and find `ROLE_MODELS`:

```js
export const ROLE_MODELS = {
  technical:  'anthropic/claude-sonnet-4-5',
  sentiment:  'openai/gpt-4o',
  structure:  'deepseek/deepseek-chat',
  liquidity:  'openai/gpt-4o',
};
```

Replace any value with any model ID from [openrouter.ai/models](https://openrouter.ai/models). That is the only file you need to edit.

---

## Architecture

```
User clicks "AI Analysis"
        │
        ▼
3 directional specialists run in parallel
  ├── Technical Specialist  (Claude Sonnet)
  ├── Sentiment Specialist  (GPT-4o)
  └── Structure Specialist  (DeepSeek)
        │
        ▼
Deterministic scoring engine
  ├── Weighted consensus (Bayesian-adjusted)
  ├── 7 hard gates (conflict, R:R, news, circuit breaker,
  │               correlation, session filter, drawdown)
  └── Direction + conviction score
        │
        ▼
Liquidity Specialist (non-voting)
  └── Adjusts stop-loss away from retail liquidity pools
        │
        ▼
Final signal: LONG / SHORT / NO TRADE
+ Entry, SL, TP1/2/3, R:R ratio
```

**Key design principle:** LLMs analyse — deterministic code decides. No LLM is in the final decision path.

---

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/analysis` | POST | Full 4-model orchestration |
| `/api/prices` | GET | Live forex + metals prices |
| `/api/signals` | GET | Signal history, weights, context |
| `/api/resolve` | POST | Resolve open signals against live Binance prices |
| `/api/recalculate-weights` | POST | Bayesian weight recalculation (requires 50+ resolved signals) |

---

## Stack

- **Next.js 14** · **React 18**
- **Canvas API** — all charts drawn from scratch, no charting library
- **OpenRouter** — unified API for Claude, GPT-4o, DeepSeek and others
- **Binance WebSocket** — real-time crypto prices (runs in browser)
- **Frankfurter.app + gold-api.com** — forex and metals (free, no key needed)
- **JSON file storage** — zero native dependencies, deploys anywhere

---

## Data Persistence Note

Signal history and agent weights are stored in JSON files — `/tmp/signalai` on Vercel (ephemeral) or `./data/` locally. On Vercel, data may reset on cold starts. For persistent storage, replace the `readTable`/`writeTable` functions in `lib/db.js` with a database (Upstash Redis or Neon PostgreSQL work well).
