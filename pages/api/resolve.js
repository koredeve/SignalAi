import { getOpenSignals, saveResolvedOutcome, updateSignalStatus, getContext, setContext } from '../../lib/db';

async function fetchCurrentPrice(symbol) {
  try {
    if (symbol.endsWith('/USDT')) {
      const binanceSym = symbol.replace('/', '');
      const res = await fetch(
        `https://api.binance.com/api/v3/ticker/price?symbol=${binanceSym}`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (!res.ok) return null;
      const data = await res.json();
      return parseFloat(data.price);
    }
    return null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).end();

  const openSignals = getOpenSignals();
  const results = [];

  for (const signal of openSignals) {
    const ageHours = (Date.now() - new Date(signal.created_at).getTime()) / 3600000;
    if (ageHours < 1) { results.push({ id: signal.signal_id, status: 'pending' }); continue; }

    const currentPrice = await fetchCurrentPrice(signal.symbol);
    const sl    = signal.adjusted_sl || signal.original_sl;
    const tp1   = signal.tp1;
    const rr    = signal.risk_reward || 2.0;
    const isLong = signal.final_action === 'LONG';

    let outcome, pnl_r;

    if (currentPrice !== null && sl > 0 && tp1 > 0) {
      if (isLong) {
        if (currentPrice >= tp1)      { outcome = 'TP_HIT'; pnl_r = rr; }
        else if (currentPrice <= sl)  { outcome = 'SL_HIT'; pnl_r = -1.0; }
        else { results.push({ id: signal.signal_id, status: 'still_open', currentPrice }); continue; }
      } else {
        if (currentPrice <= tp1)      { outcome = 'TP_HIT'; pnl_r = rr; }
        else if (currentPrice >= sl)  { outcome = 'SL_HIT'; pnl_r = -1.0; }
        else { results.push({ id: signal.signal_id, status: 'still_open', currentPrice }); continue; }
      }
    } else {
      // No live price feed for this pair — expire signals older than 24h
      if (ageHours < 24) { results.push({ id: signal.signal_id, status: 'pending_price_feed' }); continue; }
      outcome = 'EXPIRED';
      pnl_r   = 0;
    }

    const slDist = Math.abs((sl || signal.entry_price * 0.01) - signal.entry_price);

    saveResolvedOutcome({
      signal_id:      signal.signal_id,
      outcome,
      pnl_pips:       pnl_r * slDist * 10000,
      pnl_r,
      max_favorable:  outcome === 'TP_HIT' ? slDist * rr : slDist * 0.3,
      max_adverse:    outcome === 'SL_HIT' ? slDist       : slDist * 0.2,
      resolved_price: currentPrice,
    });

    updateSignalStatus(signal.signal_id, outcome);

    if (outcome !== 'EXPIRED') {
      const ctx       = getContext();
      const newPnl    = (Number(ctx.daily_pnl_r) || 0) + pnl_r;
      const newLosses = outcome === 'SL_HIT' ? (Number(ctx.consecutive_losses) || 0) + 1 : 0;
      setContext('daily_pnl_r', newPnl);
      setContext('consecutive_losses', newLosses);
    }

    results.push({ id: signal.signal_id, outcome, pnl_r, currentPrice });
  }

  res.status(200).json({ resolved: results.filter(r => r.outcome).length, results });
}
