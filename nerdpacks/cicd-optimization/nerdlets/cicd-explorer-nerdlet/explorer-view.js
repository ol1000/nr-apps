import React from 'react';
import PropTypes from 'prop-types';
import { formatCount, formatPct, formatDuration, formatChange } from './lib/format';
import { GROUPS } from './lib/queries';

const PAGE_SIZE = 20;

// Light base palette: New Relic inverts nerdlet colours in its dark theme, so a light design follows the theme.
// Inline colours: New Relic's global CSS paints tables/inputs and beats stylesheet rules.
const CELL = { background: '#f9fafb', color: '#1d252c' };
const INPUT = { background: '#f9fafb', color: '#1d252c', border: '1px solid #d5dae1' };

const BRANCH_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'others', label: 'Others' },
  { value: 'all', label: 'All' }
];
const MODE_OPTIONS = [
  { value: 'values', label: '# Values' },
  { value: 'rates', label: '% Rates' },
  { value: 'combined', label: '▥ Combined' }
];
const EXTRA_COLUMNS = [
  { key: 'rate', label: 'Failure rate' },
  { key: 'p95', label: 'p95 duration' },
  { key: 'avg', label: 'Avg duration' }
];

function Segmented({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          className={o.value === value ? 'seg-btn active' : 'seg-btn'}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
Segmented.propTypes = {
  options: PropTypes.array.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired
};

function GitlabIcon() {
  return (
    <svg className="repo-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 22 2.8 14.7 4.7 7.4 7.2 12.5h9.6l2.5-5.1 1.9 7.3z" fill="#9b9ba8" />
    </svg>
  );
}

// GitLab tanuki mark (brand orange) for the page header.
function GitlabLogo() {
  return (
    <svg className="gitlab-logo" viewBox="0 0 24 24" role="img" aria-label="GitLab">
      <path
        fill="#FC6D26"
        d="m23.6004 9.5927-.0337-.0862L20.3.9814a.851.851 0 0 0-.3362-.405.8748.8748 0 0 0-.9997.0539.8748.8748 0 0 0-.29.4399l-2.2055 6.748H7.5375l-2.2057-6.748a.8573.8573 0 0 0-.29-.4412.8748.8748 0 0 0-.9997-.0537.8585.8585 0 0 0-.3362.4049L.4332 9.5015l-.0325.0862a6.0657 6.0657 0 0 0 2.0119 7.0105l.0113.0087.03.0213 4.976 3.7264 2.462 1.8633 1.4995 1.1321a1.0085 1.0085 0 0 0 1.2197 0l1.4995-1.1321 2.4619-1.8633 5.006-3.7489.0125-.01a6.0682 6.0682 0 0 0 2.0094-7.003z"
      />
    </svg>
  );
}

// A number with a proportional bar underneath, as in the CI explorer table.
function BarCell({ text, value, max, tone }) {
  const pct = max > 0 && value > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="bar-cell">
      <span className="bar-num">{text}</span>
      <div className="bar-track">
        <div className={`bar-fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
BarCell.propTypes = {
  text: PropTypes.string,
  value: PropTypes.number,
  max: PropTypes.number,
  tone: PropTypes.string
};

function ChangeCell({ current, previous }) {
  const c = formatChange(current, previous);
  const arrow = c.direction === 'up' ? '↗' : c.direction === 'down' ? '↘' : c.direction === 'flat' ? '—' : '';
  return <span className={`change ${c.direction}`}>{`${c.text} ${arrow}`.trim()}</span>;
}
ChangeCell.propTypes = { current: PropTypes.number, previous: PropTypes.number };

function SortHeader({ label, sortKey, sort, onSort, align }) {
  const active = sort.key === sortKey;
  return (
    <th style={CELL} className={`${align || ''} sortable`} onClick={() => onSort(sortKey)}>
      {label}
      <span className={active ? 'sort-ind on' : 'sort-ind'}>{active ? (sort.dir === 'desc' ? '▼' : '▲') : '↕'}</span>
    </th>
  );
}
SortHeader.propTypes = {
  label: PropTypes.string,
  sortKey: PropTypes.string,
  sort: PropTypes.object,
  onSort: PropTypes.func,
  align: PropTypes.string
};

export default function ExplorerView(props) {
  const {
    rows, loading, error, groupKey, branch, search, mode, sort, page, extraCols, showColumnsMenu,
    onGroup, onBranch, onSearch, onMode, onSort, onPage, onToggleCol, onToggleColumnsMenu, onRefresh
  } = props;

  const group = GROUPS[groupKey] || GROUPS.repository;
  const sorted = [...rows].sort((a, b) => {
    const av = a[sort.key] === null || a[sort.key] === undefined ? -Infinity : a[sort.key];
    const bv = b[sort.key] === null || b[sort.key] === undefined ? -Infinity : b[sort.key];
    if (sort.key === 'name') return sort.dir === 'desc' ? String(b.name).localeCompare(a.name) : String(a.name).localeCompare(b.name);
    return sort.dir === 'desc' ? bv - av : av - bv;
  });

  const total = sorted.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const slice = sorted.slice(cur * PAGE_SIZE, cur * PAGE_SIZE + PAGE_SIZE);
  const from = total ? cur * PAGE_SIZE + 1 : 0;
  const to = Math.min(total, (cur + 1) * PAGE_SIZE);

  const sumExec = rows.reduce((s, r) => s + r.executions, 0);
  const sumFail = rows.reduce((s, r) => s + r.failures, 0);
  const maxExec = Math.max(0, ...rows.map(r => r.executions));
  const maxFail = Math.max(0, ...rows.map(r => r.failures));
  const maxMed = Math.max(0, ...rows.map(r => r.median || 0));
  const maxP95 = Math.max(0, ...rows.map(r => r.p95 || 0));
  const maxAvg = Math.max(0, ...rows.map(r => r.avg || 0));

  const showRate = extraCols.indexOf('rate') >= 0;
  const showP95 = extraCols.indexOf('p95') >= 0;
  const showAvg = extraCols.indexOf('avg') >= 0;

  const execText = r => {
    const share = sumExec ? (r.executions / sumExec) * 100 : 0;
    if (mode === 'rates') return formatPct(share);
    if (mode === 'combined') return `${formatCount(r.executions)} · ${formatPct(share)}`;
    return formatCount(r.executions);
  };
  const failText = r => {
    if (mode === 'rates') return formatPct(r.rate);
    if (mode === 'combined') return `${formatCount(r.failures)} · ${formatPct(r.rate)}`;
    return formatCount(r.failures);
  };

  return (
    <div className="cicd">
      <div className="topbar">
        <div className="title">
          <GitlabLogo />
          CI/CD Optimization <span className="badge">Explorer</span>
        </div>
        <button type="button" className="btn" onClick={onRefresh} title="Refresh">
          ⟳ Refresh
        </button>
      </div>

      <div className="controls">
        <div className="ctl">
          <span className="ctl-label">Group by</span>
          <Segmented
            options={Object.keys(GROUPS).map(k => ({ value: k, label: GROUPS[k].label }))}
            value={groupKey}
            onChange={onGroup}
          />
        </div>
        <div className="ctl">
          <span className="ctl-label">Branches</span>
          <Segmented options={BRANCH_OPTIONS} value={branch} onChange={onBranch} />
        </div>
        <input
          style={INPUT}
          className="search"
          type="search"
          placeholder="Search by repository"
          value={search}
          onChange={e => onSearch(e.target.value)}
        />
      </div>

      <div className="summary">
        <div className="card">
          <span className="card-label">Executions</span>
          <span className="card-value">{formatCount(sumExec)}</span>
        </div>
        <div className="card">
          <span className="card-label">Failures</span>
          <span className="card-value bad">{formatCount(sumFail)}</span>
        </div>
        <div className="card">
          <span className="card-label">Failure rate</span>
          <span className="card-value">{formatPct(sumExec ? (sumFail / sumExec) * 100 : 0)}</span>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div className="count">
            {total ? `${from}–${to} of ${total} ${group.noun}` : `0 ${group.noun}`}
            <span className="pager">
              <button type="button" className="btn small" disabled={cur <= 0} onClick={() => onPage(cur - 1)}>‹</button>
              <button type="button" className="btn small" disabled={cur >= pages - 1} onClick={() => onPage(cur + 1)}>›</button>
            </span>
          </div>
          <Segmented options={MODE_OPTIONS} value={mode} onChange={onMode} />
          <div className="columns-wrap">
            <button type="button" className="btn" onClick={onToggleColumnsMenu}>▥ Columns</button>
            {showColumnsMenu ? (
              <div className="columns-menu">
                {EXTRA_COLUMNS.map(c => (
                  <label key={c.key}>
                    <input type="checkbox" checked={extraCols.indexOf(c.key) >= 0} onChange={() => onToggleCol(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {error ? <div className="error">Could not load data: {error}</div> : null}
        {loading ? <div className="loading">Loading…</div> : null}

        <table style={CELL} className={loading ? 'grid dim' : 'grid'}>
          <thead>
            <tr style={CELL} className="group-row">
              <th style={CELL} colSpan={3} />
              <th style={CELL} colSpan={2} className="group-title">MEDIAN DURATION</th>
              {showRate || showP95 || showAvg ? <th style={CELL} colSpan={Number(showRate) + Number(showP95) + Number(showAvg)} className="group-title">MORE</th> : null}
            </tr>
            <tr style={CELL}>
              <SortHeader label={group.label.toUpperCase()} sortKey="name" sort={sort} onSort={onSort} />
              <SortHeader label="EXECUTIONS" sortKey="executions" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="FAILURES" sortKey="failures" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="VALUE" sortKey="median" sort={sort} onSort={onSort} align="right" />
              <SortHeader label="CHANGE" sortKey="change" sort={sort} onSort={onSort} align="right" />
              {showRate ? <SortHeader label="FAILURE RATE" sortKey="rate" sort={sort} onSort={onSort} align="right" /> : null}
              {showP95 ? <SortHeader label="P95" sortKey="p95" sort={sort} onSort={onSort} align="right" /> : null}
              {showAvg ? <SortHeader label="AVG" sortKey="avg" sort={sort} onSort={onSort} align="right" /> : null}
            </tr>
          </thead>
          <tbody>
            {slice.map(r => (
              <tr style={CELL} key={r.name}>
                <td style={CELL} className="name"><GitlabIcon />{r.name}</td>
                <td style={CELL}><BarCell text={execText(r)} value={r.executions} max={maxExec} tone="blue" /></td>
                <td style={CELL}><BarCell text={failText(r)} value={r.failures} max={maxFail} tone="red" /></td>
                <td style={CELL}><BarCell text={formatDuration(r.median)} value={r.median || 0} max={maxMed} tone="blue" /></td>
                <td style={CELL} className="right"><ChangeCell current={r.median} previous={r.prevMedian} /></td>
                {showRate ? <td style={CELL}><BarCell text={formatPct(r.rate)} value={r.rate} max={100} tone="red" /></td> : null}
                {showP95 ? <td style={CELL}><BarCell text={formatDuration(r.p95)} value={r.p95 || 0} max={maxP95} tone="blue" /></td> : null}
                {showAvg ? <td style={CELL}><BarCell text={formatDuration(r.avg)} value={r.avg || 0} max={maxAvg} tone="blue" /></td> : null}
              </tr>
            ))}
            {!loading && !slice.length && !error ? (
              <tr style={CELL}><td style={CELL} colSpan={9} className="empty">No pipeline executions in this time range. Widen the time picker (e.g. Last 24 hours) or change the filters.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

ExplorerView.propTypes = {
  rows: PropTypes.array.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string,
  groupKey: PropTypes.string.isRequired,
  branch: PropTypes.string.isRequired,
  search: PropTypes.string,
  mode: PropTypes.string.isRequired,
  sort: PropTypes.object.isRequired,
  page: PropTypes.number.isRequired,
  extraCols: PropTypes.array.isRequired,
  showColumnsMenu: PropTypes.bool,
  onGroup: PropTypes.func,
  onBranch: PropTypes.func,
  onSearch: PropTypes.func,
  onMode: PropTypes.func,
  onSort: PropTypes.func,
  onPage: PropTypes.func,
  onToggleCol: PropTypes.func,
  onToggleColumnsMenu: PropTypes.func,
  onRefresh: PropTypes.func
};
