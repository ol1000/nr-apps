import React from 'react';
import SetupPanel from './setup-panel';
import { BarChart, BarLegend } from './charts';
import InfoTip from './info-tip';
import { TIPS } from './lib/tips';
import { NR_LOGO } from './lib/nr-logo';
import { GROUPS, METRIC, groupRows } from './lib/contract';
import { formatNum, formatPct, formatDate, monthLabel } from './lib/format';

// Light base palette: New Relic inverts nerdlet colours in its dark theme, so a light design follows the theme.
// Inline colours: New Relic's global CSS paints tables/inputs and beats stylesheet rules.
const CELL = { background: '#ffffff', color: '#1d2329' };
const HEAD = { background: '#f4f6f8', color: '#1d2329' };

const METRIC_STATUS = {
  nocommit: { label: 'No minimum set', tone: 'idle' },
  nodata: { label: 'No usage yet', tone: 'idle' },
  ontrack: { label: 'At the minimum', tone: 'good' },
  under: { label: 'Below the minimum', tone: 'warn' },
  over: { label: 'Above the minimum', tone: 'bad' }
};
const PLAN_LABEL = { volume: 'Volume Plan', savings: 'Savings Plan', advantage: 'Advantage Plan' };
const dealStatus = d => {
  if (d.plan === 'advantage') {
    return ({
      nocommit: { label: 'No budget set', tone: 'idle' },
      norates: { label: 'Add plan rates', tone: 'idle' },
      ontrack: { label: 'On track', tone: 'good' },
      under: { label: 'Budget going unused', tone: 'warn' },
      depletes: { label: 'Budget will run out', tone: 'bad' },
      depleted: { label: 'Budget used up - usage billed pay-as-you-go', tone: 'bad' }
    })[d.status];
  }
  const billed = d.plan === 'savings' ? 'pay-as-you-go' : 'billed';
  return ({
    nocommit: { label: 'No minimums set', tone: 'idle' },
    norates: { label: 'Add plan rates', tone: 'idle' },
    ontrack: { label: 'On track', tone: 'good' },
    under: { label: 'Paying for unused minimum', tone: 'warn' },
    depletes: { label: 'Top-up will run out', tone: 'bad' },
    depleted: { label: `Top-up used up - overage ${billed}`, tone: 'bad' },
    notopup: { label: `No top-up - overage ${billed}`, tone: 'bad' }
  })[d.status];
};

const money = (cur, v) => `${cur} ${formatNum(v)}`;

function Chip({ s, tip }) {
  return (
    <span className="chip-wrap">
      <span className={`chip ${s.tone}`}>{s.label}</span>
      {tip ? <InfoTip text={tip} label={s.label} /> : null}
    </span>
  );
}

function Pace({ used, marker, tone, title }) {
  const w = used === null || used === undefined ? 0 : Math.max(0, Math.min(100, used));
  return (
    <div className="pace" title={title}>
      <div className={`pace-fill ${tone}`} style={{ width: `${w}%` }} />
      <div className="pace-mark" style={{ left: `${Math.max(0, Math.min(100, marker))}%` }} />
    </div>
  );
}

