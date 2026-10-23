import React from 'react';
import { fmt, monthLabel } from './lib/format';
import { joinObserved, SEVERITY, windowDays, setWindow } from './lib/lint';
import { measureQuery, fetchDashboard, createDashboard } from './lib/dashboards';
import { planRewrite, buildInput, withSince, COPY_SUFFIX } from './lib/rewrite';
import DashboardsHelp from './help';

const SEV_TEXT = { high: '▲ High', medium: '● Medium', low: '○ Low' };
const PAGE_SIZE = 40;
const SEV_ICON = { high: '\u25B2', medium: '\u25CF', low: '\u25CB' };

// Columns: [key, label, numeric?, default direction]. Every one sorts.
const COLUMNS = [
  ['name', 'Dashboard', false, 'asc'], ['ccu', 'CCU used', true, 'desc'], ['runs', 'Runs', true, 'desc'],
  ['window', 'Avg window', true, 'desc'], ['risk', 'Risk score', true, 'desc'], ['why', 'Why', false, 'desc']
];
// What each column means and how it is derived (shown from the info icon in the header).
const HELP = {
  name: {
    title: 'Dashboard',
    means: 'The dashboard. Each dashboard and each of its pages is its own entry.',
    how: 'From a scan of every dashboard you can see. If a dashboard only appears in usage records (deleted, or in an account you cannot see) the name recorded with that usage is used. The grey text is its account.'
  },
  ccu: {
    title: 'CCU used',
    means: 'Core CCU this dashboard\'s queries actually consumed in the chosen usage period.',
    how: 'Sum of usage in NrComputeUsage for NRDB Queries whose dashboard ID is a dashboard, matched to the dashboard by its GUID. It only covers usage billed to the configured account, and is Core CCU only (dashboards do not use aCCU).'
  },
  runs: {
    title: 'Runs',
    means: 'How many query executions were recorded for the dashboard in the period.',
    how: 'Count of those NrComputeUsage records. One page load runs one query per widget, so this is much higher than page views. A big number with a tiny window usually means frequent refreshing or TV mode.'
  },
  window: {
    title: 'Avg window',
    means: 'The time range the dashboard\'s queries were typically run over.',
    how: 'average(untilTime) - average(sinceTime) across the usage records. It captures ranges chosen with the time picker, which the NRQL alone cannot show. Shown as minutes, hours or days.'
  },
  risk: {
    title: 'Risk score',
    means: 'One number, 0 to 100, for how likely this dashboard is to be costing CCU. 60+ is high, 30 to 59 medium, below 30 low.',
    how: 'Up to 70 from lint findings: each high finding is 10 points, medium 4, low 1, summed and curved as 70 x (1 - e^(-points/50)) so dozens of flags cannot run off the scale. Plus up to 30 from observed CCU: 30 x square root of (this dashboard\'s CCU / the biggest spender\'s CCU in the period). Hover a score to see its split.'
  },
  kpi_candidates: {
    title: 'Optimisation candidates',
    means: 'How many dashboards are worth fixing first.',
    how: 'Dashboards that used CCU in the chosen period and have at least one high or medium finding. Low findings never count. The "of N" is how many dashboards used any CCU at all in the period.'
  },
  kpi_ccu: {
    title: 'CCU in candidates',
    means: 'How much of the dashboard CCU sits in dashboards you could improve.',
    how: 'The sum of CCU used by the candidates, as a share of all dashboard CCU in the period (NrComputeUsage, NRDB queries run from dashboards). It is the ceiling on what fixing them could touch, not a promised saving. Use Measure for the real saving per query.'
  },
  kpi_biggest: {
    title: 'Biggest candidate',
    means: 'The candidate that used the most CCU.',
    how: 'The highest CCU used among the candidates in the period. The dashboard name is shown underneath.'
  },
  kpi_heavy: {
    title: 'Heavy, nothing to fix',
    means: 'Dashboards that use a lot of CCU even though nothing is wrong with their queries.',
    how: 'Not candidates, but 2% or more of all dashboard CCU in the period. Their cost comes from how often they run (auto-refresh, TV mode, integrations), so the number shown is the count and the line below is their combined CCU.'
  },
  kpi_latent: {
    title: 'Latent risk',
    means: 'Dashboards that look expensive on paper but were not used.',
    how: 'They have at least one high finding but no CCU recorded in the chosen period, so fixing them would save nothing today. Worth tidying if they come into use.'
  },
  scope: {
    title: 'Groups',
    means: 'Which dashboards the table shows.',
    how: 'Candidates: used CCU and have a high or medium finding. Heavy, nothing to fix: 2% or more of dashboard CCU but no finding to act on. Latent risk: flagged high but unused in the period. All dashboards: everything that used CCU or has a finding, low-severity included. The counts in the buttons follow the usage period.'
  },
  period: {
    title: 'Usage period',
    means: 'Which months of usage the CCU, runs and window numbers cover.',
    how: 'This month, or the last 3 or 6 months ending at the month picked at the top. Longer periods smooth out one-off spikes and show slow burners. The groups, ranking and risk score all follow it; the findings from scanning the NRQL do not change.'
  },
  measure: {
    title: 'Measure cost',
    means: 'The real CCU of a query, and of the same query over a shorter window.',
    how: 'Runs both through NerdGraph and reads rawResponse.queryUsage (CCU and events scanned), so the saving is measured, not estimated. "Over N runs seen" multiplies the per-run saving by the runs in the usage records. Each measurement costs about one dashboard load, runs only when you click, and cannot run queries that use dashboard variables.'
  },
  d_observed: {
    title: 'What it actually ran',
    means: 'The queries that used the most CCU for this dashboard in the period.',
    how: 'From the usage records, grouped by query text: CCU, runs, average window, average duration and CCU per 1,000 runs. It includes ranges chosen with the time picker, which the NRQL alone does not show.'
  },
  d_widgets: {
    title: 'Flagged widgets',
    means: 'Widgets whose NRQL has findings, worst first.',
    how: 'From scanning the dashboard\'s widgets. Each finding gives the reason and a suggested fix. The title reads "flagged of total widgets" and shows up to the worst 8.'
  },
  d_dashlevel: {
    title: 'Dashboard-level',
    means: 'Problems that belong to the whole dashboard rather than one widget.',
    how: 'A long window seen only in the usage records (the time picker is set wide when it runs), or a page with 8 or more heavy widgets that all run together when it opens.'
  },
  d_breakdown: {
    title: 'Risk score breakdown',
    means: 'How the risk score splits between how the dashboard is written and how it is used.',
    how: 'Up to 70 points from findings (high 10, medium 4, low 1, with diminishing returns) plus up to 30 from observed CCU relative to the biggest spender in the period. The counts after the dot are the findings behind the first part.'
  },
  d_whyhere: {
    title: 'Why it is here',
    means: 'Why a dashboard with no fixable query is still listed.',
    how: 'It has 2% or more of all dashboard CCU but no high or medium finding, so the cost is run frequency. The list is a checklist of the usual causes.'
  },
  why: {
    title: 'Why',
    means: 'What is making this dashboard a candidate: its most serious findings, with how many widgets each affects.',
    how: 'Found by scanning every widget\'s NRQL (and the usage records, for ranges the NRQL does not show). Only high and medium findings are listed; low ones are housekeeping. Click the row for every finding, the exact queries and a Measure button that shows the real saving.'
  }
};

