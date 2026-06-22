// ─────────────────────────────────────────────────────────────────────────────
//  PHASE 2 + 4 — AGENT PROMPTS & CALLER
//  All 4 specialists. All return strict JSON. No free text.
//
//  TO ADD A NEW MODEL:
//    1. Add it to the MODELS array in pages/api/analysis.js
//    2. Assign it a role: 'technical' | 'sentiment' | 'structure' | 'liquidity'
// ─────────────────────────────────────────────────────────────────────────────

// ── SYSTEM PROMPTS — one per specialist role ──────────────────────────────────

export const AGENT_PROMPTS = {

  technical_specialist: (pair, tf, price, atr, swingHighs, swingLows) => `
You are a Technical Analysis Specialist. You MUST return ONLY valid JSON. No markdown. No explanation outside the JSON object.

Analyze ${pair} on the ${tf} timeframe.
Current price: ${price}
ATR(14): ${atr.toFixed(5)}
Swing highs (last 5): ${JSON.stringify(swingHighs)}
Swing lows  (last 5): ${JSON.stringify(swingLows)}

Evaluate: trend direction, momentum, moving average alignment, RSI, MACD conditions.
Choose direction: BUY if bullish confluence, SELL if bearish, NEUTRAL if unclear.

Return ONLY this JSON structure, filled with your analysis:
{
  "agent_name": "technical_specialist",
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "confidence": <float 0.0-1.0>,
  "strength": <float 0.0-10.0>,
  "entry_zone": [<low_of_zone>, <high_of_zone>],
  "stop_loss": <price>,
  "take_profit": [<tp1>, <tp2>, <tp3>],
  "time_horizon": "intraday" | "swing",
  "conflict_flags": [],
  "rationale": "<2 sentences max>"
}`,

  sentiment_specialist: (pair, tf, price, atr, session) => `
You are a Macro & Sentiment Specialist. You MUST return ONLY valid JSON. No markdown. No explanation outside the JSON object.

Analyze ${pair} on the ${tf} timeframe.
Current price: ${price}
ATR(14): ${atr.toFixed(5)}
Current session: ${session}

Evaluate: macro regime, DXY relationship for this pair, risk-on/risk-off conditions,
funding rates (for crypto), central bank posture, recent sentiment shifts.

Return ONLY this JSON structure:
{
  "agent_name": "sentiment_specialist",
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "confidence": <float 0.0-1.0>,
  "strength": <float 0.0-10.0>,
  "entry_zone": [<low_of_zone>, <high_of_zone>],
  "stop_loss": <price>,
  "take_profit": [<tp1>, <tp2>, <tp3>],
  "time_horizon": "intraday" | "swing",
  "conflict_flags": [],
  "rationale": "<2 sentences max>"
}`,

  structure_specialist: (pair, tf, price, atr, swingHighs, swingLows) => `
You are a Price Structure Specialist. You MUST return ONLY valid JSON. No markdown. No explanation outside the JSON object.

Analyze ${pair} on the ${tf} timeframe.
Current price: ${price}
ATR(14): ${atr.toFixed(5)}
Swing highs (last 5): ${JSON.stringify(swingHighs)}
Swing lows  (last 5): ${JSON.stringify(swingLows)}

Evaluate: market structure (HH/HL vs LH/LL), key support/resistance levels,
chart patterns, break of structure, change of character.

Return ONLY this JSON structure:
{
  "agent_name": "structure_specialist",
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "confidence": <float 0.0-1.0>,
  "strength": <float 0.0-10.0>,
  "entry_zone": [<low_of_zone>, <high_of_zone>],
  "stop_loss": <price>,
  "take_profit": [<tp1>, <tp2>, <tp3>],
  "time_horizon": "intraday" | "swing",
  "conflict_flags": [],
  "rationale": "<2 sentences max>"
}`,

  liquidity_specialist: (pair, tf, price, atr, session, swingHighs, swingLows, direction, entry, proposedSL, proposedTP) => `
You are a Liquidity Specialist. You MUST return ONLY valid JSON. No markdown. No explanation outside the JSON object.

Analyze ${pair} on ${tf}.
Current price: ${price}
ATR(14): ${atr.toFixed(5)}
Session: ${session}
Swing lows  (sell-side liquidity): ${JSON.stringify(swingLows)}
Swing highs (buy-side liquidity):  ${JSON.stringify(swingHighs)}

Proposed trade:
- Direction: ${direction}
- Entry: ${entry}
- Proposed SL: ${proposedSL}
- Proposed TP: ${proposedTP}

Tasks:
1. Identify which swing levels have clustered retail stops
2. Evaluate if proposed SL sits inside a liquidity pool
3. If yes: calculate adjusted SL outside the zone with ATR(14) × 0.3 buffer
   BUY  → adjusted SL = zone_low_edge  - (ATR × 0.3)
   SELL → adjusted SL = zone_high_edge + (ATR × 0.3)
4. Identify any fair value gaps near proposed SL

Return ONLY this JSON:
{
  "agent_name": "liquidity_specialist",
  "liquidity_zones": [
    { "type": "sell_side" | "buy_side", "level": <price>, "range": [<low>, <high>], "strength": "high" | "medium" | "low" }
  ],
  "proposed_sl_assessment": "INSIDE_LIQUIDITY_POOL" | "OUTSIDE_LIQUIDITY_POOL" | "BORDERLINE",
  "adjusted_sl": <price>,
  "buffer_applied": <price_amount>,
  "buffer_method": "ATR_14 × 0.3",
  "rationale": "<2 sentences max>"
}`,
};

// ── Model router — maps role to OpenRouter model ID ───────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  TO ADD A MODEL: add a new entry here. The key is the OpenRouter model ID.
//  Assign it a 'role' from: technical | sentiment | structure | liquidity
//  All 4 roles must be filled. One model per role.
// ─────────────────────────────────────────────────────────────────────────────
export const ROLE_MODELS = {
  technical:  'anthropic/claude-sonnet-4-5',  // swap any OpenRouter model here
  sentiment:  'openai/gpt-4o',
  structure:  'deepseek/deepseek-chat',
  liquidity:  'openai/gpt-4o',               // often reuse one; liquidity prompt is specialized
};

// ── Call a single agent via OpenRouter ───────────────────────────────────────
export async function callAgent(modelId, prompt, apiKey, timeoutMs = 25000) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL || 'https://signalai.vercel.app',
      'X-Title': 'SignalAI Orchestrator',
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 600,
      temperature: 0.15,   // low temperature for consistent structured output
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) throw new Error(`${modelId} → HTTP ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// ── Parse JSON from agent response (strip any stray markdown) ─────────────────
export function parseAgentJSON(raw, agentName) {
  try {
    const clean = raw.replace(/```json|```/gi, '').trim();
    const start = clean.indexOf('{');
    const end   = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1) return JSON.parse(clean.slice(start, end + 1));
  } catch (_) {}

  // Fallback: extract what we can
  console.warn(`[${agentName}] JSON parse failed, using fallback`);
  const dir = /\bBUY\b/.test(raw) ? 'BUY' : /\bSELL\b/.test(raw) ? 'SELL' : 'NEUTRAL';
  return {
    agent_name: agentName,
    direction: dir,
    confidence: 0.4,
    strength: 4.0,
    entry_zone: [0, 0],
    stop_loss: 0,
    take_profit: [0, 0, 0],
    time_horizon: 'intraday',
    conflict_flags: ['PARSE_ERROR'],
    rationale: raw.slice(0, 120),
    _parse_error: true,
  };
}