function MetricCard({ a, plan, share }) {
  const d = a.def;
  const st = plan === 'advantage' ? { label: 'Shared budget', tone: 'idle' } : METRIC_STATUS[a.status];
  const tone = st.tone === 'bad' ? 'bad' : st.tone === 'warn' ? 'warn' : 'good';
  const latestRow = [...a.rows].reverse().find(r => r.actual !== null);
  const latest = latestRow ? latestRow.actual : null;
  const when = latestRow && latestRow.state === 'current' ? 'this month so far' : 'last month';
  return (
    <div className="mcard">
      <div className="mcard-top"><span className="mcard-title">{d.label}<InfoTip text={TIPS.metricCard} label={d.label} /></span><Chip s={st} tip={plan === 'advantage' ? TIPS.advantage.dealValue : TIPS.metricStatus[a.status]} /></div>
      <div className="mcard-big">{latest === null ? '-' : formatNum(latest, d.unit)} <small>{d.unit} {when}</small></div>
      <div className="mcard-sub">{plan === 'advantage' ? 'No minimum - drawn from the shared budget' : a.commitNow > 0 ? `Minimum ${formatNum(a.commitNow, d.unit)} per month` : 'No minimum set'}</div>
      {plan === 'advantage' && share !== undefined ? <div className="mcard-line">{formatPct(share)} of spend so far{d.kind === 'sum' && a.runRate > 0 ? ` - run-rate ${formatNum(a.runRate, d.unit)} per month` : ''}</div> : null}
      {d.kind === 'sum' && a.commitNow > 0 ? (
        <Pace used={a.runRatio === null ? null : a.runRatio * 100} marker={100} tone={tone}
          title={`Run-rate ${formatNum(a.runRate, d.unit)} per month against a minimum of ${formatNum(a.commitNow, d.unit)}`} />
      ) : null}
      {d.kind === 'sum' && a.commitNow > 0 ? <div className="mcard-line">Run-rate {formatNum(a.runRate, d.unit)} per month ({formatPct(a.runRatio * 100)} of the minimum)</div> : null}
      {a.monthsKnown > 0 && a.commitNow > 0 ? <div className="mcard-line">Above the minimum in {a.monthsOver} of {a.monthsKnown} finished months, below in {a.monthsUnder}</div> : null}
      {a.overTotal > 0 ? <div className="mcard-line bad">{d.kind === 'peak' ? 'User-months above' : plan === 'volume' ? 'Overage billed so far' : 'Above the minimum so far'}: {formatNum(a.overTotal, d.unit)} {d.unit}</div> : null}
      {a.shortTotal > 0 ? <div className="mcard-line">{d.kind === 'peak' ? 'User-months below' : 'Minimum not used'}: {formatNum(a.shortTotal, d.unit)} {d.unit}</div> : null}
    </div>
  );
}

