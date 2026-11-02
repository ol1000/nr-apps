import React from 'react';
import { formatNum, monthLabel } from './lib/format';

const W = 760;
const H = 230;
const PAD = { l: 52, r: 16, t: 14, b: 32 };

const COLORS = { actual: '#1f6fe5', commit: '#7a8494', projected: '#e08a00', over: '#c8362b', grid: '#e6e9ed', text: '#5b6670' };

function Axes({ max, unit, months }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const x = i => PAD.l + (i / Math.max(1, months.length - 1)) * (W - PAD.l - PAD.r);
  const step = Math.ceil(months.length / 12);
  return (
    <g>
      {ticks.map(t => {
        const y = H - PAD.b - t * (H - PAD.t - PAD.b);
        return (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke={COLORS.grid} strokeWidth="1" />
            <text x={PAD.l - 6} y={y + 4} fontSize="10" textAnchor="end" fill={COLORS.text}>{formatNum(max * t, unit)}</text>
          </g>
        );
      })}
      {months.map((m, i) => (i % step === 0 ? (
        <text key={m.key} x={x(i)} y={H - 10} fontSize="10" textAnchor="middle" fill={COLORS.text}>{monthLabel(m.key).replace(' 20', " '")}</text>
      ) : null))}
    </g>
  );
}

/** Cumulative actual vs cumulative commit with the projection, for sum metrics. */
function CumulativeChart({ a }) {
  const pts = a.cumulative;
  const max = Math.max(1, ...pts.map(p => Math.max(p.commit, p.actual || 0, p.projected || 0))) * 1.05;
  const x = i => PAD.l + (i / Math.max(1, pts.length - 1)) * (W - PAD.l - PAD.r);
  const y = v => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const line = key => pts.map((p, i) => (p[key] === null ? null : `${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`)).filter(Boolean).join(' ');
  const nowIdx = pts.findIndex(p => p.state === 'current');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Cumulative consumption against commitment">
      <Axes max={max} unit={a.def.unit} months={pts} />
      <polyline fill="none" stroke={COLORS.commit} strokeWidth="2" strokeDasharray="6 4" points={line('commit')} />
      <polyline fill="none" stroke={a.status === 'over' || a.status === 'exceeded' ? COLORS.over : COLORS.projected} strokeWidth="2" strokeDasharray="2 4" points={line('projected')} />
      <polyline fill="none" stroke={COLORS.actual} strokeWidth="2.6" points={line('actual')} />
      {nowIdx >= 0 ? <line x1={x(nowIdx)} x2={x(nowIdx)} y1={PAD.t} y2={H - PAD.b} stroke={COLORS.text} strokeWidth="1" strokeDasharray="1 3" /> : null}
    </svg>
  );
}

/** Monthly peak bars with the minimum commit line, for user metrics. */
function PeakChart({ a }) {
  const rows = a.rows;
  const max = Math.max(1, ...rows.map(r => Math.max(r.actual || 0, r.commit))) * 1.15;
  const slot = (W - PAD.l - PAD.r) / rows.length;
  const y = v => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const step = Math.ceil(rows.length / 12);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Monthly peak users against minimum commit">
      <Axes max={max} unit="users" months={rows} />
      {rows.map((r, i) => {
        const x0 = PAD.l + i * slot + slot * 0.15;
        const below = r.actual !== null && r.commit > 0 && r.actual < r.commit;
        return (
          <g key={r.key}>
            {r.actual !== null ? <rect x={x0} y={y(r.actual)} width={slot * 0.7} height={H - PAD.b - y(r.actual)} fill={below ? COLORS.projected : COLORS.actual} rx="2" /> : null}
            {r.commit > 0 ? <line x1={x0 - slot * 0.1} x2={x0 + slot * 0.8} y1={y(r.commit)} y2={y(r.commit)} stroke={COLORS.commit} strokeWidth="2" /> : null}
            {i % step === 0 && r.actual !== null ? <text x={x0 + slot * 0.35} y={y(r.actual) - 4} fontSize="10" textAnchor="middle" fill={COLORS.text}>{Math.round(r.actual)}</text> : null}
          </g>
        );
      })}
    </svg>
  );
}