const SORT_VALUE = {
  name: r => r.name.toLowerCase(),
  ccu: r => r.ccu,
  runs: r => r.runs,
  window: r => r.windowDays,
  risk: r => r.risk,
  // most serious reasons first: high, then medium
  why: r => r.counts.high * 1e6 + r.counts.medium * 1e3
};
/** Empty values always sink to the bottom, whichever way the column is sorted. */
function compareBy(key, dir) {
  const get = SORT_VALUE[key];
  const sign = dir === 'asc' ? 1 : -1;
  return (a, b) => {
    const x = get(a);
    const y = get(b);
    const xe = x === null || x === undefined || x === 0 && key === 'window';
    const ye = y === null || y === undefined || y === 0 && key === 'window';
    if (xe !== ye) return xe ? 1 : -1;
    if (x < y) return -sign;
    if (x > y) return sign;
    return (b.risk - a.risk) || (b.ccu - a.ccu) || a.name.localeCompare(b.name);
  };
}

const fmtWindow = d => {
  if (d === null || d === undefined) return '-';
  if (d >= 2) return `${d.toFixed(d >= 10 ? 0 : 1)} d`;
  if (d >= 1 / 24) return `${(d * 24).toFixed(d * 24 >= 10 ? 0 : 1)} h`;
  return `${Math.max(Math.round(d * 1440), 1)} m`;
};

const WINDOWS = [['1 hour ago', 1 / 24], ['6 hours ago', 0.25], ['1 day ago', 1], ['3 days ago', 3], ['7 days ago', 7]];
const fmtCcu = v => (v >= 0.1 ? v.toFixed(2) : v >= 0.001 ? v.toFixed(4) : v.toExponential(2));
const fmtEvents = n => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(n));

