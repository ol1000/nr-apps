import React from 'react';
import PropTypes from 'prop-types';
import { formatGB, formatPct, STATUS_LABEL } from './lib/format';
import { STATUS_ORDER } from './lib/stats';

const PAGE_SIZE = 25;

// Light base palette: New Relic inverts nerdlet colours in its dark theme, so a light design follows the theme.
// Inline colours: New Relic's global CSS paints tables/inputs and beats stylesheet rules.
const BASE = { background: '#f9fafb', color: '#1d252c' };
const ROW_BG = { over: '#fdecec', elevated: '#fff4de' };
const INPUT = { background: '#f9fafb', color: '#1d252c', border: '1px solid #d5dae1' };
const BADGE = {
  over: { background: '#d1343a', color: '#ffffff' },
  elevated: { background: '#f0a30a', color: '#2b2100' },
  new: { background: '#5b6573', color: '#ffffff' },
  below: { background: '#2b66e0', color: '#ffffff' },
  normal: { background: '#e3f3e8', color: '#14612b' },
  idle: { background: '#e6e9ee', color: '#5b6573' }
};
const SPARK = { over: '#d1343a', elevated: '#e08a00', new: '#5b6573', below: '#2b66e0', normal: '#2b66e0', idle: '#9aa4b2' };

