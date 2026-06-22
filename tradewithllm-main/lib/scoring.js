// ─────────────────────────────────────────────────────────────────────────────
//  DETERMINISTIC SCORING ENGINE — no LLM calls, pure rules
// ─────────────────────────────────────────────────────────────────────────────

// ── Hard Gate Filters ─────────────────────────────────────────────────────────
export function hardGateCheck(agents, liquidityOutput, context, pair, levels) {
  const { daily_pnl_r = 0, consecutive_losses = 0, open_positions = [] } = context;

  // Gate 1: High-confidence directional conflict
  const highConf = agents.filter(a => a.confidence > 0.70 && a.direction !== 'NEUTRAL');
  const hcDirs = new Set(highConf.map(a => a.direction));
  if (hcDirs.has('BUY') && hcDirs.has('SELL')) {
    return { action: 'NO_TRADE', reason: 'HIGH_CONFIDENCE_CONFLICT', gate: 1 };
  }

  // Gate 2: R:R too low — only check if we have valid levels
  // Only block if we actually computed real levels from agent data
  if (levels && levels.entry > 0 && levels.sl > 0 && levels.tp1 > 0) {
    const finalSL = liquidityOutput?.adjusted_sl || levels.sl;
    const slDist  = Math.abs(levels.entry - finalSL);
    const tp1Dist = Math.abs(levels.tp1 - levels.entry);
    // Only apply if distances are non-trivial (> 0.001% of price)
    if (slDist > levels.entry * 0.00001 && tp1Dist > levels.entry * 0.00001) {
      const rr = tp1Dist / slDist;
      if (rr < 1.5) {
        return { action: 'NO_TRADE', reason: 'INSUFFICIENT_RR', rr: rr.toFixed(2), gate: 2 };
      }
    }
  }

  // Gate 3: News proximity
  const minsToNews = context.minutes_to_high_impact_news ?? 999;
  if (minsToNews < 30) {
    return { action: 'NO_TRADE', reason: 'NEWS_PROXIMITY', minutes: minsToNews, gate: 3 };
  }

  // Gate 4: Daily drawdown circuit breaker
  if (Number(daily_pnl_r) < -3.0) {
    return { action: 'NO_TRADE', reason: 'CIRCUIT_BREAKER_DAILY_LOSS', daily_pnl_r, gate: 4 };
  }

  // Gate 5: Correlation guard
  const correlated = countCorrelatedPositions(pair, open_positions);
  if (correlated >= 2) {
    return { action: 'NO_TRADE', reason: 'CORRELATION_LIMIT', correlated, gate: 5 };
  }

  // Modifiers — reduce size but don't block
  let positionSizeMultiplier = 1.0;
  const session = context.session || 'LONDON';
  const MAJOR_PAIRS = ['EUR/USD','GBP/USD','USD/JPY','AUD/USD','USD/CHF','NZD/USD','USD/CAD'];
  if (session === 'ASIAN' && MAJOR_PAIRS.includes(pair)) positionSizeMultiplier *= 0.5;
  if (Number(consecutive_losses) >= 5) positionSizeMultiplier *= 0.5;

  return { action: 'PASS', positionSizeMultiplier };
}

// ── Weighted Scoring Engine ───────────────────────────────────────────────────
export function computeMasterSignal(agentOutputs, weights) {
  const DIRECTION_MAP = { BUY: +1.0, SELL: -1.0, NEUTRAL: 0.0 };

  const scored = agentOutputs.map(a => {
    const w = weights[a.agent_name] ?? (1 / agentOutputs.length);
    const dirValue = DIRECTION_MAP[a.direction] ?? 0;
    const score = dirValue * (a.confidence || 0) * w;
    return { name: a.agent_name, score, direction: a.direction, confidence: a.confidence, weight: w };
  });

  const netScore = scored.reduce((s, a) => s + a.score, 0);
  const totalMagnitude = scored.reduce((s, a) => s + Math.abs(a.score), 0);

  if (totalMagnitude === 0) {
    return { action: 'NO_TRADE', reason: 'ZERO_MAGNITUDE', conviction: 0, scored };
  }

  const conviction = Math.abs(netScore) / totalMagnitude;
  let action, conflictLevel;

  if (conviction >= 0.75) {
    action = netScore > 0 ? 'LONG' : 'SHORT';
    conflictLevel = 'LOW';
  } else if (conviction >= 0.45) {
    action = netScore > 0 ? 'LONG' : 'SHORT';
    conflictLevel = 'MODERATE';
  } else {
    action = 'NO_TRADE';
    conflictLevel = 'HIGH';
  }

  return { action, conviction, netScore, conflictLevel, scored, reason: action === 'NO_TRADE' ? 'HIGH_CONFLICT' : null };
}