function DealCards({ d }) {
  const cur = d.currency;
  const volume = d.plan === 'volume';
  if (!d.tracked.length) {
    return (
      <div className="cards">
        <div className="mcard wide warnbox">
          <div className="mcard-title">Add plan rates to see the money<InfoTip text={TIPS.missingRates} label="plan rates" /></div>
          <div className="mcard-line">The deal value is calculated from the monthly minimums x plan rates. Enter a plan rate per unit (and a top-up amount) under Edit contract. Until then the cards below show units only.</div>
        </div>
      </div>
    );
  }
  if (d.plan === 'advantage') return <AdvantageCards d={d} />;
  const st = dealStatus(d);
  const topUpTone = d.topUp > 0 && d.topUpLeft <= 0 ? 'bad' : d.projectedOver > d.topUp ? 'warn' : 'good';
  return (
    <div className="cards">
      <div className="mcard wide">
        <div className="mcard-top"><span className="mcard-title">Deal value (calculated from the minimums)<InfoTip text={TIPS.dealValue} label="deal value" /></span><Chip s={st} tip={TIPS.status[d.status]} /></div>
        <div className="mcard-big">{money(cur, d.dealValue)}</div>
        <div className="mcard-sub">{money(cur, d.minimumToDate)} drawn by the monthly minimums ({formatPct(d.dealPct)}) - {money(cur, Math.max(0, d.dealLeft))} left<InfoTip text={TIPS.dealDrawn} label="drawn and left" /></div>
        {d.dealValue > 0 ? <Pace used={d.dealPct} marker={d.elapsedPct} tone="good" title={`${formatPct(d.dealPct)} of the deal value drawn; ${formatPct(d.elapsedPct)} of the term has passed`} /> : null}
        <div className={d.unusedToDate > 0 ? 'mcard-line warnamt' : 'mcard-line'}>Of that, {money(cur, d.unusedToDate)} was minimum with no usage behind it (finished months)<InfoTip text={TIPS.dealUnused} label="unused minimum" /></div>
      </div>
      <div className="mcard wide">
        <div className="mcard-top"><span className="mcard-title">{volume ? 'Top-up amount (prepaid credit against overage bills)' : 'Top-up amount (prepaid, covers overage)'}<InfoTip text={TIPS.topUp[d.plan]} label="top-up amount" /></span></div>
        {d.topUp > 0 ? (
          <>
            <div className="mcard-big">{money(cur, d.topUpLeft)} <small>left of {money(cur, d.topUp)}</small></div>
            <Pace used={(d.topUpUsed / d.topUp) * 100} marker={d.elapsedPct} tone={topUpTone} title={`${formatPct((d.topUpUsed / d.topUp) * 100)} of the top-up used`} />
            <div className="mcard-line">
              {volume ? 'Overage bills so far' : 'Overage so far'} {money(cur, d.overToDate)}; projected {money(cur, d.projectedOver)} by term end
              {d.topUpRunsOutOn ? <> - top-up runs out ~{formatDate(d.topUpRunsOutOn)}</> : null}
            </div>
          </>
        ) : (
          <>
            <div className="mcard-big">None</div>
            <div className="mcard-sub">No top-up entered - {volume ? 'every overage bill is invoiced in full' : 'overage is billed as pay-as-you-go'}</div>
            <div className="mcard-line">{volume ? 'Overage bills so far' : 'Overage so far'} {money(cur, d.overToDate)}</div>
          </>
        )}
        {!volume && (d.beyondToDate > 0 || d.projectedBeyondCost > 0) ? (
          <div className="mcard-line bad">Pay-as-you-go beyond the top-up: {money(cur, d.beyondToDate)} so far, about {money(cur, d.projectedBeyondCost)} projected by term end</div>
        ) : null}
      </div>
      {volume ? (
        <div className="mcard wide">
          <div className="mcard-top"><span className="mcard-title">Overage bill<InfoTip text={TIPS.overageBill} label="overage bill" /></span></div>
          <div className={d.overToDate > 0 ? 'mcard-big bad' : 'mcard-big'}>{money(cur, d.overToDate)} <small>billed so far</small></div>
          <div className="mcard-sub">each month's overage is billed that month at the overage rate - it is never netted against other months or metrics</div>
          <div className="mcard-line">
            {d.topUp > 0 ? <>Covered by the top-up: {money(cur, d.topUpUsed)}; invoiced: <b>{money(cur, d.beyondToDate)}</b>. </> : <>Invoiced in full: <b>{money(cur, d.beyondToDate)}</b>. </>}
            Projected overage bills {money(cur, d.projectedOver)} by term end{d.topUp > 0 ? `, of which about ${money(cur, d.projectedBeyondCost)} would be invoiced` : ''}.
          </div>
        </div>
      ) : null}
      {volume ? (
        <div className="mcard">
          <div className="mcard-title">Invoiced to date<InfoTip text={TIPS.invoiced} label="invoiced to date" /></div>
          <div className="mcard-big">{money(cur, d.billedToDate)}</div>
          <div className="mcard-sub">minimums {money(cur, d.minimumToDate)} + overage invoiced {money(cur, d.beyondToDate)}</div>
          <div className="mcard-line">Monthly minimums are billed for the whole month</div>
        </div>
      ) : null}
      {d.missingRates.length > 0 ? (
        <div className="mcard warnbox">
          <div className="mcard-title">No plan rate for: {d.missingRates.map(k => METRIC[k].short).join(', ')}<InfoTip text={TIPS.missingRates} label="missing plan rates" /></div>
          <div className="mcard-line">These are left out of the deal value and top-up until a rate is entered.</div>
        </div>
      ) : null}
    </div>
  );
}