/**
 * Measure a query for real, then the same query over a shorter window, and show the verified saving per run.
 * Nothing runs until the button is clicked: each measurement costs about one dashboard load of that widget.
 */
class Measure extends React.Component {
  constructor(props) {
    super(props);
    const fixed = windowDays(props.query);
    this.current = fixed !== null ? fixed : props.windowDays;
    // default candidate: the largest standard window that is shorter than the current one
    const shorter = WINDOWS.filter(w => this.current === null || this.current === undefined || w[1] < this.current * 0.9);
    this.options = shorter.length ? shorter : WINDOWS.slice(0, 1);
    this.state = { cand: (this.options[this.options.length - 1] || WINDOWS[0])[0], status: 'idle', base: null, alt: null, error: null };
  }

  run = async () => {
    const { query, accountId } = this.props;
    // a query that follows the time picker has no SINCE: measure it over the window it was really run with
    const hours = this.current ? Math.max(Math.round(this.current * 24), 1) : null;
    const baseQuery = windowDays(query) !== null || !hours ? query : setWindow(query, `${hours} hours ago`);
    this.setState({ status: 'running', error: null });
    try {
      const [base, alt] = await Promise.all([measureQuery(accountId, baseQuery), measureQuery(accountId, setWindow(query, this.state.cand))]);
      this.setState({ status: 'done', base, alt });
    } catch (e) {
      console.error('[dashboard-optimizer] measure failed', e);
      this.setState({ status: 'error', error: (e && e.message) || String(e) });
    }
  };

  render() {
    const { status, base, alt, error, cand } = this.state;
    const { runs } = this.props;
    const saved = base && alt ? base.ccu - alt.ccu : 0;
    const pct = base && base.ccu > 0 ? (saved / base.ccu) * 100 : 0;
    if (/\{\{.*?\}\}/.test(this.props.query)) {
      return <div className="measure muted">Uses dashboard variables, so it can't be measured on its own. Open the dashboard to see its real cost.</div>;
    }
    return (
      <div className="measure">
        <label>Measure cost <InfoIcon k="measure" />, compared with{' '}
          <select value={cand} onClick={e => e.stopPropagation()} onChange={e => this.setState({ cand: e.target.value, status: 'idle' })}>
            {WINDOWS.map(([w]) => <option key={w} value={w}>SINCE {w}</option>)}
          </select>
        </label>
        <button className="btn small" onClick={this.run} disabled={status === 'running'}>{status === 'running' ? 'Measuring...' : 'Measure'}</button>
        {status === 'error' && <span className="errText"> {error}</span>}
        {status === 'done' && (
          <div className="mresult">
            <span>Now: <strong>{fmtCcu(base.ccu)} CCU</strong> ({fmtEvents(base.scanned)} events)</span>
            <span>At {cand.replace(' ago', '')}: <strong>{fmtCcu(alt.ccu)} CCU</strong> ({fmtEvents(alt.scanned)} events)</span>
            {saved > 0
              ? <span className="good">Saves {pct.toFixed(0)}% per run{runs > 0 ? `, about ${fmt(saved * runs)} CCU over the ${runs.toLocaleString()} runs seen` : ''}</span>
              : <span className="muted">No saving: the shorter window scans about the same events.</span>}
          </div>
        )}
        {status === 'idle' && <span className="muted hint"> Runs the query twice; each costs about one dashboard load.</span>}
      </div>
    );
  }
}

/** A small (i) that explains a column, card or section. Hover or keyboard-focus it; the text lives in HELP. */
class InfoIcon extends React.Component {
  constructor(props) {
    super(props);
    this.state = { pos: null };
    this.show = this.show.bind(this);
    this.hide = this.hide.bind(this);
  }

  show(e) {
    const r = e.currentTarget.getBoundingClientRect();
    this.setState({ pos: { x: r.left, y: r.bottom, top: r.top } });
  }

  hide() { this.setState({ pos: null }); }

  render() {
    const h = HELP[this.props.k];
    const { pos } = this.state;
    let tip = null;
    if (pos) {
      const width = 340;
      const left = Math.max(8, Math.min(pos.x - 8, window.innerWidth - width - 12));
      // open upwards when there is no room below
      const below = window.innerHeight - pos.y > 260;
      const style = below ? { left, top: pos.y + 6, width } : { left, bottom: window.innerHeight - pos.top + 6, width };
      tip = (
        <div className="tip infotip" role="tooltip" style={style}>
          <h3>{h.title}</h3>
          <p><strong>What it means.</strong> {h.means}</p>
          <p><strong>How it is derived.</strong> {h.how}</p>
        </div>
      );
    }
    return (
      <React.Fragment>
        <span className="info" tabIndex="0" role="img" aria-label={`About ${h.title}: ${h.means}`}
          onMouseEnter={this.show} onMouseLeave={this.hide} onFocus={this.show} onBlur={this.hide}
          onClick={e => e.stopPropagation()}>i</span>
        {tip}
      </React.Fragment>
    );
  }
}

