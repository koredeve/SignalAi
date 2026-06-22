// ─────────────────────────────────────────────────────────────────────────────
//  PHASE 5 — CONVERGENCE HEATMAP COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';

const fmt = (n, d = 4) => n != null ? Number(n).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : '--';

export default function Heatmap({ heatmap, masterSignal, dec, onClose }) {
  const [expanded, setExpanded] = useState(true);
  if (!heatmap) return null;

  const { color, action, conviction, conflictLevel, agents, liquidity, rr, levels } = heatmap;
  const isLive = action !== 'NO_TRADE';

  const actionLabel = action === 'LONG' ? 'LONG' : action === 'SHORT' ? 'SHORT' : 'NO TRADE';
  const conflictColor = conflictLevel === 'LOW' ? '#10b981' : conflictLevel === 'MODERATE' ? '#f59e0b' : '#ef4444';

  const dirIcon = a => a.direction === 'BUY' ? '▲' : a.direction === 'SELL' ? '▼' : '●';
  const dirColor = a => a.direction === 'BUY' ? '#10b981' : a.direction === 'SELL' ? '#ef4444' : '#6b7280';
  const confBar = v => Math.round((v || 0) * 100);

  return (
    <div style={{ background: '#0a0b0f', border: `1px solid ${color}40`, borderRadius: 8, overflow: 'hidden', marginBottom: 10, flexShrink: 0 }}>

      {/* ── Master signal bar ── */}
      <div style={{ background: `${color}18`, borderBottom: `1px solid ${color}30`, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        {/* Conviction indicator */}
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />

        <span style={{ fontSize: 16, fontWeight: 700, color, letterSpacing: 0.5 }}>{actionLabel}</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 10, color: '#6b7280' }}>Conviction</span>
          <div style={{ width: 80, height: 5, background: '#1e2235', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: conviction + '%', background: color, borderRadius: 3, transition: 'width .4s' }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color }}>{conviction}%</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 9, color: '#6b7280' }}>Conflict</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: conflictColor }}>{conflictLevel}</span>
        </div>

        {rr && <span style={{ fontSize: 10, color: '#6b7280' }}>R:R <span style={{ color: '#cdd3f0', fontWeight: 600 }}>{rr}:1</span></span>}

        <button onClick={e => { e.stopPropagation(); onClose(); }} style={{ marginLeft: 'auto', fontFamily: 'inherit', fontSize: 9, padding: '2px 8px', border: '1px solid #2a2f4a', borderRadius: 3, background: 'transparent', color: '#6b7280', cursor: 'pointer' }}>✕</button>
        <span style={{ fontSize: 10, color: '#4a5070' }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div style={{ padding: '10px 14px' }}>
          {/* Agent rows */}
          <div style={{ marginBottom: 10 }}>
            {agents.map((a, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', borderBottom: '1px solid #1a1d28' }}>
                {/* Direction badge */}
                <span style={{ width: 60, fontSize: 11, fontWeight: 700, color: dirColor(a) }}>
                  {dirIcon(a)} {a.direction}
                </span>
                {/* Confidence bar */}
                <div style={{ flex: 1, height: 4, background: '#1e2235', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: confBar(a.confidence) + '%', background: dirColor(a), borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 9, color: '#6b7280', width: 28, textAlign: 'right' }}>{confBar(a.confidence)}%</span>
                {/* Win rate */}
                {a.winRate != null && (
                  <span style={{ fontSize: 9, color: '#4a5070' }}>WR: <span style={{ color: '#cdd3f0' }}>{Math.round(a.winRate * 100)}%</span></span>
                )}
                {/* Weight */}
                <span style={{ fontSize: 9, color: '#4a5070' }}>wt: <span style={{ color: '#9b7ff5' }}>{a.weight.toFixed(3)}</span></span>
                {/* Agent name */}
                <span style={{ fontSize: 9, color: '#4a5070', width: 80, textAlign: 'right' }}>{a.name}</span>
              </div>
            ))}
          </div>

          {/* Trade levels */}
          {isLive && levels && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 9, color: '#4a5070', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>Trade Levels</div>
                {[
                  { label: 'Entry',     price: levels.entry,   color: '#3d7fff', bg: 'rgba(61,127,255,.1)'   },
                  { label: 'Stop Loss', price: masterSignal?.stop_loss || levels.sl, color: '#ef4444', bg: 'rgba(239,68,68,.08)' },
                  { label: 'TP 1',      price: levels.tp1,     color: '#10b981', bg: 'rgba(16,185,129,.06)'  },
                  { label: 'TP 2',      price: levels.tp2,     color: '#10b981', bg: 'rgba(16,185,129,.1)'   },
                  { label: 'TP 3',      price: levels.tp3,     color: '#10b981', bg: 'rgba(16,185,129,.14)'  },
                ].map(row => (
                  <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 7px', borderRadius: 3, marginBottom: 2, background: row.bg, fontSize: 10 }}>
                    <span style={{ fontSize: 9, color: '#6b7280' }}>{row.label}</span>
                    <span style={{ fontWeight: 700, color: row.color }}>{fmt(row.price, dec)}</span>
                  </div>
                ))}
              </div>

              {/* Liquidity adjustment */}
              {liquidity && (
                <div>
                  <div style={{ fontSize: 9, color: '#4a5070', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.5px' }}>Liquidity SL Adjustment</div>
                  <div style={{ background: '#161922', borderRadius: 4, padding: '8px 10px', border: '1px solid #2a2f4a' }}>
                    <div style={{ fontSize: 9, marginBottom: 4 }}>
                      <span style={{ color: '#6b7280' }}>Original SL </span>
                      <span style={{ color: '#ef4444', fontWeight: 700 }}>{fmt(liquidity.originalSL, dec)}</span>
                    </div>
                    <div style={{ fontSize: 9, marginBottom: 4 }}>
                      <span style={{ color: '#6b7280' }}>Adjusted SL </span>
                      <span style={{ color: '#f5a623', fontWeight: 700 }}>{fmt(liquidity.adjustedSL, dec)}</span>
                    </div>
                    <div style={{ fontSize: 9, color: '#4a5070' }}>
                      Assessment: <span style={{ color: liquidity.assessment === 'OUTSIDE_LIQUIDITY_POOL' ? '#10b981' : '#f59e0b' }}>
                        {liquidity.assessment?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div style={{ fontSize: 9, color: '#4a5070', marginTop: 3 }}>
                      Buffer: <span style={{ color: '#cdd3f0' }}>{liquidity.bufferMethod}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* No trade reason */}
          {!isLive && masterSignal?.reason && (
            <div style={{ padding: '8px 10px', background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 4, fontSize: 10, color: '#ef4444', marginBottom: 8 }}>
              NO TRADE — {masterSignal.reason.replace(/_/g, ' ')}
            </div>
          )}

          <div style={{ fontSize: 9, color: '#252840', paddingTop: 6, borderTop: '1px solid #1a1d28' }}>
            Deterministic scoring engine. LLMs analyze — code decides. Not financial advice.
          </div>
        </div>
      )}
    </div>
  );
}
