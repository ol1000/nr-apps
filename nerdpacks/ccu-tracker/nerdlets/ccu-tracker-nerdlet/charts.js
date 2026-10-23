import React from 'react';
import { fmt, monthShort } from './lib/format';

/** Tiny daily bars for one user. */
export function Sparkline({ values, width = 110, height = 18 }) {
  if (!values.length) return <svg width={width} height={height} />;
  const max = Math.max(...values, 1e-9);
  const bw = width / values.length;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="daily usage">
      {values.map((v, i) => {
        const h = Math.max(v > 0 ? 1.5 : 0, (v / max) * (height - 2));
        return <rect key={i} x={i * bw + 0.5} y={height - h} width={Math.max(bw - 1.5, 1)} height={h} rx="1" fill="var(--series)" />;
      })}
    </svg>
  );
}

/** One user's monthly totals across the lookback window (tooltip). */
export function LookbackBars({ values, months, selected, width = 300, height = 36 }) {
  const max = Math.max(...values, 1e-9);
  const bw = width / values.length;
  return (
    <svg width={width} height={height + 12} viewBox={`0 0 ${width} ${height + 12}`} style={{ display: 'block', marginTop: 4 }}>
      {values.map((v, i) => {
        const h = Math.max(v > 0 ? 1.5 : 0, (v / max) * (height - 12));
        return (
          <g key={months[i]}>
            <rect x={i * bw + 4} y={height - h} width={bw - 8} height={h} rx="2" fill={months[i] === selected ? 'var(--series)' : 'var(--system)'} />
            {v > 0 && <text x={i * bw + bw / 2} y={height - h - 2} textAnchor="middle" fontSize="9" fill="var(--text-2)">{fmt(v)}</text>}
            <text x={i * bw + bw / 2} y={height + 10} textAnchor="middle" fontSize="9" fill="var(--text-3)">{monthShort(months[i])}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Monthly named-user totals with an optional budget line; click a bar to open that month. */
export function HistoryChart({ rows, side, budgetTotal, selected, onSelect, onHover, onLeave }) {
  const W = 760;
  const H = 130;
  const m = { l: 40, r: 8, t: 6, b: 20 };
  const top = Math.max(...rows.map(r => r[side].attributed), budgetTotal || 0, 1e-9);
  const max = top * 1.08;
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const bw = iw / rows.length;
  const y = v => m.t + ih - (v / max) * ih;
  return (
    <svg className="history" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Monthly usage by named users">
      {[0, 1, 2, 3].map(i => {
        const v = top * (i / 3);
        return (
          <g key={i}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth="1" />
            <text x={m.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)">{fmt(v)}</text>
          </g>
        );
      })}
      {rows.map((r, i) => {
        const a = r[side].attributed;
        const h = (a / max) * ih;
        const x = m.l + i * bw + bw * 0.2;
        const w = bw * 0.6;
        const sel = r.month === selected;
        return (
          <g key={r.month} style={{ cursor: 'pointer' }} onClick={() => onSelect(r.month)}
            onMouseMove={e => onHover(e, r)} onMouseLeave={onLeave}>
            <rect x={m.l + i * bw} y={m.t} width={bw} height={ih + m.b} fill={sel ? 'var(--surface-2)' : 'transparent'} />
            {a > 0 && <rect x={x} y={y(a)} width={w} height={Math.max(h, 1.5)} rx="3" fill="var(--series)" />}
            <text x={x + w / 2} y={H - 6} textAnchor="middle" fontSize="11" fill={sel ? 'var(--text)' : 'var(--text-2)'} fontWeight={sel ? 600 : 400}>
              {monthShort(r.month)}
            </text>
          </g>
        );
      })}
      {budgetTotal && <line x1={m.l} x2={W - m.r} y1={y(budgetTotal)} y2={y(budgetTotal)} stroke="var(--crit)" strokeWidth="2" strokeDasharray="5 4" />}
    </svg>
  );
}