function Sev({ level, children }) {
  return <span className={`sev ${level}`}>{children || SEV_TEXT[level]}</span>;
}

function Findings({ findings }) {
  const sorted = findings.slice().sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity]);
  return (
    <ul className="findings">
      {sorted.map(f => (
        <li key={f.rule}>
          <Sev level={f.severity} /> <strong>{f.title}</strong>
          <div className="fix">{f.why} <em>Fix: {f.fix}</em></div>
        </li>
      ))}
    </ul>
  );
}

function Detail({ row, onCopy }) {
  const shown = row.widgets.slice(0, 8);
  return (
    <div className="detail">
      <div className="block">
        {row.scanned ? (
          <React.Fragment>
            <button className="btn primary small" onClick={onCopy}>Create optimised copy...</button>
            <span className="muted hint"> Makes a new dashboard with shorter windows you choose. The original is not changed.</span>
          </React.Fragment>
        ) : (
          <span className="muted hint">Can't be copied: this dashboard is no longer in New Relic (deleted), or is in an account you can't see. It is listed only because its past usage was recorded under this name.</span>
        )}
      </div>
      {row.heavy && !row.candidate && (
        <div className="block">
          <h3>Why it is here <InfoIcon k="d_whyhere" /></h3>
          <div className="qmeta">
            No high or medium finding in its queries, but it used {fmt(row.ccu)} CCU over {row.runs.toLocaleString()} runs. When the queries are already cheap, cost comes from frequency. Things to check:
          </div>
          <ul className="findings">
            <li>Is a browser tab, wall display (TV mode) or integration refreshing it automatically? A longer refresh interval cuts runs directly.</li>
            <li>Are many widgets on the page running together? Splitting rarely-needed ones onto another page stops them running on every open.</li>
            <li>Is anyone still using it? Archive dashboards nobody opens.</li>
          </ul>
        </div>
      )}
      <div className="breakdown">
        <strong>Risk score {row.risk}</strong> <InfoIcon k="d_breakdown" /> = {row.riskStatic} from findings (up to 70) + {row.riskObserved} from observed CCU (up to 30)
        <span className="muted"> · {row.counts.high} high, {row.counts.medium} medium, {row.counts.low} low</span>
      </div>
      {((row.obsFindings && row.obsFindings.length) || (row.pageFindings && row.pageFindings.length)) > 0 && (
        <div className="block">
          <h3>Dashboard-level <InfoIcon k="d_dashlevel" /></h3>
          <Findings findings={[...(row.obsFindings || []), ...(row.pageFindings || [])]} />
        </div>
      )}
      {row.queries.length > 0 && (
        <div className="block">
          <h3>What it actually ran, top by CCU <InfoIcon k="d_observed" /></h3>
          {row.queries.map(q => (
            <div className="qrow" key={q.query}>
              <div className="qmeta">
                <strong>{fmt(q.ccu)} CCU</strong> · {q.runs.toLocaleString()} runs · {fmtWindow(q.windowDays)} window
                {q.ms ? ` · ${Math.round(q.ms).toLocaleString()} ms avg` : ''}
                {q.runs > 0 && <span className="muted"> · {fmt((q.ccu / q.runs) * 1000)} CCU per 1,000 runs</span>}
              </div>
              <code>{q.query}</code>
              {q.findings.length > 0 && <Findings findings={q.findings} />}
              <Measure query={q.query} accountId={row.accountId} runs={q.runs} windowDays={q.windowDays} />
            </div>
          ))}
        </div>
      )}
      {shown.length > 0 && (
        <div className="block">
          <h3>Flagged widgets <InfoIcon k="d_widgets" /> ({row.flaggedCount} of {row.widgetCount}){row.widgets.length > shown.length ? `, worst ${shown.length} shown` : ''}</h3>
          {shown.map((w, i) => (
            <div className="qrow" key={`${w.page}${w.title}${i}`}>
              <div className="qmeta"><strong>{w.title}</strong> <span className="muted">· {w.page}</span></div>
              <code>{w.query}</code>
              <Findings findings={w.findings} />
              <Measure query={w.query} accountId={w.accountId} />
            </div>
          ))}
        </div>
      )}
      {!row.queries.length && !shown.length && !(row.obsFindings && row.obsFindings.length) && <div className="muted pad">{row.scanned ? 'No flagged widgets and no recorded query usage.' : 'This dashboard is not in the scan (deleted, or in an account you cannot see).'}</div>}
    </div>
  );
}