export default function Chart({ analysis, labels }) {
  const a = analysis;
  const L = { actual: 'Cumulative actual', commit: 'Cumulative minimum', projected: 'Projection at run-rate', ...(labels || {}) };
  return (
    <div>
      {a.def.kind === 'peak' ? <PeakChart a={a} /> : <CumulativeChart a={a} />}
      <div className="legend-row">
        {a.def.kind === 'peak' ? (
          <>
            <span><i style={{ background: COLORS.actual }} /> Monthly peak</span>
            <span><i style={{ background: COLORS.projected }} /> Below minimum</span>
            <span><i style={{ background: COLORS.commit }} /> Minimum</span>
          </>
        ) : (
          <>
            <span><i style={{ background: COLORS.actual }} /> {L.actual}</span>
            <span><i style={{ background: COLORS.commit }} /> {L.commit}</span>
            <span><i style={{ background: COLORS.projected }} /> {L.projected}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Small monthly bar chart: actual usage as bars, the minimum commit as a line.
//   within the minimum  -> blue bar (amber when below the minimum, with the unused part dashed up to the line)
//   above the minimum   -> the part over the line is red (overage)
// `series` = [{ key, label, color, rows: [{ key, state, actual, commit }] }]; several series are clustered per month
// (used for the three user types).
// ---------------------------------------------------------------------------------------------
const BW = 420;
const BH = 190;
const BP = { l: 40, r: 8, t: 10, b: 24 };
export const BAR_COLORS = { within: '#1f6fe5', below: '#e08a00', over: '#c8362b', line: '#1d2329' };

export function BarChart({ series, unit }) {
  const base = series[0].rows;
  const n = base.length;
  const max = Math.max(1, ...series.flatMap(s => s.rows.map(r => Math.max(r.actual || 0, r.commit || 0)))) * 1.12;
  const slot = (BW - BP.l - BP.r) / n;
  const y = v => BH - BP.b - (v / max) * (BH - BP.t - BP.b);
  const inner = slot * 0.78;
  const barW = inner / series.length;
  const labelEvery = n > 14 ? Math.ceil(n / 12) : n > 7 ? 2 : 1;
  const multi = series.length > 1;
  return (
    <svg viewBox={`0 0 ${BW} ${BH}`} width="100%" role="img" aria-label="Monthly usage against the minimum commit">
      {[0, 0.5, 1].map(t => {
        const yy = BH - BP.b - t * (BH - BP.t - BP.b);
        return (
          <g key={t}>
            <line x1={BP.l} x2={BW - BP.r} y1={yy} y2={yy} stroke={COLORS.grid} strokeWidth="1" />
            <text x={BP.l - 5} y={yy + 3} fontSize="9" textAnchor="end" fill={COLORS.text}>{formatNum(max * t, unit)}</text>
          </g>
        );
      })}
      {base.map((m, i) => (i % labelEvery === 0 ? (
        <text key={m.key} x={BP.l + i * slot + slot / 2} y={BH - 8} fontSize="9" textAnchor="middle" fill={COLORS.text}>{monthLabel(m.key).slice(0, 3)}</text>
      ) : null))}
      {series.map((s, si) => s.rows.map((r, i) => {
        const x0 = BP.l + i * slot + (slot - inner) / 2 + si * barW;
        const a = r.actual;
        const c = r.commit || 0;
        const has = a !== null && a !== undefined;
        const below = has && c > 0 && a < c && r.state !== 'current'; // a month in progress is not 'below' yet
        const above = has && c > 0 && a > c;
        const within = multi ? s.color : below ? BAR_COLORS.below : BAR_COLORS.within;
        const baseTop = has ? y(c > 0 ? Math.min(a, c) : a) : 0;
        const opacity = r.state === 'current' ? 0.6 : 1;
        const tip = `${monthLabel(r.key)}${r.state === 'current' ? ' (month to date)' : ''}: ${has ? formatNum(a, unit) : 'no data'}${c > 0 ? ` vs minimum ${formatNum(c, unit)}${above ? ` (+${formatNum(a - c, unit)} above)` : below ? ` (${formatNum(c - a, unit)} below)` : ''}` : ''}`;
        return (
          <g key={`${s.key}-${r.key}`} opacity={opacity}>
            <title>{s.label ? `${s.label} - ${tip}` : tip}</title>
            {has ? <rect x={x0} y={baseTop} width={Math.max(1, barW - 1)} height={Math.max(0, BH - BP.b - baseTop)} fill={within} rx="1" /> : null}
            {above ? <rect x={x0} y={y(a)} width={Math.max(1, barW - 1)} height={Math.max(0, y(c) - y(a))} fill={BAR_COLORS.over} rx="1" /> : null}
            {below ? <rect x={x0} y={y(c)} width={Math.max(1, barW - 1)} height={Math.max(0, y(a) - y(c))} fill="none" stroke={BAR_COLORS.below} strokeWidth="1" strokeDasharray="2 2" /> : null}
            {c > 0 ? <line x1={x0 - 1} x2={x0 + barW} y1={y(c)} y2={y(c)} stroke={BAR_COLORS.line} strokeWidth="2" /> : null}
          </g>
        );
      }))}
    </svg>
  );
}

export function BarLegend({ multi, series, plan }) {
  if (plan === 'advantage') {
    return (
      <div className="legend-row small">
        {multi ? series.map(s => <span key={s.key}><i style={{ background: s.color }} /> {s.label}</span>) : <span><i style={{ background: BAR_COLORS.within }} /> Usage</span>}
        <span>No minimums: usage draws on one shared budget</span>
      </div>
    );
  }
  const above = plan === 'savings' ? 'Above minimum (top-up, then PAYG)' : 'Above (overage bill)';
  return (
    <div className="legend-row small">
      {multi ? series.map(s => <span key={s.key}><i style={{ background: s.color }} /> {s.label}</span>) : <span><i style={{ background: BAR_COLORS.within }} /> Within minimum</span>}
      {!multi ? <span><i style={{ background: BAR_COLORS.below }} /> Below (unused dashed)</span> : <span><i className="dash" /> Unused</span>}
      <span><i style={{ background: BAR_COLORS.over }} /> {above}</span>
      <span><i style={{ background: BAR_COLORS.line, height: 2 }} /> Minimum</span>
    </div>
  );
}