// ── Liquidity SL Adjustment ───────────────────────────────────────────────────
export function applyLiquidityAdjustment(masterSignal, liquidityOutput) {
  if (!liquidityOutput || masterSignal.action === 'NO_TRADE') return masterSignal;
  const result = { ...masterSignal };
  if (liquidityOutput.proposed_sl_assessment !== 'OUTSIDE_LIQUIDITY_POOL' && liquidityOutput.adjusted_sl) {
    result.stop_loss   = liquidityOutput.adjusted_sl;
    result.sl_adjusted = true;
    result.sl_reason   = liquidityOutput.rationale;
    result.sl_buffer   = liquidityOutput.buffer_applied;
  } else {
    result.sl_adjusted = false;
  }
  return result;
}

// ── Consensus levels — robust fallback using ATR when agents return bad data ──
export function buildConsensusLevels(agentOutputs, direction, atr, livePrice) {
  const base = livePrice || 0;

  // Filter out zeroed/invalid agent values
  const validEntry = agentOutputs
    .map(a => {
      if (!a.entry_zone) return null;
      const mid = (a.entry_zone[0] + (a.entry_zone[1] ?? a.entry_zone[0])) / 2;
      // Reject if more than 20% away from live price (LLM hallucinated)
      if (base > 0 && Math.abs(mid - base) / base > 0.20) return null;
      return mid > 0 ? mid : null;
    })
    .filter(Boolean);

  const validSL = agentOutputs
    .map(a => {
      if (!a.stop_loss || a.stop_loss <= 0) return null;
      if (base > 0 && Math.abs(a.stop_loss - base) / base > 0.30) return null;
      return a.stop_loss;
    })
    .filter(Boolean);

  const validTP1 = agentOutputs.map(a => a.take_profit?.[0]).filter(v => v > 0 && (!base || Math.abs(v - base) / base < 0.30));
  const validTP2 = agentOutputs.map(a => a.take_profit?.[1]).filter(v => v > 0 && (!base || Math.abs(v - base) / base < 0.40));
  const validTP3 = agentOutputs.map(a => a.take_profit?.[2]).filter(v => v > 0 && (!base || Math.abs(v - base) / base < 0.50));

  const avg = arr => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

  const entry = avg(validEntry) || base;
  const isLong = direction === 'LONG';

  // ATR-based fallbacks — always valid
  const slFallback  = isLong ? entry - atr * 1.5 : entry + atr * 1.5;
  const tp1Fallback = isLong ? entry + atr * 2.0 : entry - atr * 2.0;
  const tp2Fallback = isLong ? entry + atr * 3.5 : entry - atr * 3.5;
  const tp3Fallback = isLong ? entry + atr * 5.5 : entry - atr * 5.5;

  const sl  = avg(validSL)  || slFallback;
  const tp1 = avg(validTP1) || tp1Fallback;
  const tp2 = avg(validTP2) || tp2Fallback;
  const tp3 = avg(validTP3) || tp3Fallback;

  const slDist = Math.abs(entry - sl);
  const rr = slDist > 0 ? Math.abs(tp1 - entry) / slDist : 2.0;

  return { entry, sl, tp1, tp2, tp3, rr };
}

// ── Swing structure helpers ───────────────────────────────────────────────────
export function extractSwingLevels(candles, lookback = 20) {
  const c = candles.slice(-lookback - 2);
  const highs = [], lows = [];
  for (let i = 1; i < c.length - 1; i++) {
    if (c[i].h > c[i-1].h && c[i].h > c[i+1].h) highs.push(c[i].h);
    if (c[i].l < c[i-1].l && c[i].l < c[i+1].l) lows.push(c[i].l);
  }
  return { swingHighs: highs.slice(-5), swingLows: lows.slice(-5) };
}

export function computeATR(candles, period = 14) {
  const c = candles.slice(-period - 1);
  if (c.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < c.length; i++) {
    const tr = Math.max(
      c[i].h - c[i].l,
      Math.abs(c[i].h - c[i-1].c),
      Math.abs(c[i].l - c[i-1].c)
    );
    sum += tr;
  }
  return sum / period;
}

export function getCurrentSession() {
  const h = new Date().getUTCHours();
  if (h >= 22 || h < 8)  return 'ASIAN';
  if (h >= 8  && h < 16) return 'LONDON';
  return 'NEW_YORK';
}

export function getHeatmapColor(action, conviction) {
  if (action === 'LONG'  && conviction >= 0.75) return '#10b981';
  if (action === 'SHORT' && conviction >= 0.75) return '#ef4444';
  if (action !== 'NO_TRADE' && conviction >= 0.45) return '#f59e0b';
  return '#6b7280';
}

function countCorrelatedPositions(pair, openPositions) {
  const CORRELATION_MAP = {
    'EUR/USD': ['GBP/USD','EUR/GBP','EUR/JPY'],
    'GBP/USD': ['EUR/USD','EUR/GBP'],
    'USD/JPY': ['EUR/JPY'],
    'BTC/USDT': ['ETH/USDT','SOL/USDT','BNB/USDT'],
    'ETH/USDT': ['BTC/USDT','SOL/USDT'],
    'SOL/USDT': ['BTC/USDT','ETH/USDT'],
  };
  const correlated = CORRELATION_MAP[pair] || [];
  return (openPositions || []).filter(p => correlated.includes(p.symbol)).length;
}
