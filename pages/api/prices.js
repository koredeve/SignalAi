// Fallback server-side price fetch (used only when browser WS is unavailable)
// Primary price source is Binance WebSocket running directly in the browser.
// This endpoint handles forex + metals via free APIs.

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=8, stale-while-revalidate=15');
  const results = {};

  // Forex via Frankfurter (ECB, daily — placeholder until TwelveData key added)
  try {
    const fxRes  = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR,GBP,JPY,AUD,CHF,NZD,CAD', { signal: AbortSignal.timeout(5000) });
    const fxData = await fxRes.json();
    const r      = fxData.rates ?? {};
    const pairs  = {
      'EUR/USD': 1 / r.EUR, 'GBP/USD': 1 / r.GBP, 'USD/JPY': r.JPY,
      'AUD/USD': 1 / r.AUD, 'USD/CHF': r.CHF,      'NZD/USD': 1 / r.NZD,
      'USD/CAD': r.CAD,     'EUR/GBP': (1/r.EUR)/(1/r.GBP), 'EUR/JPY': (1/r.EUR)*r.JPY,
    };
    Object.entries(pairs).forEach(([pair, price]) => {
      if (price && isFinite(price)) results[pair] = { price, source: 'ECB-daily' };
    });
  } catch (e) { console.error('FX fetch failed:', e.message); }

  // Metals via gold-api.com (free, no key)
  for (const metal of ['XAU', 'XAG']) {
    try {
      const mRes  = await fetch(`https://api.gold-api.com/price/${metal}`, { signal: AbortSignal.timeout(5000) });
      const mData = await mRes.json();
      if (mData?.price) results[`${metal}/USD`] = { price: mData.price, source: 'gold-api' };
    } catch (e) { console.error(`${metal} fetch failed:`, e.message); }
  }

  // NOTE: Add TwelveData key to .env.local as TWELVE_DATA_KEY
  // to get real-time forex & commodities. See README for details.
  const tdKey = process.env.TWELVE_DATA_KEY;
  if (tdKey) {
    const tdSymbols = 'EUR/USD,GBP/USD,USD/JPY,AUD/USD,USD/CHF,NZD/USD,USD/CAD,EUR/GBP,EUR/JPY,XAU/USD,XAG/USD,WTI/USD,NATGAS/USD';
    try {
      const tdRes  = await fetch(`https://api.twelvedata.com/price?symbol=${tdSymbols}&apikey=${tdKey}`, { signal: AbortSignal.timeout(6000) });
      const tdData = await tdRes.json();
      Object.entries(tdData).forEach(([sym, val]) => {
        if (val?.price) results[sym] = { price: parseFloat(val.price), source: 'twelvedata-live' };
      });
    } catch (e) { console.error('TwelveData fetch failed:', e.message); }
  }

  res.status(200).json(results);
}