function Segmented({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button key={o.value} type="button" className={o.value === value ? 'seg-btn active' : 'seg-btn'} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
Segmented.propTypes = { options: PropTypes.array, value: PropTypes.string, onChange: PropTypes.func };

function Sparkline({ daily, median, windowDays, status }) {
  const w = 150;
  const h = 32;
  const max = Math.max(...daily, median, 0.0001);
  const x = i => (i / (daily.length - 1)) * (w - 4) + 2;
  const y = v => h - 3 - (v / max) * (h - 6);
  const split = daily.length - windowDays;
  const pts = (from, to) => daily.slice(from, to).map((v, i) => `${x(from + i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} role="img" aria-label="Daily ingest, last 35 days">
      <line x1="2" x2={w - 2} y1={y(median)} y2={y(median)} stroke="#9aa4b2" strokeWidth="1" strokeDasharray="3 3" />
      <polyline fill="none" stroke="#9aa4b2" strokeWidth="1.5" points={pts(0, split + 1)} />
      <polyline fill="none" stroke={SPARK[status]} strokeWidth="2.2" points={pts(split, daily.length)} />
    </svg>
  );
}
Sparkline.propTypes = { daily: PropTypes.array, median: PropTypes.number, windowDays: PropTypes.number, status: PropTypes.string };

function Bar({ value, max, color }) {
  const pct = max > 0 && value > 0 ? Math.max(3, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="bar-track">
      <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
Bar.propTypes = { value: PropTypes.number, max: PropTypes.number, color: PropTypes.string };

function Change({ pct, delta, negligible }) {
  if (pct === null || pct === undefined) return <span className="chg none">{delta === null || negligible ? '-' : 'new'}</span>;
  const dir = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  const arrow = dir === 'up' ? '↗' : dir === 'down' ? '↘' : '—';
  return (
    <span className={`chg ${dir}`}>
      {formatPct(pct, true)} {arrow}
      <span className="chg-sub">{delta >= 0 ? '+' : '−'}{formatGB(Math.abs(delta))}</span>
    </span>
  );
}
Change.propTypes = { pct: PropTypes.number, delta: PropTypes.number, negligible: PropTypes.bool };

function SortTh({ label, k, sort, onSort, align }) {
  const on = sort.key === k;
  return (
    <th style={BASE} className={`${align || ''} sortable`} onClick={() => onSort(k)}>
      {label}
      <span className={on ? 'sort-ind on' : 'sort-ind'}>{on ? (sort.dir === 'desc' ? '▼' : '▲') : '↕'}</span>
    </th>
  );
}
SortTh.propTypes = { label: PropTypes.string, k: PropTypes.string, sort: PropTypes.object, onSort: PropTypes.func, align: PropTypes.string };

export default function MonitorView(props) {
  const { rows, summary, windowDays, loading, error, filter, search, sort, page, usageAccountId,
    onFilter, onSearch, onSort, onPage, onRefresh } = props;

  const windowLabel = windowDays === 1 ? 'last 24 hours' : `last ${windowDays} days`;
  const q = search.trim().toLowerCase();
  const visible = rows.filter(r => (!q || r.name.toLowerCase().includes(q) || r.id.includes(q)) &&
    (filter === 'all' || r.status === 'over' || r.status === 'elevated' || r.status === 'new' || r.status === 'below'));

  const val = (r, k) => (k === 'status' ? STATUS_ORDER[r.status] : k === 'name' ? r.name.toLowerCase() : r[k] === null || r[k] === undefined ? -Infinity : r[k]);
  const sorted = [...visible].sort((a, b) => {
    const av = val(a, sort.key);
    const bv = val(b, sort.key);
    const c = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.dir === 'desc' ? -c : c;
  });
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const slice = sorted.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);
  const maxCur = Math.max(0, ...rows.map(r => r.cur), ...rows.map(r => r.expected));

  const attention = summary.over + summary.elevated;

  return (
    <div className="ingest">
      <div className="topbar">
        <div className="title">
          <svg className="logo" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="12" width="4" height="9" rx="1" fill="#2b66e0" />
            <rect x="10" y="7" width="4" height="14" rx="1" fill="#2b66e0" />
            <rect x="17" y="3" width="4" height="18" rx="1" fill="#d1343a" />
          </svg>
          Ingest Monitor <span className="badge">{windowLabel}</span>
        </div>
        <div className="sub">
          Usage from account {usageAccountId}
          <button type="button" className="btn" onClick={onRefresh}>⟳ Refresh</button>
        </div>
      </div>

      <div className="summary">
        <div className="card">
          <span className="card-label">Total ingest</span>
          <span className="card-value">{formatGB(summary.cur)}</span>
          <span className="card-sub">{summary.accounts} accounts</span>
        </div>
        <div className="card">
          <span className="card-label">Change vs previous {windowDays === 1 ? '24h' : `${windowDays}d`}</span>
          <span className={`card-value ${summary.changePct > 0.5 ? 'warn' : summary.changePct < -0.5 ? 'good' : ''}`}>
            {summary.changePct === null ? '-' : formatPct(summary.changePct, true)}
          </span>
          <span className="card-sub">{summary.prev === null ? '' : `was ${formatGB(summary.prev)}`}</span>
        </div>
        <div className={attention ? 'card hot' : 'card'}>
          <span className="card-label">Above expected</span>
          <span className={`card-value ${summary.over ? 'bad' : ''}`}>{summary.over}</span>
          <span className="card-sub">{summary.elevated} more elevated</span>
        </div>
      </div>

      <div className="controls">
        <Segmented
          options={[{ value: 'all', label: 'All accounts' }, { value: 'attention', label: 'Needs attention' }]}
          value={filter}
          onChange={onFilter}
        />
        <input style={INPUT} className="search" type="search" placeholder="Search account name or id" value={search} onChange={e => onSearch(e.target.value)} />
        <span className="count">
          {sorted.length} of {rows.length} accounts
          <button type="button" className="btn small" disabled={cur <= 0} onClick={() => onPage(cur - 1)}>‹</button>
          <button type="button" className="btn small" disabled={cur >= pages - 1} onClick={() => onPage(cur + 1)}>›</button>
        </span>
      </div>

      <div className="panel">
        {error ? <div className="error">Could not load usage data: {error}</div> : null}
        {loading ? <div className="loading">Loading…</div> : null}
        <table style={BASE} className={loading ? 'grid dim' : 'grid'}>
          <thead>
            <tr style={BASE}>
              <SortTh label="ACCOUNT" k="name" sort={sort} onSort={onSort} />
              <SortTh label="STATUS" k="status" sort={sort} onSort={onSort} />
              <SortTh label="INGEST" k="cur" sort={sort} onSort={onSort} align="right" />
              <SortTh label="EXPECTED" k="expected" sort={sort} onSort={onSort} align="right" />
              <SortTh label="VS EXPECTED" k="z" sort={sort} onSort={onSort} align="right" />
              <SortTh label="CHANGE" k="changePct" sort={sort} onSort={onSort} align="right" />
              <th style={BASE}>TREND (35 DAYS)</th>
            </tr>
          </thead>
          <tbody>
            {slice.map(r => {
              const cell = { background: ROW_BG[r.status] || BASE.background, color: BASE.color };
              return (
                <tr key={r.id} style={cell} className={`row-${r.status}`}>
                  <td style={cell} className="name">
                    {r.name}
                    <span className="acct-id">{r.id}</span>
                  </td>
                  <td style={cell}><span className="status" style={BADGE[r.status]}>{STATUS_LABEL[r.status]}</span></td>
                  <td style={cell} className="num">
                    <span className="n">{formatGB(r.cur)}</span>
                    <Bar value={r.cur} max={maxCur} color={r.status === 'over' ? '#d1343a' : r.status === 'elevated' ? '#e08a00' : '#2b66e0'} />
                  </td>
                  <td style={cell} className="num">
                    <span className="n muted">{formatGB(r.expected)}</span>
                    <Bar value={r.expected} max={maxCur} color="#9aa4b2" />
                  </td>
                  <td style={cell} className="num">
                    {r.status === 'new' || r.status === 'idle' || r.negligible ? (
                      <span className="muted">-</span>
                    ) : (
                      <span className={r.status === 'over' ? 'vs bad' : r.status === 'elevated' ? 'vs warn' : 'vs'}>
                        {r.excessPct === null ? '-' : formatPct(r.excessPct, true)}
                        <span className="chg-sub">{r.z >= 0 ? '+' : '−'}{Math.abs(r.z).toFixed(1)}σ</span>
                      </span>
                    )}
                  </td>
                  <td style={cell} className="num"><Change pct={r.changePct} delta={r.delta} negligible={r.negligible} /></td>
                  <td style={cell}><Sparkline daily={r.daily} median={r.median} windowDays={windowDays} status={r.status} /></td>
                </tr>
              );
            })}
            {!loading && !slice.length && !error ? (
              <tr style={BASE}><td style={BASE} colSpan={7} className="empty">{rows.length ? 'No accounts match.' : 'No usage data returned. Check that the configured account is the organisation\'s main account.'}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <div className="legend">
        Expected = median daily ingest over the 14 days before the window, scaled to the window. Dashed line = that median;
        σ = normal day-to-day spread. Over expected ≥ 4σ, Elevated ≥ 2.5σ.
      </div>
    </div>
  );
}

MonitorView.propTypes = {
  rows: PropTypes.array.isRequired,
  summary: PropTypes.object.isRequired,
  windowDays: PropTypes.number.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
  filter: PropTypes.string.isRequired,
  search: PropTypes.string.isRequired,
  sort: PropTypes.object.isRequired,
  page: PropTypes.number.isRequired,
  usageAccountId: PropTypes.number,
  onFilter: PropTypes.func,
  onSearch: PropTypes.func,
  onSort: PropTypes.func,
  onPage: PropTypes.func,
  onRefresh: PropTypes.func
};
