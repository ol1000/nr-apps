import React from 'react';
import { METRICS, buildMonths, commitFor, rateOf } from './lib/contract';
import { monthLabel, formatNum } from './lib/format';
import InfoTip from './info-tip';
import { TIPS } from './lib/tips';

// Inline colours: New Relic's global CSS paints inputs/tables and beats stylesheet rules.
const FIELD = { background: '#f9fafb', color: '#1d252c', border: '1px solid #d5dae1' };

const PLANS = [
  { value: 'volume', title: 'Volume Plan', text: 'Minimum monthly volumes per metric at a plan rate. Overage (usage above a minimum) is billed each month at the overage rate; an optional prepaid top-up is applied as credit against those bills.' },
  { value: 'savings', title: 'Savings Plan', text: 'The same minimum monthly volumes. The minimums draw down the deal value; overage is covered by the prepaid top-up, then billed as pay-as-you-go.' }
];

export default function SetupPanel({ draft, missingMonths, saveState, onChange, onSave, onReset }) {
  const months = buildMonths(draft.termStart, draft.termEnd);
  const years = Math.max(1, Math.ceil(months.length / 12));
  const savings = draft.plan === 'savings';
  const cur = draft.deal.currency;
  const set = patch => onChange({ ...draft, ...patch });
  const setMetric = (key, patch) => set({ metrics: { ...draft.metrics, [key]: { ...draft.metrics[key], ...patch } } });
  const setList = (list, i, value) => {
    const out = [...(list || [])];
    while (out.length < years) out.push('');
    out[i] = value;
    return out;
  };
  const setRate = (key, field, value) => set({ rates: { ...draft.rates, [key]: { ...draft.rates[key], [field]: value } } });
  const setOverride = (mk, key, value) => set({ overrides: { ...draft.overrides, [mk]: { ...(draft.overrides[mk] || {}), [key]: value } } });
  const enabled = METRICS.filter(m => draft.metrics[m.key].enabled);
  const num = (v, fn) => fn(v === '' ? '' : Number(v));
  const yearHeads = Array.from({ length: years }, (_, i) => i);

  // value implied by the minimums: sum of monthly minimum x plan rate over every month of the term
  const implied = months.reduce((s, mo) => s + METRICS.reduce((t, m) => t + (draft.metrics[m.key].enabled ? commitFor(draft.metrics[m.key].commits, mo.cy) * rateOf(draft, m.key, 'plan') : 0), 0), 0);

  return (
    <div className="setup">
      <div className="plans">
        {PLANS.map(p => (
          <label key={p.value} className={draft.plan === p.value ? 'plan active' : 'plan'}>
            <input type="radio" name="plan" checked={draft.plan === p.value} onChange={() => set({ plan: p.value })} />
            <b>{p.title}</b>
            <span>{p.text}</span>
          </label>
        ))}
      </div>

      <div className="setup-grid">
        <label>Contract name
          <input style={FIELD} type="text" value={draft.name} onChange={e => set({ name: e.target.value })} />
        </label>
        <label><span>Term start<InfoTip text={TIPS.setup.term} label="the term" /></span>
          <input style={FIELD} type="date" value={draft.termStart} onChange={e => e.target.value && set({ termStart: e.target.value })} />
        </label>
        <label>Term end
          <input style={FIELD} type="date" value={draft.termEnd} onChange={e => e.target.value && set({ termEnd: e.target.value })} />
        </label>
        <label><span>Top-up amount (prepaid, covers overage)<InfoTip text={TIPS.setup.topUp} label="the top-up amount" /></span>
          <input style={{ ...FIELD, textAlign: 'right' }} type="number" min="0" step="any" placeholder="0" value={draft.deal.topUp === undefined ? '' : draft.deal.topUp}
            onChange={e => num(e.target.value, v => set({ deal: { ...draft.deal, topUp: v } }))} />
        </label>
        <label><span>Currency<InfoTip text={TIPS.setup.currency} label="currency" /></span>
          <input style={{ ...FIELD, width: 80, minWidth: 80 }} type="text" maxLength="4" value={cur} onChange={e => set({ deal: { ...draft.deal, currency: e.target.value.toUpperCase() } })} />
        </label>
        <label><span>Counts towards the minimum<InfoTip text={TIPS.setup.basis} label="what counts towards the minimum" /></span>
          <select style={FIELD} value={draft.basis} onChange={e => set({ basis: e.target.value })}>
            <option value="total">Total (billable + free)</option>
            <option value="billable">Billable only</option>
          </select>
        </label>
      </div>
      <div className="hint">
        {months.length} months in the term ({years} contract year{years > 1 ? 's' : ''}). Months are shown as whole calendar months from the start month (a term starting mid-month still counts as 12 months for a year); contract years run from the start month.
        {implied > 0 ? (
          <> Deal value, calculated from the minimums x plan rates: <b>{cur} {formatNum(implied)}</b>. It is drawn down by the minimums every month, used or not.
            {savings
              ? <>{Number(draft.deal.topUp) > 0 ? <> Overage draws first on the <b>{cur} {formatNum(Number(draft.deal.topUp))}</b> top-up</> : ' No top-up entered: overage is billed straight away'}, then billed as pay-as-you-go.</>
              : <> Each month's overage is billed that month at the overage rate{Number(draft.deal.topUp) > 0 ? <>; the <b>{cur} {formatNum(Number(draft.deal.topUp))}</b> top-up is applied as prepaid credit against those bills</> : ''}.</>}</>
        ) : null}
      </div>

      <>
          <h4>Minimum monthly commit<InfoTip text={TIPS.setup.minimums} label="the minimum monthly commit" /></h4>
          <table className="setup-table">
            <thead>
              <tr><th>Metric</th><th>Track</th>{yearHeads.map(i => <th key={i} className="r">Year {i + 1} (per month)</th>)}</tr>
            </thead>
            <tbody>
              {METRICS.map(m => {
                const cfg = draft.metrics[m.key];
                return (
                  <tr key={m.key}>
                    <td>{m.label} <span className="muted">({m.unit})</span></td>
                    <td><input type="checkbox" checked={cfg.enabled} onChange={e => setMetric(m.key, { enabled: e.target.checked })} /></td>
                    {yearHeads.map(i => (
                      <td key={i} className="r">
                        <input style={{ ...FIELD, width: 100, textAlign: 'right' }} type="number" min="0" step="any" disabled={!cfg.enabled}
                          placeholder={i === 0 ? '0' : 'as before'} value={(cfg.commits || [])[i] === undefined ? '' : cfg.commits[i]}
                          onChange={e => num(e.target.value, v => setMetric(m.key, { commits: setList(cfg.commits, i, v) }))} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="hint">Every minimum is monthly, for both plans. Users are a minimum number of users (monthly peak); data and CCU are the minimum consumed each month. Leave a later year blank to keep the previous year's minimum.</div>
      </>

      <h4>Rate card</h4>
      <table className="setup-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th className="r">Plan rate ({cur} per unit)<InfoTip text={TIPS.setup.planRate} label="the plan rate" /></th>
            <th className="r">{savings ? `Pay-as-you-go rate (${cur} per unit)` : `Overage rate (${cur} per unit)`}<InfoTip text={savings ? TIPS.setup.paygRate : TIPS.setup.overRate} label={savings ? 'the pay-as-you-go rate' : 'the overage rate'} /></th>
          </tr>
        </thead>
        <tbody>
          {METRICS.map(m => (
            <tr key={m.key}>
              <td>{m.label} <span className="muted">({m.kind === 'peak' ? 'per user per month' : `per ${m.unit}`})</span></td>
              <td className="r">
                <input style={{ ...FIELD, width: 100, textAlign: 'right' }} type="number" min="0" step="any" value={draft.rates[m.key].plan}
                  onChange={e => num(e.target.value, v => setRate(m.key, 'plan', v))} />
              </td>
              <td className="r">
                <input style={{ ...FIELD, width: 100, textAlign: 'right' }} type="number" min="0" step="any" placeholder="same as plan"
                  value={savings ? draft.rates[m.key].payg : draft.rates[m.key].over}
                  onChange={e => num(e.target.value, v => setRate(m.key, savings ? 'payg' : 'over', v))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="hint">
        {savings
          ? 'Minimums and overage are valued at the plan rate; pay-as-you-go overage at the PAYG rate. Users count once per month at their monthly peak. Metrics with no plan rate are left out of the money.'
          : 'Each month bills the minimum x plan rate, plus any usage above the minimum x overage rate. Leave the overage rate blank to use the plan rate. Metrics with no plan rate show units only.'}
      </div>

      {missingMonths.length > 0 && enabled.length > 0 ? (
        <details className="overrides">
          <summary>Earlier months with no usage history ({missingMonths.length}) - enter figures manually (optional)<InfoTip text={TIPS.setup.manual} label="manual months" /></summary>
          <table className="setup-table">
            <thead>
              <tr><th>Month</th>{enabled.map(m => <th key={m.key} className="r">{m.short} ({m.unit})</th>)}</tr>
            </thead>
            <tbody>
              {missingMonths.map(mk => (
                <tr key={mk}>
                  <td>{monthLabel(mk)}</td>
                  {enabled.map(m => (
                    <td key={m.key} className="r">
                      <input style={{ ...FIELD, width: 90, textAlign: 'right' }} type="number" min="0" step="any"
                        value={((draft.overrides[mk] || {})[m.key]) === undefined ? '' : draft.overrides[mk][m.key]}
                        onChange={e => num(e.target.value, v => setOverride(mk, m.key, v))} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}

      <div className="setup-actions">
        <button type="button" className="btn primary" onClick={onSave}>Save contract</button>
        <button type="button" className="btn" onClick={onReset}>Discard changes</button>
        <span className={`save-state ${saveState.tone || ''}`}>{saveState.text}</span>
      </div>
    </div>
  );
}