const winLabel = w => w.replace(' ago', '');

/**
 * Build a cheaper copy of one dashboard. Fetches the whole dashboard, lists the widgets that look back a long way, lets the
 * user choose a shorter window for each (and measure it), then creates a NEW dashboard. Nothing is written until the final
 * confirm, and the original dashboard is never updated.
 */
class RewriteModal extends React.Component {
  constructor(props) {
    super(props);
    this.state = { status: 'loading', entity: null, plan: null, on: {}, win: {}, measure: {}, confirming: false, error: null, result: null };
  }

  async componentDidMount() {
    try {
      const entity = await fetchDashboard(this.props.row.guid);
      const plan = planRewrite(entity);
      const win = {};
      plan.widgets.forEach(w => { win[w.key] = w.suggested; });
      this.setState({ status: 'ready', entity, plan, win });
    } catch (e) {
      console.error('[dashboard-optimizer] could not read the dashboard', e);
      this.setState({ status: 'error', error: (e && e.message) || String(e) });
    }
  }

  choices() {
    const { on, win } = this.state;
    return Object.keys(on).filter(k => on[k]).reduce((a, k) => ({ ...a, [k]: win[k] }), {});
  }

  measure = async w => {
    const q = w.queries.filter(x => x.days !== null).sort((a, b) => b.days - a.days)[0];
    const to = this.state.win[w.key];
    this.setState(s => ({ measure: { ...s.measure, [w.key]: { status: 'running', to } } }));
    try {
      const [base, alt] = await Promise.all([measureQuery(q.accountId, q.query), measureQuery(q.accountId, withSince(q.query, to))]);
      this.setState(s => ({ measure: { ...s.measure, [w.key]: { status: 'done', to, base, alt } } }));
    } catch (e) {
      console.error('[dashboard-optimizer] measure failed', e);
      this.setState(s => ({ measure: { ...s.measure, [w.key]: { status: 'error', to, error: (e && e.message) || String(e) } } }));
    }
  };

  create = async () => {
    const { entity } = this.state;
    const { input } = buildInput(entity, this.choices());
    this.setState({ status: 'creating', error: null });
    try {
      const result = await createDashboard(entity.accountId, input);
      this.setState({ status: 'done', result });
    } catch (e) {
      console.error('[dashboard-optimizer] could not create the copy', e);
      this.setState({ status: 'ready', confirming: false, error: `Could not create the copy: ${(e && e.message) || e}` });
    }
  };

