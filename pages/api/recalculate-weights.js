import { getResolvedOutcomes, setActiveWeights, saveAgentPerformance } from '../../lib/db';
import fs   from 'fs';
import path from 'path';

const DEFAULT_WEIGHT  = 1 / 3;
const MIN_SAMPLE_SIZE = 50;
const PRIOR_ALPHA     = 10;
const PRIOR_BETA      = 10;

function getAgentOutputs() {
  try {
    const dir  = process.env.NODE_ENV === 'production' ? '/tmp/signalai' : path.join(process.cwd(), 'data');
    const file = path.join(dir, 'agent_outputs.json');
    if (!fs.existsSync(file)) return [];
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { return []; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();

  const agents   = ['technical_specialist', 'sentiment_specialist', 'structure_specialist'];
  const outcomes = getResolvedOutcomes(30);
  const outputs  = getAgentOutputs();

  const rawWeights = {};
  const stats      = {};

  for (const agentName of agents) {
    // Find resolved signals where this agent agreed with the final direction
    const agentOuts = outputs.filter(o => o.agent_name === agentName);
    const matched   = outcomes.filter(o => {
      const ao = agentOuts.find(a => a.signal_id === o.signal_id);
      return ao && (ao.direction === 'BUY' && o.final_direction === 'BUY' ||
                    ao.direction === 'SELL' && o.final_direction === 'SELL');
    });

    stats[agentName] = { sample: matched.length };

    if (matched.length < MIN_SAMPLE_SIZE) {
      rawWeights[agentName] = DEFAULT_WEIGHT;
      continue;
    }

    const wins30 = matched.filter(s => s.outcome === 'TP_HIT').length;
    const smoothedWR = (wins30 + PRIOR_ALPHA) / (matched.length + PRIOR_ALPHA + PRIOR_BETA);

    const winning   = matched.filter(s => s.pnl_r > 0).map(s => s.pnl_r);
    const losing    = matched.filter(s => s.pnl_r < 0).map(s => s.pnl_r);
    const avgWin    = winning.length ? winning.reduce((a,b)=>a+b,0)/winning.length : 0;
    const avgLoss   = losing.length  ? Math.abs(losing.reduce((a,b)=>a+b,0)/losing.length) : 1;
    const expect    = smoothedWR * avgWin - (1 - smoothedWR) * avgLoss;
    const normExp   = Math.max(-1, Math.min(1, expect / 2));

    const raw = 0.8 + 0.8 * (smoothedWR - 0.5) + 0.4 * normExp;
    rawWeights[agentName] = Math.max(0.6, Math.min(1.4, raw));
    stats[agentName].win_rate = (wins30 / matched.length).toFixed(3);
    stats[agentName].smoothed_wr = smoothedWR.toFixed(3);
  }

  // Normalize
  const total = Object.values(rawWeights).reduce((a,b)=>a+b,0);
  const normalized = {};
  for (const [name, w] of Object.entries(rawWeights)) normalized[name] = w / total;

  setActiveWeights(normalized);
  saveAgentPerformance({ weights: normalized, stats, updated_at: new Date().toISOString() });

  const anyDefault = agents.some(a => stats[a].sample < MIN_SAMPLE_SIZE);
  res.status(200).json({ weights: normalized, stats, message: anyDefault ? `Need ${MIN_SAMPLE_SIZE} resolved signals per agent for dynamic weights. Using equal weights for low-sample agents.` : 'Weights recalculated.' });
}