function AdvantageCards({ d }) {
  const cur = d.currency;
  const st = dealStatus(d);
  const year = d.depletions.find(x => x.cy === (d.rows.find(r => r.state === 'current') || [...d.rows].reverse().find(r => r.state === 'past') || {}).cy);
  const poolTone = d.poolNow !== null && d.poolNow <= 0 ? 'bad' : d.projectedOver > 0 ? 'warn' : 'good';
  return (
    <div className="cards">
      <div className="mcard wide">
        <div className="mcard-top"><span className="mcard-title">Deal value (total of the yearly budgets)<InfoTip text={TIPS.advantage.dealValue} label="deal value" /></span><Chip s={st} tip={TIPS.statusAdvantage[d.status]} /></div>
        <div className="mcard-big">{money(cur, d.dealValue)}</div>
        <div className="mcard-sub">{money(cur, d.spendToDate)} drawn by usage ({formatPct(d.dealPct)}) - {money(cur, Math.max(0, d.dealLeft))} left<InfoTip text={TIPS.advantage.dealDrawn} label="drawn and left" /></div>
        {d.dealValue > 0 ? <Pace used={d.dealPct} marker={d.elapsedPct} tone="good" title={`${formatPct(d.dealPct)} of the deal value drawn; ${formatPct(d.elapsedPct)} of the term has passed`} /> : null}
        <div className={d.unusedToDate > 0 ? 'mcard-line warnamt' : 'mcard-line'}>Of the budget of finished years, {money(cur, d.unusedToDate)} {d.rollover ? 'was left at the end of the term' : 'lapsed unspent'}<InfoTip text={TIPS.advantage.lapsed} label="unspent budget" /></div>
      </div>
      <div className="mcard wide">
        <div className="mcard-top"><span className="mcard-title">Budget this contract year<InfoTip text={TIPS.advantage.pool} label="this year's budget" /></span></div>
        <div className="mcard-big">{money(cur, d.poolNow === null ? d.budgetNow : d.poolNow)} <small>left of {money(cur, d.budgetNow)}</small></div>
        <Pace used={d.poolNowPct === null ? 0 : 100 - d.poolNowPct} marker={d.yearElapsedPct} tone={poolTone} title={`${formatPct(d.poolNowPct === null ? 100 : 100 - d.poolNowPct)} of this year's budget used; ${formatPct(d.yearElapsedPct)} of the year has passed`} />
        <div className="mcard-line">
          Recent spend {money(cur, d.runSpend)} per month
          {year ? (year.actual ? <> - budget used up {formatDate(year.date)}</> : <> - budget runs out ~{formatDate(year.date)}</>) : <> - lasts to the end of the contract year</>}
        </div>
      </div>
      <div className="mcard wide">
        <div className="mcard-top"><span className="mcard-title">Usage beyond the budget<InfoTip text={TIPS.advantage.overage} label="overage" /></span></div>
        <div className={d.overToDate > 0 ? 'mcard-big bad' : 'mcard-big'}>{money(cur, d.overBilledToDate)} <small>pay-as-you-go so far</small></div>
        <div className="mcard-sub">spend beyond a year's budget, billed at the pay-as-you-go rates</div>
        <div className="mcard-line">Projected {money(cur, d.projectedOverCost)} by term end at the recent spend rate{d.depletions.length ? `; the budget runs out in ${d.depletions.length} of ${Math.ceil(d.rows.length / 12)} contract years` : ''}.</div>
      </div>
      {d.missingRates.length > 0 ? (
        <div className="mcard warnbox">
          <div className="mcard-title">No plan rate for: {d.missingRates.map(k => METRIC[k].short).join(', ')}<InfoTip text={TIPS.missingRates} label="missing plan rates" /></div>
          <div className="mcard-line">These are left out of the budget draw-down until a rate is entered.</div>
        </div>
      ) : null}
    </div>
  );
}

function ValueCell({ r, d }) {
  if (r.state === 'future') return <td style={CELL} className="num muted">-</td>;
  if (r.actual === null) return <td style={CELL} className="num missing" title="No usage history for this month. Enter it under Edit contract.">n/a</td>;
  const w = r.pct === null ? 0 : Math.min(100, r.pct);
  return (
    <td style={CELL} className="num">
      <span className="n">{formatNum(r.actual, d.unit)}{r.state === 'current' ? <i title="Month to date"> MTD</i> : null}</span>
      {r.commit > 0 ? <div className="bar-track"><div className={r.pct > 100 ? 'bar-fill bad' : 'bar-fill'} style={{ width: `${w}%` }} /></div> : null}
      {r.commit > 0 ? <span className="sub">{formatPct(r.pct)} of {formatNum(r.commit, d.unit)}</span> : null}
      {r.over > 0 ? <span className="sub bad">+{formatNum(r.over, d.unit)} above</span> : null}
    </td>
  );
}

const moneyCell = (v, state, bold) => (
  <td style={CELL} className={state === 'future' ? 'num muted' : 'num'}>{state === 'future' ? '-' : bold ? <b>{formatNum(v)}</b> : formatNum(v)}</td>
);