  body() {
    const { status, entity, plan, on, win, measure, confirming, error, result } = this.state;
    const { row, accounts } = this.props;
    if (status === 'loading') return <p className="muted">Reading the whole dashboard...</p>;
    if (status === 'error') return <p className="errText">{error}</p>;
    if (status === 'done') {
      return (
        <p>
          Created <strong>{result.name}</strong>.{' '}
          <a href={`${window.location.origin}/redirect/entity/${result.guid}`} target="_blank" rel="noopener noreferrer">Open it</a>.
          The original is unchanged.
        </p>
      );
    }
    if (plan.blocked) return <p>{plan.blocked}</p>;
    if (!plan.widgets.length) {
      return (
        <p>
          No widget on this dashboard has a long window of its own that can be shortened safely. If it still costs a lot, the range probably
          comes from the dashboard time picker, or the cost is how often it runs: set a shorter default range and check auto-refresh and TV mode.
        </p>
      );
    }
    const choices = this.choices();
    const picked = plan.widgets.filter(w => on[w.key]);
    const { changes } = buildInput(entity, choices);
    return (
      <div>
        <p>
          Creates a <strong>new</strong> dashboard called <strong>{entity.name}{COPY_SUFFIX}</strong> in {accounts[entity.accountId] || entity.accountId}.
          The only edit is the time window of the queries below. Everything else is copied as it is. Queries with variables, an UNTIL or a fixed date range are never touched.
        </p>
        <div className="rwtools">
          <button className="btn small" onClick={() => this.setState({ on: Object.fromEntries(plan.widgets.map(w => [w.key, true])) })}>Select all</button>
          <button className="btn small" onClick={() => this.setState({ on: {} })} disabled={!picked.length}>Clear</button>
          <span className="muted hint">{plan.widgets.length} widget{plan.widgets.length === 1 ? '' : 's'} look back a long way. Tick the ones to change.</span>
        </div>
        <div className="rwlist">
          {plan.widgets.map(w => {
            const m = measure[w.key];
            const saved = m && m.status === 'done' ? m.base.ccu - m.alt.ccu : 0;
            return (
              <div className="rwrow" key={w.key}>
                <label className="rwhead">
                  <input type="checkbox" checked={!!on[w.key]} onChange={e => this.setState({ on: { ...on, [w.key]: e.target.checked } })} />
                  <strong>{w.title}</strong> <span className="muted">· {w.page} · now {fmtWindow(w.current)}</span>
                </label>
                <div className="rwctl">
                  <span>Change to SINCE</span>
                  <select value={win[w.key]} onChange={e => this.setState({ win: { ...win, [w.key]: e.target.value }, measure: { ...measure, [w.key]: null } })}>
                    {w.options.map(o => <option key={o[0]} value={o[0]}>{winLabel(o[0])}</option>)}
                  </select>
                  <button className="btn small" onClick={() => this.measure(w)} disabled={m && m.status === 'running'}>{m && m.status === 'running' ? 'Measuring...' : 'Measure'}</button>
                  {m && m.status === 'error' && <span className="errText">{m.error}</span>}
                  {m && m.status === 'done' && (
                    <span>
                      {fmtCcu(m.base.ccu)} → <strong>{fmtCcu(m.alt.ccu)} CCU</strong> per run{' '}
                      {saved > 0 ? <span className="good">(saves {Math.round((saved / m.base.ccu) * 100)}%)</span> : <span className="muted">(no saving)</span>}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {error && <p className="errText">{error}</p>}
        {picked.length > 0 && (
          <details className="rwchanges">
            <summary>{picked.length} widget{picked.length === 1 ? '' : 's'} selected, {changes.length} quer{changes.length === 1 ? 'y' : 'ies'} will change. Show them.</summary>
            {changes.map((c, i) => (
              <div className="qrow" key={i}>
                <div className="qmeta"><strong>{c.title}</strong> <span className="muted">· {c.page}</span></div>
                <code>{c.from}</code>
                <code className="to">{c.to}</code>
              </div>
            ))}
          </details>
        )}
        {confirming && (
          <p className="rwconfirm">Create <strong>{entity.name}{COPY_SUFFIX}</strong> with {changes.length} changed quer{changes.length === 1 ? 'y' : 'ies'}? It is added to {accounts[entity.accountId] || entity.accountId}; nothing existing is modified.</p>
        )}
      </div>
    );
  }

  render() {
    const { status, plan, confirming } = this.state;
    const { row, onClose } = this.props;
    const hasPick = Object.keys(this.choices()).length > 0;
    const busy = status === 'creating';
    return (
      <div className="overlay" onClick={busy ? undefined : onClose}>
        <div className="modal rewrite" onClick={e => e.stopPropagation()}>
          <h2>Create optimised copy</h2>
          <p className="muted"><strong>{row.name}</strong></p>
          {this.body()}
          <div className="actions">
            <button className="btn" onClick={onClose} disabled={busy}>{status === 'done' ? 'Close' : 'Cancel'}</button>
            {status !== 'done' && plan && !plan.blocked && plan.widgets.length > 0 && (
              confirming
                ? <button className="btn primary" onClick={this.create} disabled={busy}>{busy ? 'Creating...' : 'Yes, create copy'}</button>
                : <button className="btn primary" onClick={() => this.setState({ confirming: true })} disabled={!hasPick || busy}>Create copy...</button>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default class DashboardsTab extends React.Component {
  constructor(props) {
    super(props);
    this.state = { sortKey: 'ccu', sortDir: 'desc', q: '', open: null, scope: 'candidates', limit: PAGE_SIZE, help: false, copy: null };
  }

  rows() {
    const { dash, obs } = this.props;
    if (!dash.analysed) return { all: [], list: [] };
    const joined = joinObserved(dash.analysed, obs.data);
    const q = this.state.q.trim().toLowerCase();
    const inScope = { candidates: r => r.candidate, heavy: r => r.heavy, latent: r => r.latent, all: r => r.score > 0 || r.ccu > 0 }[this.state.scope];
    const list = joined
      .filter(r => inScope(r) && (!q || r.name.toLowerCase().includes(q)))
      .sort(compareBy(this.state.sortKey, this.state.sortDir));
    return { all: joined, list };
  }

  render() {
    const { dash, obs, month, period, accounts } = this.props;
    if (dash.status === 'error') return <div className="err">Could not scan dashboards: {dash.error}</div>;
    if (dash.status !== 'done') {
      const pct = dash.total ? Math.round((dash.done / dash.total) * 100) : 0;
      return (
        <div className="card pad">
          Scanning dashboards{dash.total ? `: ${dash.done} of ${dash.total}` : '...'}
          <div className="progress"><span style={{ width: `${pct}%` }} /></div>
        </div>
      );
    }
    const { all, list } = this.rows();
    const totalCcu = all.reduce((a, r) => a + r.ccu, 0);
    const cands = all.filter(r => r.candidate);
    const candCcu = cands.reduce((a, r) => a + r.ccu, 0);
    const latent = all.filter(r => r.latent).length;
    const heavy = all.filter(r => r.heavy).length;
    const everUsed = all.filter(r => r.ccu > 0).length;
    const top = cands.slice().sort((a, b) => b.ccu - a.ccu)[0];
    const periodLabel = period === 'month' ? monthLabel(month) : period === '3m' ? `3 months to ${monthLabel(month)}` : `6 months to ${monthLabel(month)}`;
    const heavyCcu = all.filter(r => r.heavy).reduce((a, r) => a + r.ccu, 0);
    const cards = [
      { key: 'kpi_candidates', label: 'Optimisation candidates', value: String(cands.length), sub: `of ${everUsed} dashboards that used CCU`, bad: cands.length > 0 },
      { key: 'kpi_ccu', label: 'CCU in candidates', value: fmt(candCcu), sub: totalCcu > 0 ? `${Math.round((candCcu / totalCcu) * 100)}% of ${fmt(totalCcu)} dashboard CCU` : periodLabel },
      { key: 'kpi_biggest', label: 'Biggest candidate', value: top ? fmt(top.ccu) : '-', sub: top ? top.name : 'none found' },
      { key: 'kpi_heavy', label: 'Heavy, nothing to fix', value: String(heavy), sub: `${fmt(heavyCcu)} CCU, cost is run frequency` },
      { key: 'kpi_latent', label: 'Latent risk', value: String(latent), sub: 'flagged high but not used in this period' }
    ];
    const visible = list.slice(0, this.state.limit);
    const sortBy = (key, defaultDir) => this.setState(s => ({
      sortKey: key, sortDir: s.sortKey === key ? (s.sortDir === 'asc' ? 'desc' : 'asc') : defaultDir, limit: PAGE_SIZE
    }));
    if (this.state.help) return <DashboardsHelp onClose={() => this.setState({ help: false })} />;
    return (
      <div>
        {this.state.copy && <RewriteModal row={this.state.copy} accounts={accounts} onClose={() => this.setState({ copy: null })} />}
        <div className="kpis dashkpis">
          {cards.map(c => (
            <div className="card kpi" key={c.label}>
              <div className="label">{c.label} <InfoIcon k={c.key} /></div>
              <div className="value">{c.value}</div>
              <div className={`sub${c.bad ? ' up' : ''}`} title={c.sub}>{c.sub}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="toolbar">
            <h2>{{ candidates: 'Optimisation candidates', heavy: 'Heavy spenders, nothing to fix', latent: 'Latent risk', all: 'All dashboards' }[this.state.scope]}</h2>
            <input type="search" placeholder="Filter dashboards..." value={this.state.q} onChange={e => this.setState({ q: e.target.value, limit: PAGE_SIZE })} />
            <span className="spacer" />
            <button className="btn small" onClick={() => this.setState({ help: true })}>How this works</button>
            <label className="hint">Usage period <InfoIcon k="period" />{' '}
              <select value={period} onChange={e => this.props.onPeriod(e.target.value)}>
                <option value="month">{monthLabel(month)}</option>
                <option value="3m">Last 3 months</option>
                <option value="6m">Last 6 months</option>
              </select>
            </label>
            <InfoIcon k="scope" />
            <div className="seg" role="group" aria-label="Show">
              {[['candidates', `Candidates (${cands.length})`], ['heavy', `Heavy, nothing to fix (${heavy})`], ['latent', `Latent risk (${latent})`], ['all', 'All dashboards']].map(([k, t]) => (
                <button key={k} aria-pressed={this.state.scope === k} onClick={() => this.setState({ scope: k, limit: PAGE_SIZE })}>{t}</button>
              ))}
            </div>
          </div>
          <p className="scopenote">{{
            candidates: 'Dashboards that used CCU in this period and have at least one high or medium finding, biggest spenders first. Click a row to see why and measure the saving.',
            heavy: 'Big spenders with nothing wrong in their queries (2% or more of all dashboard CCU). The cost is how often they run, so look at auto-refresh, TV mode, integrations polling them, and whether they are still needed.',
            latent: 'Flagged high but with no CCU recorded in this period, so fixing them saves nothing today. Worth tidying if they get used.',
            all: 'Every dashboard that used CCU or has a finding, including low-severity housekeeping.'
          }[this.state.scope]}</p>
          {obs.status === 'error' && <div className="err">Could not load usage: {obs.error}</div>}
          {obs.status === 'loading' && <div className="muted pad">Loading observed usage...</div>}
          <table>
            <thead>
              <tr>
                {COLUMNS.map(([key, label, numeric, dir]) => {
                  const active = this.state.sortKey === key;
                  return (
                    <th key={key} className={`sortable${numeric ? ' num' : ''}${active ? ' active' : ''}`}
                      aria-sort={active ? (this.state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      title={`Sort by ${label}`}>
                      <div className="hd">
                        <button className="sorter" onClick={() => sortBy(key, dir)}>
                          {label}<span className="arrow">{active ? (this.state.sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u2195'}</span>
                        </button>
                        <InfoIcon k={key} />
                      </div>
                    </th>
                  );
                })}
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map(r => {
                const open = this.state.open === r.guid;
                return (
                  <React.Fragment key={r.guid}>
                    <tr className={`user dashrow${open ? ' open' : ''}${r.candidate ? ' candidate' : ''}${r.heavy && !r.candidate ? ' heavy' : ''}`} onClick={() => this.setState({ open: open ? null : r.guid })}>
                      <td className="who dname" title={r.name}>
                        <span className="caret">{open ? '▾' : '▸'}</span> {r.name}
                        <span className="muted"> · {accounts[r.accountId] || r.accountId}</span>
                      </td>
                      <td className="num">{r.ccu > 0 ? fmt(r.ccu) : '-'}</td>
                      <td className="num">{r.runs ? r.runs.toLocaleString() : '-'}</td>
                      <td className="num">{fmtWindow(r.windowDays)}</td>
                      <td className="num riskscore" title={`Static ${r.riskStatic}/70 + observed ${r.riskObserved}/30`}>
                        <Sev level={r.band}>{`${SEV_ICON[r.band]} ${r.risk}`}</Sev>
                      </td>
                      <td className="why">
                        {r.topIssues.slice(0, 2).map(i => (
                          <div key={i.title} className="whyline" title={i.fix}>
                            <Sev level={i.severity}>{SEV_ICON[i.severity]}</Sev> {i.title}{i.count > 1 ? <span className="muted"> ({i.count} widgets)</span> : null}
                          </div>
                        ))}
                        {r.topIssues.length > 2 && <div className="muted whyline">+{r.topIssues.length - 2} more</div>}
                        {!r.topIssues.length && !r.heavyNote && <span className="muted">nothing significant</span>}
                        {r.heavyNote && !r.candidate && (
                          <div className="whyline">
                            <Sev level="medium">{'\u25CF'}</Sev> Runs a lot, queries are fine
                            <span className="muted"> ({r.runs.toLocaleString()} runs{r.heavyNote.perDay ? `, about ${fmt(r.heavyNote.perDay)} a day` : ''}{r.heavyNote.per1000 ? `, ${fmt(r.heavyNote.per1000)} CCU per 1,000 runs` : ''})</span>
                          </div>
                        )}
                      </td>
                      <td><a href={r.permalink || `${window.location.origin}/redirect/entity/${r.guid}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>Open</a></td>
                    </tr>
                    {open && <tr className="detailrow"><td colSpan="7"><Detail row={r} onCopy={() => this.setState({ copy: r })} /></td></tr>}
                  </React.Fragment>
                );
              })}
              {!visible.length && <tr><td colSpan="7" className="muted pad">{this.state.scope === 'candidates' ? 'No candidates found for this period.' : 'No dashboards match.'}</td></tr>}
            </tbody>
          </table>
          {list.length > visible.length && (
            <div className="more"><button className="btn small" onClick={() => this.setState(s => ({ limit: s.limit + PAGE_SIZE }))}>Show {Math.min(PAGE_SIZE, list.length - visible.length)} more ({list.length - visible.length} left)</button></div>
          )}
          <div className="note">
            <div>A candidate used CCU in the chosen period and has a high or medium finding. Only things that change how many events a query scans are flagged: a long time window, FACET (doubles the scan), COMPARE WITH, raw events where a metric would do, and pages crowded with heavy widgets. Filters, LIMIT, SELECT * and the like are measured to change nothing, so they are never flagged.</div>
            <div>Risk score runs 0-100: up to 70 from findings (high 10, medium 4, low 1 points, with diminishing returns) plus up to 30 from CCU used relative to the biggest spender. Measure any query to see its real cost. A big spender with nothing wrong in its queries, such as one running cheap queries very often, is listed under Heavy, nothing to fix.</div>
          </div>
        </div>
      </div>
    );
  }
}

