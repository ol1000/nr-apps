import React from 'react';
import { Sparkline, LookbackBars, HistoryChart } from './charts';
import { LABEL, fmt, pct, monthLabel, monthShort, budgetNum, STATUS, statusOf } from './lib/format';
import { userHistory } from './lib/data';

const prevMonthKey = m => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7);
};

function Kpis({ view, side, perUser, total }) {
  const d = view;
  const s = d.metrics[side];
  const label = LABEL[side];
  const users = s.users.filter(u => u.total > 0);
  const delta = s.prevAttributed ? ((d.isCurrent ? s.projectedAttributed : s.attributed) - s.prevAttributed) / s.prevAttributed : null;
  const top3 = users.slice(0, 3).reduce((a, u) => a + u.total, 0);
  const over = perUser ? users.filter(u => u.total >= perUser).length : null;
  const pace = perUser && d.isCurrent ? users.filter(u => u.total < perUser && u.projected >= perUser).length : 0;
  let usedSub;
  if (total) usedSub = `${pct(s.attributed / total)} of ${fmt(total)} budget`;
  else if (delta === null) usedSub = 'no prior month';
  else usedSub = `${delta >= 0 ? '▲' : '▼'} ${pct(Math.abs(delta))} ${d.isCurrent ? 'pace ' : ''}vs ${monthShort(prevMonthKey(d.month))}`;
  const cards = [
    { label: `${label} by users`, value: fmt(s.attributed), sub: usedSub, bad: total && s.attributed >= total },
    {
      label: d.isCurrent ? 'Projected month-end' : 'Month total',
      value: fmt(s.projectedAttributed),
      sub: total ? (s.projectedAttributed > total ? '▲ projected over total budget' : 'within total budget') : `${users.length} active users`,
      bad: total && s.projectedAttributed > total
    },
    {
      label: 'Over budget',
      value: over === null ? '-' : String(over),
      sub: over === null ? 'set a budget' : pace ? `+${pace} on pace to exceed` : `of ${users.length} users`,
      bad: over > 0
    },
    { label: 'Top 3 share', value: s.attributed ? pct(top3 / s.attributed) : '-', sub: users[0] ? users[0].email : '' },
    { label: 'Active CCU', value: fmt(s.unattributed ? s.unattributed.total : 0), sub: 'not tied to a user' }
  ];
  return (
    <div className="kpis">
      {cards.map(c => (
        <div className="card kpi" key={c.label}>
          <div className="label">{c.label}</div>
          <div className="value">{c.value}</div>
          <div className={`sub${c.bad ? ' up' : ''}`}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

function Delta({ now, prev }) {
  if (!prev) return <td className="num">{now > 0 ? 'new' : '-'}</td>;
  const d = (now - prev) / prev;
  return <td className={`num ${d > 0 ? 'up' : 'down'}`}>{d > 0 ? '▲' : '▼'} {pct(Math.abs(d))}</td>;
}

const ACTIVE_CCU = 'Active CCU';

function UserRow({ u, i, view, perUser, scale, onTip, onLeave, isPaused, onPause, onResume }) {
  const system = !!u.system;
  const st = system ? null : statusOf(u.total, u.projected, perUser, view.isCurrent);
  const p = perUser && !system ? u.total / perUser : null;
  const compare = view.isCurrent ? u.projected : u.total;
  return (
    <tr className={`user${system ? ' system' : ''}${st === 'over' && !isPaused ? ' flash' : ''}${isPaused ? ' paused' : ''}`}>
      <td className="rank">{i + 1}</td>
      <td className="who">{system ? ACTIVE_CCU : u.email}</td>
      <td className="barcell" onMouseMove={e => onTip(e, u)} onMouseLeave={onLeave}>
        <div className="bar"><span style={{ width: `${Math.min(u.total / scale, 1) * 100}%`, background: st === 'over' ? 'var(--crit)' : system ? 'var(--system)' : undefined }} /></div>
      </td>
      <td className="num">{fmt(u.total)}</td>
      <td className="num">
        {p !== null && `${pct(p)} `}
        {st && <span className={`tag ${STATUS[st].tone}`}>{STATUS[st].text}</span>}
      </td>
      <td className="num">{fmt(u.projected)}</td>
      <Delta now={compare} prev={u.prevTotal} />
      <td><Sparkline values={u.daily} /></td>
      <td className="access">
        {!system && (isPaused
          ? <span><span className="tag paused">Paused</span> <button className="btn small" onClick={() => onResume(u)}>Restore access</button></span>
          : <button className="btn small danger" onClick={() => onPause(u)} disabled={!u.email}>Pause access</button>)}
      </td>
    </tr>
  );
}

function Tooltip({ tip, side, month, months, datas }) {
  if (!tip) return null;
  const w = 330;
  let left = tip.x + 14;
  let top = tip.y + 14;
  if (left + w > window.innerWidth - 8) left = tip.x - w - 14;
  if (top + 380 > window.innerHeight) top = Math.max(8, window.innerHeight - 388);
  const label = LABEL[side];
  let body;
  if (tip.kind === 'month') {
    const r = tip.row;
    body = (
      <div>
        <h3>{monthLabel(r.month)}</h3>
        <div className="tot">{fmt(r[side].attributed)} {label} named users ({r[side].users} users)</div>
        <div className="tot">{fmt(r[side].unattributed)} {label} Active CCU (not tied to a user)</div>
      </div>
    );
  } else {
    const u = tip.user;
    const shown = u.products.slice(0, 7);
    const rest = u.products.slice(7).reduce((a, p) => a + p.value, 0);
    if (rest > 0) shown.push({ name: `${u.products.length - 7} other products`, value: rest });
    const max = Math.max(...shown.map(p => p.value), 1e-9);
    const hist = u.key ? userHistory(u.key, months, datas) : [];
    body = (
      <div>
        <h3>{u.system ? ACTIVE_CCU : u.email}</h3>
        <div className="tot">{fmt(u.total)} {label} in {monthLabel(month)}, by product</div>
        {!shown.length && <div className="tot">No usage this month.</div>}
        {shown.map(p => (
          <div className="prow" key={p.name}>
            <span className="n" title={p.name}>{p.name}</span>
            <div className="pbar"><div style={{ width: `${(p.value / max) * 100}%` }} /></div>
            <span className="v">{fmt(p.value)} · {pct(p.value / u.total)}</span>
          </div>
        ))}
        <div className="lb">
          Last {hist.length} months
          <LookbackBars values={hist.map(h => h[side])} months={hist.map(h => h.month)} selected={month} />
        </div>
      </div>
    );
  }
  return <div className="tip" style={{ left, top }}>{body}</div>;
}

function ConfirmModal({ confirm, onConfirm, onCancel }) {
  const { kind, email, busy, error } = confirm;
  const pause = kind === 'pause';
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{pause ? 'Pause access' : 'Restore access'}</h2>
        <p><strong>{email}</strong></p>
        <p>{pause ? 'This user will be marked as paused and their row will turn red.' : 'This user will be marked as active again.'}</p>
        {error && <p className="errText">{error}</p>}
        <div className="actions">
          <button className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button className={`btn ${pause ? 'danger-solid' : 'primary'}`} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working...' : pause ? 'Pause access' : 'Restore access'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BudgetModal({ draft, onChange, onSave, onCancel, text }) {
  const field = (side, f, label) => (
    <label>{label}
      <input type="number" min="0" step="any" value={draft[side][f]} onChange={e => onChange(side, f, e.target.value)} />
    </label>
  );
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Monthly budgets</h2>
        <p>The per-user budget applies to every user. Leave blank for no budget. Saved to this account, so everyone who opens the app sees it.</p>
        <strong>CCU</strong>
        {field('core', 'perUser', 'Per user')}
        {field('core', 'total', 'All users combined')}
        <strong>aCCU</strong>
        {field('adv', 'perUser', 'Per user')}
        {field('adv', 'total', 'All users combined')}
        {text && <p className="saveText">{text}</p>}
        <div className="actions">
          <button className="btn" onClick={onCancel}>Close</button>
          <button className="btn primary" onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

export default function CcuView(props) {
  const { accountName, accountId, side, months, datas, history, view, month, budget, search, hideZero, tip, error, loading, source, paused } = props;
  const label = LABEL[side];
  const perUser = budgetNum(budget[side].perUser);
  const total = budgetNum(budget[side].total);
  const s = view ? view.metrics[side] : null;

  let rows = [];
  let scale = 1;
  if (s) {
    const q = search.trim().toLowerCase();
    const isPaused = u => !!(u.email && paused[u.email.toLowerCase()]);
    const match = u => !q || (u.email || '').toLowerCase().includes(q);
    rows = s.users.filter(u => (!hideZero || u.total > 0 || isPaused(u)) && match(u));
    const active = s.unattributed && { ...s.unattributed, email: ACTIVE_CCU, system: true };
    if (active && (!hideZero || active.total > 0) && match(active)) rows.push(active);
    rows.sort((a, b) => b.total - a.total);
    // a paused user has no usage left, so they may not be in this month's list at all; keep them reachable to Resume
    const listed = new Set(s.users.map(u => (u.email || '').toLowerCase()));
    Object.keys(paused).filter(k => !listed.has(k) && match(paused[k])).forEach(k => {
      rows.push({ key: k, email: paused[k].email, total: 0, prevTotal: 0, projected: 0, products: [], daily: [] });
    });
    scale = perUser || Math.max(...rows.map(u => u.total), 1e-9);
  }
  const notes = view && [
    'Per-user figures come from NrComputeUsage and exclude raw-unit compute types that are not CCU (Cloud Rule processing, New Relic AI Tokens, and pre-June-2026 Entity Lookups/Relationships/Writes and NRDB Queries on aCCU).',
    "Compute with no user attached (Synthetics, alert conditions, etc.) is shown as Active CCU, ranked alongside the users. It is not a user, so it has no budget flag and no access button.",
    view.isCurrent && `Month-end pace is a straight-line projection from ${view.daysElapsed.toFixed(1)} elapsed days; it is noisy early in the month and for spiky users.`,
    view.truncated && 'Warning: the query hit the 5,000-row facet limit; some small rows are missing.',
    source === 'browser' && 'Budgets are stored in this browser only (account storage was not available).'
  ].filter(Boolean);

  return (
    <div className={`ccu ${side}`}>
      <header className="topbar">
        <div className="brand">
          <h1>CCU Tracker <small>{accountName} · {accountId}</small></h1>
        </div>
        <div className="controls">
          <select value={month} onChange={e => props.onMonth(e.target.value)} aria-label="Month">
            {months.slice().reverse().map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          {(
            <div className="seg" role="group" aria-label="Metric">
              {['core', 'adv'].map(k => (
                <button key={k} aria-pressed={side === k} onClick={() => props.onSide(k)}>{LABEL[k]}</button>
              ))}
            </div>
          )}
          <span className="divider" />
          <button className="btn" onClick={props.onBudget}>Budget...</button>
          <button className="btn" onClick={props.onCsv} disabled={!view}>Export CSV</button>
          <button className="btn" onClick={props.onRefresh}>Refresh</button>
        </div>
      </header>

      {error && <div className="err">Error: {error}</div>}
      {props.notice && (
        <div className={`notice ${props.notice.tone}`} role="status">
          <span>{props.notice.text}</span>
          <button className="btn small" onClick={props.onDismissNotice}>Dismiss</button>
        </div>
      )}
      {loading && !view && <div className="muted pad">Loading usage from {accountName}...</div>}

      <React.Fragment>
      <div className="top">

      {history && (
        <div className="card section chart">
          <h2>Lookback, named users <span className="hint">click a bar to open that month</span></h2>
          <div className="legend">
            <span><i style={{ background: 'var(--series)' }} />Named users ({label})</span>
            {total && <span><i className="dash" />Total budget (users)</span>}
          </div>
          <HistoryChart rows={history} side={side} budgetTotal={total} selected={month}
            onSelect={props.onMonth} onHover={props.onMonthTip} onLeave={props.onLeave} />
        </div>
      )}
        {view && <Kpis view={view} side={side} perUser={perUser} total={total} />}
      </div>

      {view && (
        <div className="card">
          <div className="toolbar">
            <h2>{label} by user, {monthLabel(month)}</h2>
            <input type="search" placeholder="Filter users..." value={search} onChange={e => props.onSearch(e.target.value)} />
            <span className="spacer" />
            <label className="hint"><input type="checkbox" checked={hideZero} onChange={e => props.onHideZero(e.target.checked)} /> hide zero usage</label>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th><th>User</th><th>Usage vs {perUser ? `budget (${fmt(perUser)})` : 'top row'}</th>
                <th className="num">Used</th><th className="num">% budget</th>
                <th className="num">{view.isCurrent ? 'Month-end pace' : 'Month total'}</th>
                <th className="num">{view.isCurrent ? 'Pace vs last month' : 'vs prior month'}</th><th>Daily</th><th>Access</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u, i) => (
                <UserRow key={u.key} u={u} i={i} view={view} perUser={perUser} scale={scale} onTip={props.onUserTip} onLeave={props.onLeave}
                  isPaused={!u.system && !!(u.email && paused[u.email.toLowerCase()])} onPause={props.onPauseAsk} onResume={props.onResumeAsk} />
              ))}
              {!rows.length && <tr><td colSpan="9" className="muted pad">No users with usage this month.</td></tr>}
            </tbody>
          </table>
          <div className="note">{notes.map(n => <div key={n}>{n}</div>)}</div>
        </div>
      )}
      </React.Fragment>

      <Tooltip tip={tip} side={side} month={month} months={months} datas={datas} />
      {props.confirm && <ConfirmModal confirm={props.confirm} onConfirm={props.onConfirm} onCancel={props.onCancelConfirm} />}
      {props.budgetOpen && (
        <BudgetModal draft={props.draft} onChange={props.onDraft} onSave={props.onSaveBudget} onCancel={props.onCloseBudget} text={props.saveText} />
      )}
    </div>
  );
}
