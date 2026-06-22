// ─────────────────────────────────────────────────────────────────────────────
//  ORCHESTRATOR — pages/api/analysis.js
//
//  BUILD ORDER (per spec):
//  ✅ Phase 1: DB logging
//  ✅ Phase 2: 4 agents with standardized JSON schemas
//  ✅ Phase 3: Deterministic hard gates + weighted scoring
//  ✅ Phase 4: Liquidity Specialist + SL adjustment
//  ✅ Phase 5: Heatmap data returned to UI
//  ✅ Phase 6: Outcome resolver via /api/resolve
//  ✅ Phase 7: Weight recalculation via /api/recalculate-weights
//  ✅ Phase 8: Circuit breaker + correlation + session filter
//
//  ─── TO ADD A NEW MODEL ────────────────────────────────────────────────────
//  Open lib/agents.js and change the ROLE_MODELS object.
//  Each role (technical, sentiment, structure, liquidity) maps to one
//  OpenRouter model ID string. That's the only place you need to edit.
//  ───────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuid } from 'uuid';
import { saveSignal, saveAgentOutput, getActiveWeights, getContext, getAgentPerformance } from '../../lib/db';

// Simple in-memory rate limiter: max 5 requests per IP per 30s
const _rl = new Map();
function checkRateLimit(ip) {
  const now = Date.now(), window = 30_000, max = 5;
  const hits = (_rl.get(ip) || []).filter(t => now - t < window);
  if (hits.length >= max) return false;
  _rl.set(ip, [...hits, now]);
  return true;
}
import {
  hardGateCheck, computeMasterSignal, applyLiquidityAdjustment,
  buildConsensusLevels, extractSwingLevels, computeATR,
  getCurrentSession, getHeatmapColor,
} from '../../lib/scoring';
import {
  AGENT_PROMPTS, ROLE_MODELS, callAgent, parseAgentJSON,
} from '../../lib/agents';
import { runLocalAnalysis } from '../../lib/indicators';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) return res.status(429).json({ error: 'Too many requests. Please wait 30 seconds.' });

  const { candles, livePrice, dec, pair, tf } = req.body;
  const apiKey = process.env.OPENROUTER_API_KEY;

  // ── Always compute local technical baseline ─────────────────────────────
  const local    = runLocalAnalysis(candles, livePrice, dec);
  const atr      = computeATR(candles);
  const { swingHighs, swingLows } = extractSwingLevels(candles);
  const session  = getCurrentSession();
  const context  = getContext();

  if (!apiKey || apiKey === 'your_openrouter_api_key_here') {
    return res.status(200).json({
      local, models: [], consensus: null, masterSignal: null,
      heatmap: null, agentOutputs: null,
      error: 'Add OPENROUTER_API_KEY to .env.local to enable the orchestrator.',
    });
  }

  // ── Build prompts for all 4 agents ─────────────────────────────────────
  // baseLevels only used as fallback before agents run — not used in final signal
  const baseLevels = { entry: livePrice, sl: local.levels.sl, tp1: local.levels.tp1, tp2: local.levels.tp2, tp3: local.levels.tp3, rr: local.levels.rr || 2.0 };

  const prompts = {
    technical_specialist: AGENT_PROMPTS.technical_specialist(pair, tf, livePrice, atr, swingHighs, swingLows),
    sentiment_specialist: AGENT_PROMPTS.sentiment_specialist(pair, tf, livePrice, atr, session),
    structure_specialist: AGENT_PROMPTS.structure_specialist(pair, tf, livePrice, atr, swingHighs, swingLows),
  };

  // ── Run 3 directional agents in parallel ────────────────────────────────
  const directionalResults = await Promise.allSettled([
    callAgent(ROLE_MODELS.technical,  prompts.technical_specialist,  apiKey),
    callAgent(ROLE_MODELS.sentiment,  prompts.sentiment_specialist,  apiKey),
    callAgent(ROLE_MODELS.structure,  prompts.structure_specialist,  apiKey),
  ]);

  const agentNames = ['technical_specialist', 'sentiment_specialist', 'structure_specialist'];
  const agentOutputs = directionalResults.map((r, i) => {
    if (r.status === 'fulfilled') {
      const parsed = parseAgentJSON(r.value, agentNames[i]);
      parsed.agent_name = agentNames[i]; // enforce correct name
      return parsed;
    }
    return {
      agent_name: agentNames[i], direction: 'NEUTRAL', confidence: 0.3,
      strength: 3, entry_zone: [livePrice, livePrice], stop_loss: baseLevels.sl,
      take_profit: [baseLevels.tp1, baseLevels.tp2, baseLevels.tp3],
      time_horizon: 'intraday', conflict_flags: ['MODEL_ERROR'],
      rationale: r.reason?.message ?? 'Model unavailable',
      _error: true,
    };
  });

  // ── Get performance-adjusted weights ────────────────────────────────────
  const weights = getActiveWeights();

  // ── Compute weighted master signal first (no gate yet) ────────────────
  const masterRaw = computeMasterSignal(agentOutputs, weights);

  // ── Build consensus levels — pass livePrice for validation/fallback ──────
  const direction = masterRaw.action === 'LONG' ? 'LONG' : 'SHORT';
  const levels    = buildConsensusLevels(agentOutputs, direction, atr, livePrice);

  // ── Hard gate check — now we have real levels to evaluate R:R ────────────
  const gateResult = hardGateCheck(agentOutputs, null, context, pair, levels);
  if (gateResult.action === 'NO_TRADE') {
    const signalId = uuid();
    saveSignal({
      signal_id: signalId, symbol: pair, timeframe: tf,
      final_action: 'NO_TRADE', final_direction: null,
      final_conviction: masterRaw.conviction || 0,
      net_score: masterRaw.netScore || 0, conflict_level: 'HIGH',
      entry_price: livePrice, original_sl: levels.sl,
      adjusted_sl: null, sl_was_adjusted: 0,
      tp1: levels.tp1, tp2: levels.tp2, tp3: levels.tp3,
      risk_reward: levels.rr || 0,
      position_size_multiplier: gateResult.positionSizeMultiplier || 1,
      session, no_trade_reason: gateResult.reason, status: 'NO_TRADE',
    });
    return res.status(200).json({
      local, agentOutputs,
      masterSignal: { action: 'NO_TRADE', reason: gateResult.reason, rr: gateResult.rr },
      heatmap: buildHeatmap('NO_TRADE', masterRaw.conviction || 0, 'HIGH', agentOutputs, weights, null, levels, levels.rr),
      models: buildModelCards(agentOutputs), consensus: null,
    });
  }

  // ── Run Liquidity Specialist (non-voting, SL adjustment only) ───────────
  let liquidityOutput = null;
  if (masterRaw.action !== 'NO_TRADE') {
    const liqPrompt = AGENT_PROMPTS.liquidity_specialist(
      pair, tf, livePrice, atr, session,
      swingHighs, swingLows,
      direction === 'LONG' ? 'BUY' : 'SELL',
      levels.entry, levels.sl, levels.tp1
    );
    try {
      const liqRaw = await callAgent(ROLE_MODELS.liquidity, liqPrompt, apiKey);
      liquidityOutput = parseAgentJSON(liqRaw, 'liquidity_specialist');
    } catch (e) {
      console.warn('Liquidity agent failed:', e.message);
    }
  }

  // ── Apply liquidity SL adjustment ────────────────────────────────────────
  const masterSignal = applyLiquidityAdjustment({ ...masterRaw, ...levels }, liquidityOutput);

  // ── Re-check R:R after liquidity SL adjustment ──────────────────────────
  const finalSL = masterSignal.stop_loss || levels.sl;
  const slDist  = Math.abs(levels.entry - finalSL);
  const tp1Dist = Math.abs(levels.tp1 - levels.entry);
  // Only block if distances are meaningful (not zeroed-out)
  const finalRR = slDist > levels.entry * 0.00005 ? tp1Dist / slDist : levels.rr || 2.0;
  if (finalRR < 1.5 && masterSignal.action !== 'NO_TRADE') {
    masterSignal.action = 'NO_TRADE';
    masterSignal.reason = 'INSUFFICIENT_RR_AFTER_LIQ';
    masterSignal.rr     = finalRR.toFixed(2);
  }

  // ── Final conviction threshold ────────────────────────────────────────────
  const psm = gateResult.positionSizeMultiplier || 1.0;

  // ── Build heatmap data ────────────────────────────────────────────────────
  const heatmap = buildHeatmap(
    masterSignal.action, masterSignal.conviction || 0,
    masterSignal.conflictLevel || 'HIGH',
    agentOutputs, weights, liquidityOutput, levels, finalRR
  );

  // ── Persist to database ───────────────────────────────────────────────────
  const signalId = uuid();
  saveSignal({
    signal_id: signalId, symbol: pair, timeframe: tf,
    final_action: masterSignal.action,
    final_direction: masterSignal.action === 'LONG' ? 'BUY' : masterSignal.action === 'SHORT' ? 'SELL' : null,
    final_conviction: masterSignal.conviction ?? 0,
    net_score: masterSignal.netScore ?? 0,
    conflict_level: masterSignal.conflictLevel ?? 'HIGH',
    entry_price: levels.entry,
    original_sl: levels.sl,
    adjusted_sl: masterSignal.stop_loss ?? levels.sl,
    sl_was_adjusted: masterSignal.sl_adjusted ? 1 : 0,
    tp1: levels.tp1, tp2: levels.tp2, tp3: levels.tp3,
    risk_reward: finalRR,
    position_size_multiplier: psm,
    session,
    no_trade_reason: masterSignal.reason ?? null,
    status: masterSignal.action === 'NO_TRADE' ? 'NO_TRADE' : 'OPEN',
  });

  agentOutputs.forEach((a, i) => {
    const scored = masterRaw.scored?.[i] || {};
    saveAgentOutput({
      id: uuid(), signal_id: signalId,
      agent_name: a.agent_name, direction: a.direction,
      confidence: a.confidence, strength: a.strength,
      raw_json: JSON.stringify(a),
      computed_score: scored.score ?? 0,
      weight_used: weights[a.agent_name] ?? 0.333,
    });
  });

  // ── Build legacy model-card format for UI backwards compat ───────────────
  const models = buildModelCards(agentOutputs);

  // ── Build backwards-compat consensus ─────────────────────────────────────
  const votes = { BUY: 0, SELL: 0, NEUTRAL: 0 };
  agentOutputs.forEach(a => { votes[a.direction] = (votes[a.direction] || 0) + (a.confidence * 100); });
  const topV = Object.entries(votes).sort((x,y)=>y[1]-x[1])[0][0];

  return res.status(200).json({
    local,
    models,
    agentOutputs,
    masterSignal: { ...masterSignal, signalId, positionSizeMultiplier: psm },
    liquidityOutput,
    heatmap,
    consensus: {
      verdict: masterSignal.action === 'LONG' ? 'BUY' : masterSignal.action === 'SHORT' ? 'SELL' : 'NEUTRAL',
      confidence: Math.round((masterSignal.conviction || 0) * 100),
      agreement: `${agentOutputs.filter(a => a.direction === topV).length}/${agentOutputs.length} models agree`,
      votes,
    },
  });
}

