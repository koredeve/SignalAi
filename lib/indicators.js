export function calcMA(data, n) {
  return data.map((_, i) =>
    i < n - 1 ? null : data.slice(i - n + 1, i + 1).reduce((s, c) => s + c.c, 0) / n
  );
}
export function calcEMA(data, n) {
  const k = 2 / (n + 1), r = [null];
  for (let i = 1; i < data.length; i++)
    r.push(r[i-1] === null ? data[i].c : data[i].c * k + r[i-1] * (1 - k));
  return r;
}
export function calcBB(data, n) {
  return data.map((_, i) => {
    if (i < n - 1) return null;
    const s = data.slice(i-n+1, i+1).map(d => d.c);
    const a = s.reduce((x, v) => x + v, 0) / n;
    const sd = Math.sqrt(s.reduce((x, v) => x + (v-a)**2, 0) / n);
    return { mid: a, up: a + 2*sd, dn: a - 2*sd };
  });
}
export function calcRSI(data, n) {
  const g = [], l = [];
  for (let i = 1; i < data.length; i++) {
    const d = data[i].c - data[i-1].c;
    g.push(d > 0 ? d : 0); l.push(d < 0 ? -d : 0);
  }
  const r = [null];
  for (let i = 0; i < g.length; i++) {
    if (i < n - 1) { r.push(null); continue; }
    const ag = g.slice(i-n+1, i+1).reduce((s, v) => s + v, 0) / n;
    const al = l.slice(i-n+1, i+1).reduce((s, v) => s + v, 0) / n;
    r.push(al === 0 ? 100 : 100 - 100 / (1 + ag / al));
  }
  return r;
}
export function calcMACD(data) {
  const e12 = calcEMA(data, 12), e26 = calcEMA(data, 26);
  const mac = data.map((_, i) => e12[i] !== null && e26[i] !== null ? e12[i] - e26[i] : null);
  const se = calcEMA(mac.map(v => ({ c: v ?? 0 })), 9);
  return mac.map((m, i) => m === null ? null : { macd: m, signal: se[i] ?? 0, hist: m - (se[i] ?? 0) });
}
export function heikinAshi(src) {
  const ha = [];
  src.forEach((c, i) => {
    const hc = (c.o + c.h + c.l + c.c) / 4;
    const ho = i === 0 ? c.o : (ha[i-1].o + ha[i-1].c) / 2;
    ha.push({ t: c.t, o: ho, h: Math.max(c.h, ho, hc), l: Math.min(c.l, ho, hc), c: hc, v: c.v });
  });
  return ha;
}
export function genCandles(basePrice, n, tfMs) {
  const arr = []; let p = basePrice; const now = Date.now();
  for (let i = 0; i < n; i++) {
    const o = p, d = p * (0.005 + Math.random() * 0.02) * (Math.random() < 0.52 ? 1 : -1);
    const h = Math.max(o, o+d) + p * Math.random() * 0.003;
    const l = Math.min(o, o+d) - p * Math.random() * 0.003;
    const c = l + (h - l) * Math.random();
    arr.push({ t: now - (n-i) * tfMs, o, h, l, c: +c.toFixed(8), v: Math.random() * 600 + 50 });
    p = c;
  }
  return arr;
}
export function runLocalAnalysis(candles, livePrice, dec) {
  const src = candles, lp = livePrice, vis = src.slice(-80);
  const lastMA  = calcMA(src, 20).filter(Boolean).pop()  ?? lp;
  const lastEMA = calcEMA(src, 9).filter(Boolean).pop()  ?? lp;
  const lastBB  = calcBB(src, 20).filter(Boolean).pop()  ?? { up: lp*1.02, dn: lp*.98, mid: lp };
  const lastRSI = calcRSI(src, 14).filter(v => v !== null).pop() ?? 50;
  const lastMACD= calcMACD(src).filter(Boolean).pop()    ?? { hist: 0 };

  let score = 0; const reasons = [], indPills = [];
  const isBull = lp > lastMA && lp > lastEMA;
  const isBear = lp < lastMA && lp < lastEMA;
  score += isBull ? 2 : (isBear ? -2 : 0);
  if (isBull) { reasons.push({ t:'bull', txt:`Price above MA20 (${lp > lastMA ? '+' : ''}) and EMA9 — uptrend confirmed` }); indPills.push({ lbl:'Trend: Bullish', type:'bull' }); }
  else if (isBear) { reasons.push({ t:'bear', txt:`Price below MA20 and EMA9 — downtrend active` }); indPills.push({ lbl:'Trend: Bearish', type:'bear' }); }
  else { reasons.push({ t:'neu', txt:`MA/EMA crossover zone — mixed trend` }); indPills.push({ lbl:'Trend: Neutral', type:'neu' }); }

  if (lastRSI > 65) { score--; reasons.push({ t:'bear', txt:`RSI ${lastRSI.toFixed(1)} — overbought territory` }); indPills.push({ lbl:`RSI ${lastRSI.toFixed(1)} OB`, type:'bear' }); }
  else if (lastRSI < 35) { score++; reasons.push({ t:'bull', txt:`RSI ${lastRSI.toFixed(1)} — oversold, reversal likely` }); indPills.push({ lbl:`RSI ${lastRSI.toFixed(1)} OS`, type:'bull' }); }
  else { reasons.push({ t:'neu', txt:`RSI ${lastRSI.toFixed(1)} — neutral zone` }); indPills.push({ lbl:`RSI ${lastRSI.toFixed(1)}`, type:'neu' }); }

  if (lastMACD.hist > 0) { score++; reasons.push({ t:'bull', txt:`MACD histogram positive — bullish momentum` }); indPills.push({ lbl:'MACD: Bull', type:'bull' }); }
  else { score--; reasons.push({ t:'bear', txt:`MACD histogram negative — bearish momentum` }); indPills.push({ lbl:'MACD: Bear', type:'bear' }); }

  score += lp > lastBB.mid ? 1 : -1;
  reasons.push(lp > lastBB.mid ? { t:'bull', txt:`Above BB midline — bullish bias` } : { t:'bear', txt:`Below BB midline — bearish bias` });
  indPills.push(lp > lastBB.mid ? { lbl:'BB: Above mid', type:'bull' } : { lbl:'BB: Below mid', type:'bear' });

  const bullC = vis.slice(-10).filter(c => c.c > c.o).length;
  if (bullC >= 6) { score++; reasons.push({ t:'bull', txt:`${bullC}/10 recent candles bullish` }); indPills.push({ lbl:'PA: Bullish', type:'bull' }); }
  else if (bullC <= 4) { score--; reasons.push({ t:'bear', txt:`${bullC}/10 recent candles bullish — selling pressure` }); indPills.push({ lbl:'PA: Bearish', type:'bear' }); }
  else { reasons.push({ t:'neu', txt:`Price action mixed` }); indPills.push({ lbl:'PA: Mixed', type:'neu' }); }

  const verdict = score >= 2 ? 'BUY' : score <= -2 ? 'SELL' : 'NEUTRAL';
  const conf = Math.min(95, Math.round(Math.abs(score) / 7 * 100 + 30));
  const atr = vis.slice(-14).reduce((s, c) => s + (c.h - c.l), 0) / 14;
  let entry = lp, sl, tp1, tp2, tp3;
  if (verdict === 'BUY')  { sl = entry - atr*1.5; tp1 = entry + atr*1.5; tp2 = entry + atr*2.8; tp3 = entry + atr*4.5; }
  else if (verdict === 'SELL') { sl = entry + atr*1.5; tp1 = entry - atr*1.5; tp2 = entry - atr*2.8; tp3 = entry - atr*4.5; }
  else { sl = entry - atr*1.2; tp1 = entry + atr*1.2; tp2 = entry + atr*2.2; tp3 = entry + atr*3.5; }
  const rr = (v, e, s) => (Math.abs(v-e) / Math.abs(s-e)).toFixed(2);
  return { verdict, conf, score, reasons, indPills, levels: { entry, sl, tp1, tp2, tp3, rr1: rr(tp1,entry,sl), rr2: rr(tp2,entry,sl), rr3: rr(tp3,entry,sl) }, timestamp: new Date().toISOString() };
}
