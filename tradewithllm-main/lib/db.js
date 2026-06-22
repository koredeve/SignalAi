// ─────────────────────────────────────────────────────────────────────────────
//  DATABASE — Pure JavaScript, no native modules, no compilation
//  Storage: JSON files in /tmp (Vercel) or ./data/ (local)
//  Fully compatible with Node 24, Vercel, and any serverless environment
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';

const DATA_DIR = process.env.NODE_ENV === 'production'
  ? '/tmp/signalai'
  : path.join(process.cwd(), 'data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readTable(name) {
  ensureDir();
  const file = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return [];
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return []; }
}

function writeTable(name, rows) {
  ensureDir();
  const file = path.join(DATA_DIR, `${name}.json`);
  const tmp  = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2));
  fs.renameSync(tmp, file);
}

function readKV(name) {
  ensureDir();
  const file = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}

function writeKV(name, data) {
  ensureDir();
  const file = path.join(DATA_DIR, `${name}.json`);
  const tmp  = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

// ── Signals ───────────────────────────────────────────────────────────────────
export function saveSignal(signal) {
  const rows = readTable('signals');
  const idx  = rows.findIndex(r => r.signal_id === signal.signal_id);
  const row  = { ...signal, created_at: signal.created_at || new Date().toISOString() };
  if (idx >= 0) rows[idx] = row; else rows.unshift(row);
  // keep last 500
  writeTable('signals', rows.slice(0, 500));
}

export function saveAgentOutput(row) {
  const rows = readTable('agent_outputs');
  rows.unshift(row);
  writeTable('agent_outputs', rows.slice(0, 2000));
}

export function getSignalHistory(limit = 30) {
  const signals  = readTable('signals').slice(0, limit);
  const outcomes = readTable('resolved_outcomes');
  return signals.map(s => {
    const outcome = outcomes.find(o => o.signal_id === s.signal_id);
    return { ...s, outcome: outcome?.outcome, pnl_r: outcome?.pnl_r };
  });
}

// ── Weights ───────────────────────────────────────────────────────────────────
const DEFAULT_WEIGHTS = {
  technical_specialist: 0.3333,
  sentiment_specialist: 0.3333,
  structure_specialist: 0.3334,
};

export function getActiveWeights() {
  const stored = readKV('weights');
  return Object.keys(stored).length ? stored : { ...DEFAULT_WEIGHTS };
}

export function setActiveWeights(weights) {
  writeKV('weights', weights);
}

// ── Context (daily PnL, consecutive losses, open positions) ───────────────────
const DEFAULT_CONTEXT = {
  daily_pnl_r: 0,
  consecutive_losses: 0,
  open_positions: [],
  minutes_to_high_impact_news: 999,
  session: 'LONDON',
};

export function getContext() {
  const stored = readKV('context');
  return { ...DEFAULT_CONTEXT, ...stored };
}

export function setContext(key, value) {
  const ctx = getContext();
  ctx[key] = value;
  writeKV('context', ctx);
}

// ── Resolved outcomes ─────────────────────────────────────────────────────────
export function saveResolvedOutcome(outcome) {
  const rows = readTable('resolved_outcomes');
  rows.unshift({ ...outcome, resolved_at: new Date().toISOString() });
  writeTable('resolved_outcomes', rows.slice(0, 1000));
}

export function getResolvedOutcomes(days = 30) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  return readTable('resolved_outcomes').filter(r => r.resolved_at >= cutoff);
}

// ── Agent performance ─────────────────────────────────────────────────────────
export function getAgentPerformance() {
  return readKV('agent_performance');
}

export function saveAgentPerformance(data) {
  writeKV('agent_performance', { ...data, updated_at: new Date().toISOString() });
}

// ── Open signals (for resolver) ───────────────────────────────────────────────
export function getOpenSignals() {
  return readTable('signals').filter(s => s.status === 'OPEN' && (s.final_action === 'LONG' || s.final_action === 'SHORT'));
}

export function updateSignalStatus(signalId, status) {
  const rows = readTable('signals');
  const idx  = rows.findIndex(r => r.signal_id === signalId);
  if (idx >= 0) { rows[idx].status = status; writeTable('signals', rows); }
}