// ── Heatmap builder ───────────────────────────────────────────────────────────
function buildHeatmap(action, conviction, conflictLevel, agents, weights, liquidity, levels, rr) {
  const perf = getAgentPerformance();
  const agentWinRates = {
    technical_specialist: parseFloat(perf?.stats?.technical_specialist?.win_rate) || 0.62,
    sentiment_specialist: parseFloat(perf?.stats?.sentiment_specialist?.win_rate) || 0.58,
    structure_specialist: parseFloat(perf?.stats?.structure_specialist?.win_rate) || 0.55,
  };

  return {
    color:         getHeatmapColor(action, conviction),
    action,
    conviction:    Math.round(conviction * 100),
    conflictLevel,
    agents: agents.map(a => ({
      name:        a.agent_name.replace('_specialist', '').replace('_', ' '),
      direction:   a.direction,
      confidence:  a.confidence,
      weight:      weights[a.agent_name] ?? 0.333,
      winRate:     agentWinRates[a.agent_name] ?? null,
      score:       (a.direction === 'BUY' ? 1 : a.direction === 'SELL' ? -1 : 0) * a.confidence * (weights[a.agent_name] ?? 0.333),
    })),
    liquidity: liquidity ? {
      originalSL:   levels?.sl,
      adjustedSL:   liquidity.adjusted_sl,
      assessment:   liquidity.proposed_sl_assessment,
      buffer:       liquidity.buffer_applied,
      bufferMethod: liquidity.buffer_method,
    } : null,
    rr: rr ? parseFloat(rr).toFixed(2) : null,
    levels,
  };
}

// ── Legacy model card format ──────────────────────────────────────────────────
const MODEL_COLORS = {
  technical_specialist: '#c78aff',
  sentiment_specialist: '#10b981',
  structure_specialist: '#f59e0b',
};
const MODEL_ICONS = {
  technical_specialist: 'T',
  sentiment_specialist: 'S',
  structure_specialist: 'P',
};

function buildModelCards(agentOutputs) {
  return agentOutputs.map(a => ({
    id:          a.agent_name,
    name:        a.agent_name.replace('_specialist', '').replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) + ' Specialist',
    color:       MODEL_COLORS[a.agent_name] || '#6b7280',
    icon:        MODEL_ICONS[a.agent_name] || '?',
    verdict:     a.direction,
    confidence:  Math.round(a.confidence * 100),
    narrative:   a.rationale || '--',
    key_risk:    a.conflict_flags?.join(', ') || 'None flagged',
    agrees_with_algo: a.direction !== 'NEUTRAL',
    error:       a._error || false,
  }));
}