function VolumeGrid({ analyses, deal, groupBy }) {
  if (!analyses.length) return null;
  const grouped = analyses.map(a => groupRows(a, groupBy));
  const showMoney = deal.tracked.length > 0;
  const cur = deal.currency;
  const volume = deal.plan === 'volume';
  const adv = deal.plan === 'advantage';
  const dealGroups = [];
  deal.rows.forEach(r => {
    const id = groupBy === 'calendar' ? String(r.y) : `Contract year ${r.cy}`;
    let g = dealGroups.find(x => x.id === id);
    if (!g) dealGroups.push((g = { id, rows: [] }));
    g.rows.push(r);
  });
  const sum = (rows, k) => rows.reduce((s, r) => s + (r.state === 'future' ? 0 : (r[k] || 0)), 0);
  const lastDone = rows => [...rows].reverse().find(r => r.state !== 'future');
  return (
    <table style={CELL} className="grid">
      <thead>
        <tr style={HEAD}>
          <th style={HEAD}>MONTH<InfoTip text={TIPS.grid.month} label="month" /></th>
          {analyses.map(a => <th style={HEAD} key={a.def.key} className="r">{a.def.short.toUpperCase()} ({a.def.unit})<InfoTip text={TIPS.grid.metric} label={a.def.label} /></th>)}
          {showMoney && adv ? (
            <>
              <th style={HEAD} className="r">SPEND ({cur})<InfoTip text={TIPS.grid.spend} label="spend" /></th>
              <th style={HEAD} className="r">BUDGET LEFT ({cur})<InfoTip text={TIPS.grid.poolLeft} label="budget left" /></th>
              <th style={HEAD} className="r">PAYG OVER BUDGET ({cur})<InfoTip text={TIPS.grid.advOverage} label="overage" /></th>
            </>
          ) : null}
          {showMoney && !adv ? (
            <>
              <th style={HEAD} className="r">MINIMUM ({cur})<InfoTip text={TIPS.grid.minimum} label="minimum" /></th>
              <th style={HEAD} className="r">{volume ? 'OVERAGE BILL' : 'OVERAGE'} ({cur})<InfoTip text={volume ? TIPS.grid.overageBill : TIPS.grid.overageSavings} label="overage" /></th>
              {volume && deal.topUp > 0 ? <th style={HEAD} className="r">TOP-UP CREDIT ({cur})<InfoTip text={TIPS.grid.topUpCredit} label="top-up credit" /></th> : null}
              {volume ? <th style={HEAD} className="r">INVOICED ({cur})<InfoTip text={TIPS.grid.invoiced} label="invoiced" /></th> : null}
              <th style={HEAD} className="r">TOP-UP LEFT ({cur})<InfoTip text={TIPS.grid.topUpLeft} label="top-up left" /></th>
              {!volume ? <th style={HEAD} className="r">PAYG OVER TOP-UP ({cur})<InfoTip text={TIPS.grid.payg} label="pay as you go" /></th> : null}
              <th style={HEAD} className="r">DEAL VALUE LEFT ({cur})<InfoTip text={TIPS.grid.dealLeft} label="deal value left" /></th>
            </>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {grouped[0].map((g, gi) => (
          <React.Fragment key={g.id}>
            <tr style={HEAD} className="group-row">
              <td style={HEAD}><b>{g.id}</b></td>
              {analyses.map((a, ai) => {
                const gg = grouped[ai][gi];
                return (
                  <td style={HEAD} key={a.def.key} className="num">
                    <b>{gg.actual === null ? '-' : formatNum(gg.actual, a.def.unit)}</b>
                    {gg.commit > 0 ? <span className="sub">{a.def.kind === 'peak' ? 'peak' : 'total'} vs {formatNum(gg.commit, a.def.unit)}{a.def.kind === 'peak' ? '' : ' minimum'}</span> : null}
                    {gg.over > 0 ? <span className="sub bad">+{formatNum(gg.over, a.def.unit)} above</span> : null}
                  </td>
                );
              })}
              {showMoney && adv ? (
                <>
                  <td style={HEAD} className="num"><b>{formatNum(sum(dealGroups[gi].rows, 'spend'))}</b></td>
                  <td style={HEAD} className="num">{(() => { const d = lastDone(dealGroups[gi].rows); return d ? <b>{formatNum(d.poolLeft)}</b> : '-'; })()}</td>
                  <td style={HEAD} className="num"><b>{formatNum(sum(dealGroups[gi].rows, 'overBilled'))}</b></td>
                </>
              ) : null}
              {showMoney && !adv ? (
                <>
                  <td style={HEAD} className="num"><b>{formatNum(sum(dealGroups[gi].rows, 'minimum'))}</b></td>
                  <td style={HEAD} className="num"><b>{formatNum(sum(dealGroups[gi].rows, 'over'))}</b></td>
                  {volume && deal.topUp > 0 ? <td style={HEAD} className="num"><b>{formatNum(sum(dealGroups[gi].rows, 'fromTopUp'))}</b></td> : null}
                  {volume ? <td style={HEAD} className="num"><b>{formatNum(sum(dealGroups[gi].rows, 'beyond'))}</b></td> : null}
                  <td style={HEAD} className="num">{(() => { const d = lastDone(dealGroups[gi].rows); return d && deal.topUp > 0 ? <b>{formatNum(d.topUpLeft)}</b> : '-'; })()}</td>
                  {!volume ? <td style={HEAD} className="num"><b>{formatNum(sum(dealGroups[gi].rows, 'beyond'))}</b></td> : null}
                  <td style={HEAD} className="num">{(() => { const d = lastDone(dealGroups[gi].rows); return d ? <b>{formatNum(d.dealLeft)}</b> : '-'; })()}</td>
                </>
              ) : null}
            </tr>
            {g.rows.map((r, ri) => {
              const f = r.state === 'future';
              const cls = f ? 'num muted' : 'num';
              const dr = showMoney ? dealGroups[gi].rows[ri] : null;
              return (
                <tr key={r.key} style={CELL}>
                  <td style={CELL}>{monthLabel(r.key)}</td>
                  {analyses.map((a, ai) => <ValueCell key={a.def.key} r={grouped[ai][gi].rows[ri]} d={a.def} />)}
                  {dr && adv ? (
                    <>
                      <td style={CELL} className={cls}>{f || dr.spend === null ? '-' : formatNum(dr.spend)}</td>
                      <td style={CELL} className={cls}>{f ? '-' : formatNum(dr.poolLeft)}</td>
                      <td style={CELL} className={f || dr.overBilled <= 0 ? cls : 'num bad'}>{f ? '-' : dr.overBilled > 0 ? <b>{formatNum(dr.overBilled)}</b> : '0'}</td>
                    </>
                  ) : null}
                  {dr && !adv ? (
                    <>
                      <td style={CELL} className={cls}>{f ? '-' : formatNum(dr.minimum)}</td>
                      <td style={CELL} className={f || dr.over <= 0 ? cls : 'num warnamt'}>{f ? '-' : dr.over > 0 ? formatNum(dr.over) : '0'}</td>
                      {volume && deal.topUp > 0 ? <td style={CELL} className={cls}>{f ? '-' : dr.fromTopUp > 0 ? formatNum(dr.fromTopUp) : '0'}</td> : null}
                      {volume ? <td style={CELL} className={f || dr.beyond <= 0 ? cls : 'num bad'}>{f ? '-' : dr.beyond > 0 ? <b>{formatNum(dr.beyond)}</b> : '0'}</td> : null}
                      <td style={CELL} className={cls}>{f || deal.topUp <= 0 ? '-' : formatNum(dr.topUpLeft)}</td>
                      {!volume ? <td style={CELL} className={f || dr.beyond <= 0 ? cls : 'num bad'}>{f ? '-' : dr.beyond > 0 ? formatNum(dr.beyond) : '0'}</td> : null}
                      <td style={CELL} className={cls}>{f ? '-' : formatNum(dr.dealLeft)}</td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </React.Fragment>
        ))}
      </tbody>
    </table>
  );
}

const USER_COLORS = { users_full: '#7a4fd6', users_core: '#1f6fe5', users_basic: '#1d9a8a' };

/** One small bar chart per tracked thing: Data, Users (one cluster per user type), CCU, aCCU. Untracked metrics get no chart. */
function volumeTiles(shown) {
  const by = k => shown.find(a => a.def.key === k);
  const tiles = [];
  const data = by('data');
  if (data) tiles.push({ id: 'data', title: 'Data ingest (GB per month)', unit: 'GB', series: [{ key: 'data', label: 'Data', color: '#1f6fe5', rows: data.rows }] });
  const users = shown.filter(a => a.def.group === 'users');
  if (users.length) tiles.push({ id: 'users', title: 'Users (monthly peak)', unit: 'users', multi: users.length > 1, series: users.map(a => ({ key: a.def.key, label: a.def.short, color: USER_COLORS[a.def.key], rows: a.rows })) });
  const core = by('ccu_core');
  if (core) tiles.push({ id: 'ccu_core', title: 'Core CCU (per month)', unit: 'CCU', series: [{ key: 'ccu_core', label: 'Core CCU', color: '#1f6fe5', rows: core.rows }] });
  const adv = by('ccu_adv');
  if (adv) tiles.push({ id: 'ccu_adv', title: 'Advanced CCU - aCCU (per month)', unit: 'aCCU', series: [{ key: 'ccu_adv', label: 'aCCU', color: '#1f6fe5', rows: adv.rows }] });
  return tiles;
}

function ChartTile({ title, tip, children }) {
  return (
    <div className="panel chart-tile">
      <div className="panel-title">{title}<InfoTip text={tip} label="this chart" /></div>
      {children}
    </div>
  );
}

export default function ContractView(p) {
  const { cfg, plan, analyses, deal, tab, groupBy, setupOpen, draft, missingMonths, saveState, loading, error, source,
    usageAccountId, onTab, onGroupBy, onToggleSetup, onDraft, onSave, onReset, onRefresh } = p;

  const shown = analyses.filter(a => tab === 'all' || a.def.group === tab);

  return (
    <div className="contract">
      <div className="topbar">
        <div className="title">
          <img className="nr-logo" src={NR_LOGO} alt="New Relic" />
          <span className="sep" />
          Contract<span className="accent">Consumption</span>
          <span className="badge">{PLAN_LABEL[plan]}</span><InfoTip text={TIPS.plan[plan]} label="this plan" />
        </div>
        <div className="sub">
          <span>{cfg.name} - {monthLabel(cfg.termStart.slice(0, 7))} to {monthLabel(cfg.termEnd.slice(0, 7))}</span>
          <button type="button" className="btn" onClick={onToggleSetup}>{setupOpen ? 'Close setup' : 'Edit contract'}</button>
          <button type="button" className="btn" onClick={onRefresh}>⟳ Refresh</button>
        </div>
      </div>

      {setupOpen ? <SetupPanel draft={draft} missingMonths={missingMonths} saveState={saveState} onChange={onDraft} onSave={onSave} onReset={onReset} /> : null}

      {error ? <div className="error">Could not load usage data: {error}</div> : null}
      {loading ? <div className="loading">Loading usage from account {usageAccountId}...</div> : null}

      <div className="controls">
        <div className="seg-wrap">
        <div className="seg">
          {GROUPS.map(g => <button key={g.key} type="button" className={tab === g.key ? 'seg-btn active' : 'seg-btn'} onClick={() => onTab(g.key)}>{g.label}</button>)}
        </div>
          <InfoTip text={TIPS.tabs} label="the metric tabs" />
        </div>
        <div className="seg-wrap">
        <div className="seg">
          <button type="button" className={groupBy === 'contract' ? 'seg-btn active' : 'seg-btn'} onClick={() => onGroupBy('contract')}>Contract year</button>
          <button type="button" className={groupBy === 'calendar' ? 'seg-btn active' : 'seg-btn'} onClick={() => onGroupBy('calendar')}>Calendar year</button>
        </div>
          <InfoTip text={TIPS.groupBy} label="contract year and calendar year" />
        </div>
        <span className="src"><InfoTip text={TIPS.usageSource} label="the usage source" /> Usage from account {usageAccountId} - contract {source === 'account' ? 'saved in account storage' : source === 'browser' ? 'saved in this browser only' : 'not saved yet'}</span>
      </div>

      <DealCards d={deal} />
      <div className="cards">
        {shown.length ? shown.map(a => <MetricCard key={a.def.key} a={a} plan={plan} share={(deal.byMetric.find(m => m.key === a.def.key) || {}).share} />)
          : <div className="mcard wide">No metrics are being tracked in this group. Use Edit contract to switch some on.</div>}
      </div>

      <div className="chart-grid">
        {volumeTiles(shown).map(t => (
          <ChartTile key={t.id} title={t.title} tip={t.id === 'users' && t.multi ? TIPS.chart + ' ' + TIPS.chartUsers : TIPS.chart}>
            <BarChart series={t.series} unit={t.unit} />
            <BarLegend multi={!!t.multi} plan={plan} series={t.series} />
          </ChartTile>
        ))}
      </div>

      <div className="panel grid-panel">
        <VolumeGrid analyses={shown} deal={deal} groupBy={groupBy} />
      </div>

      <div className="notes">
        An estimate from New Relic usage events, not an invoice: credits, contract-specific allowances and rounding can differ. Data and CCU are monthly totals;
        users are the monthly peak. {plan === 'advantage'
          ? 'Usage is valued at the plan rates and drawn from one shared budget per contract year.'
          : 'Every minimum is monthly and is drawn from the calculated deal value for the whole month.'} "Projected" extends the average of the
        last three complete months. Months before the usage history starts show n/a until entered under Edit contract.
      </div>
    </div>
  );
}
