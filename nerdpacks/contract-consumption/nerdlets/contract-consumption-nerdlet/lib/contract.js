// Contract maths (pure functions, no nr1 imports).
//
// Two buying plans with the same shape: a MONTHLY minimum commit per metric (metrics are not fungible), a deal value
// CALCULATED from those minimums (sum of minimum x plan rate over the term, drawn down in full every month whether
// or not it is used), and an optional prepaid TOP-UP amount that covers overage (usage above a minimum).
//   volume  - overage is valued at the overage rate (defaults to the plan rate); once the top-up is used up,
//             further overage is billed monthly at that rate.
//   savings - overage is valued at the plan rate; once the top-up is used up, further overage is pay-as-you-go.
//
// Two kinds of metric:
//   sum  - data (GB), Core CCU, Advanced CCU: consumed over the month
//   peak - Basic / Core / Full Platform users: the monthly peak

export const METRICS = [
  { key: 'users_full', label: 'Full platform users', short: 'Full users', unit: 'users', kind: 'peak', group: 'users' },
  { key: 'users_core', label: 'Core users', short: 'Core users', unit: 'users', kind: 'peak', group: 'users' },
  { key: 'users_basic', label: 'Basic users', short: 'Basic users', unit: 'users', kind: 'peak', group: 'users' },
  { key: 'data', label: 'Data ingest', short: 'Data', unit: 'GB', kind: 'sum', group: 'data' },
  { key: 'ccu_core', label: 'Core CCU', short: 'Core CCU', unit: 'CCU', kind: 'sum', group: 'ccu' },
  { key: 'ccu_adv', label: 'Advanced CCU (aCCU)', short: 'aCCU', unit: 'aCCU', kind: 'sum', group: 'ccu' }
];
export const METRIC = Object.fromEntries(METRICS.map(m => [m.key, m]));
export const GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'users', label: 'Users' },
  { key: 'data', label: 'Data' },
  { key: 'ccu', label: 'CCU / aCCU' }
];

const pad = n => String(n).padStart(2, '0');
export const monthKey = (y, m) => `${y}-${pad(m)}`;
export const keyFromTimestamp = ts => {
  const d = new Date(Number(ts));
  return monthKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
};
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function defaultConfig(now = new Date()) {
  const y = now.getUTCFullYear();
  return {
    name: 'Contract',
    plan: 'volume', // 'volume' | 'savings'
    termStart: `${y}-01-01`,
    termEnd: `${y}-12-31`,
    basis: 'total', // 'total' = billable + free count towards the commit, 'billable' = billable only
    // commits = MONTHLY minimum per contract year (volume plan; users are a minimum number of users)
    metrics: Object.fromEntries(METRICS.map(m => [m.key, { enabled: m.group !== 'users' || m.key === 'users_core', commits: [] }])),
    deal: { currency: 'USD', topUp: '' }, // the deal value itself is calculated; topUp = prepaid amount that covers overage
    // plan = price per unit the minimums are valued at (savings overage too)
    // over = volume plan overage rate (blank = same as plan)   payg = savings plan rate once the top-up is used up
    rates: Object.fromEntries(METRICS.map(m => [m.key, { plan: '', over: '', payg: '' }])),
    overrides: {} // { 'YYYY-MM': { data: 120, ... } } months older than the usage history
  };
}

/**
 * Number of months in a term. The end date may be inclusive (31 Jan for a term starting 1 Feb) or the anniversary of
 * the start (11 Jun 2027 for a term starting 11 Jun 2026): both are 12 months. A term that runs clearly past the
 * anniversary day (more than a day) counts the extra part-month as a month.
 */
export function termMonths(termStart, termEnd) {
  const [sy, sm, sd] = termStart.split('-').map(Number);
  const [ey, em, ed] = termEnd.split('-').map(Number);
  const whole = (ey - sy) * 12 + (em - sm);
  return Math.max(1, Math.min(120, whole + (ed > sd + 1 ? 1 : 0)));
}

/** Calendar months covered by the term, each tagged with its contract year (1-based, from the start month). */
export function buildMonths(termStart, termEnd) {
  const [sy, sm] = termStart.split('-').map(Number);
  const n = termMonths(termStart, termEnd);
  const out = [];
  let y = sy;
  let m = sm;
  for (let idx = 0; idx < n; idx++) {
    out.push({ key: monthKey(y, m), y, m, idx, cy: Math.floor(idx / 12) + 1 });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** The figure for contract year cy from a per-year list; a blank year inherits the previous one. */
export function commitFor(list, cy) {
  const c = (Array.isArray(list) ? list : (list && list.commits)) || [];
  for (let i = Math.min(cy, c.length) - 1; i >= 0; i--) {
    const v = Number(c[i]);
    if (c[i] !== '' && c[i] !== null && c[i] !== undefined && !Number.isNaN(v)) return v;
  }
  return 0;
}

export const rateOf = (cfg, key, field) => {
  const v = Number(cfg.rates && cfg.rates[key] && cfg.rates[key][field]);
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** Pick the actual monthly values for one metric: usage history first, manual overrides fill gaps. */
export function actualsFor(def, usageByMonth, overrides, basis) {
  const out = {};
  Object.keys(usageByMonth || {}).forEach(k => {
    const u = usageByMonth[k];
    let v = u[def.key];
    if (def.key === 'data' && basis === 'billable' && u.data_billable !== undefined) v = u.data_billable;
    if (def.key === 'ccu_core' && basis === 'billable' && u.ccu_core_billable !== undefined) v = u.ccu_core_billable;
    if (def.key === 'ccu_adv' && basis === 'billable' && u.ccu_adv_billable !== undefined) v = u.ccu_adv_billable;
    if (v !== undefined && v !== null) out[k] = v;
  });
  Object.keys(overrides || {}).forEach(k => {
    const v = overrides[k] && overrides[k][def.key];
    if (out[k] === undefined && v !== undefined && v !== '' && v !== null && !Number.isNaN(Number(v))) out[k] = Number(v);
  });
  return out;
}

const STATE = (key, nowKey) => (key < nowKey ? 'past' : key === nowKey ? 'current' : 'future');
const clock = now => {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const dim = daysInMonth(y, m);
  return { nowKey: monthKey(y, m), dayFrac: Math.min(1, (now.getUTCDate() - 1 + now.getUTCHours() / 24) / dim) };
};
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/**
 * One metric against its MONTHLY minimum commit.
 * Rows carry: actual, commit (monthly minimum), over (units above the minimum), short (units below it, finished months only).
 */
export function analyzeMetric(def, metricCfg, months, actuals, now = new Date()) {
  const { nowKey, dayFrac } = clock(now);
  const rows = months.map(mo => {
    const state = STATE(mo.key, nowKey);
    const commit = commitFor(metricCfg && metricCfg.commits, mo.cy);
    const actual = state === 'future' ? null : actuals[mo.key] === undefined ? null : actuals[mo.key];
    const over = actual !== null && commit > 0 && actual > commit ? actual - commit : 0;
    const short = state === 'past' && actual !== null && commit > 0 && actual < commit ? commit - actual : 0;
    return { ...mo, state, commit, actual, over, short, pct: commit > 0 && actual !== null ? (actual / commit) * 100 : null, missing: state !== 'future' && actuals[mo.key] === undefined };
  });
  const hasCommit = rows.some(r => r.commit > 0);
  const known = rows.filter(r => r.actual !== null);
  const finished = rows.filter(r => r.state === 'past' && r.actual !== null);
  const base = {
    def, rows, hasCommit,
    monthsOver: finished.filter(r => r.over > 0).length,
    monthsUnder: finished.filter(r => r.short > 0).length,
    monthsKnown: finished.length,
    overTotal: rows.reduce((s, r) => s + r.over, 0),
    shortTotal: rows.reduce((s, r) => s + r.short, 0)
  };
  const cur = rows.find(r => r.state === 'current');
  const ref = cur || [...rows].reverse().find(r => r.commit > 0) || rows[rows.length - 1];
  const commitNow = ref ? ref.commit : 0;

  if (def.kind === 'peak') {
    const latest = known.length ? known[known.length - 1] : null;
    let status = 'nocommit';
    if (hasCommit) status = !latest ? 'nodata' : latest.actual < latest.commit ? 'under' : latest.actual > latest.commit ? 'over' : 'ontrack';
    return { ...base, status, latest: latest ? latest.actual : null, commitNow, peak: known.length ? Math.max(...known.map(r => r.actual)) : null };
  }

  const past = rows.filter(r => r.state === 'past');
  const future = rows.filter(r => r.state === 'future');
  const consumed = rows.reduce((s, r) => s + (r.actual || 0), 0);
  const commitToDate = past.reduce((s, r) => s + r.commit, 0) + (cur ? cur.commit * dayFrac : 0);
  const commitTotal = rows.reduce((s, r) => s + r.commit, 0);
  const completeVals = finished.slice(-3).map(r => r.actual);
  let runRate = avg(completeVals);
  if (!completeVals.length && cur && cur.actual !== null && dayFrac > 0.05) runRate = cur.actual / dayFrac;
  const remaining = future.length + (cur ? 1 - dayFrac : 0);
  const projected = consumed + runRate * remaining;

  // judged on the monthly run-rate against the monthly minimum
  const ratio = commitNow > 0 ? runRate / commitNow : null;
  let status = 'nocommit';
  if (hasCommit) status = !known.length ? 'nodata' : ratio > 1 ? 'over' : ratio < 0.9 ? 'under' : 'ontrack';

  let a = 0;
  let c = 0;
  let p = 0;
  const cumulative = rows.map(r => {
    c += r.commit;
    a += r.actual || 0;
    p = r.state === 'future' ? p + runRate : r.state === 'current' ? a + runRate * (1 - dayFrac) : a;
    return { key: r.key, state: r.state, actual: r.state === 'future' ? null : a, commit: c, projected: r.state === 'past' ? null : p };
  });
  return {
    ...base, status, consumed, commitToDate, commitTotal, commitNow, runRate, projected, runRatio: ratio,
    paceRatio: commitToDate > 0 ? consumed / commitToDate : null,
    elapsedPct: rows.length ? ((past.length + (cur ? dayFrac : 0)) / rows.length) * 100 : 0,
    consumedPct: commitTotal > 0 ? (consumed / commitTotal) * 100 : null,
    cumulative
  };
}

/** Group month rows into contract years or calendar years, with a total/peak and commit per group. */
export function groupRows(analysis, mode) {
  const groups = [];
  analysis.rows.forEach(r => {
    const id = mode === 'calendar' ? String(r.y) : `Contract year ${r.cy}`;
    let g = groups.find(x => x.id === id);
    if (!g) groups.push((g = { id, rows: [] }));
    g.rows.push(r);
  });
  groups.forEach(g => {
    const vals = g.rows.map(r => r.actual).filter(v => v !== null);
    if (analysis.def.kind === 'peak') {
      g.actual = vals.length ? Math.max(...vals) : null;
      g.commit = Math.max(0, ...g.rows.map(r => r.commit));
    } else {
      g.actual = vals.length ? vals.reduce((a, b) => a + b, 0) : null;
      g.commit = g.rows.reduce((s, r) => s + r.commit, 0);
    }
    g.pct = g.commit > 0 && g.actual !== null ? (g.actual / g.commit) * 100 : null;
    g.over = g.rows.reduce((s, r) => s + r.over, 0);
  });
  return groups;
}

/**
 * The money for either plan.
 *  - Deal value = sum over the term of (minimum x plan rate): calculated. Each month's minimums are drawn from it in
 *    full, used or not ("unused minimum" is value drawn with no usage behind it).
 *  - Overage (usage above a minimum) is valued at the overage rate (volume: overage rate, else plan rate; savings: plan
 *    rate) and covered by the prepaid top-up first.
 *  - Overage beyond the top-up is billed: volume at the same overage rate, savings at the PAYG rate (falling back to
 *    the plan rate).
 * @param actualsByMetric { metricKey: { 'YYYY-MM': units } }
 */
export function analyzeDeal(cfg, months, actualsByMetric, now = new Date()) {
  const { nowKey } = clock(now);
  const plan = cfg.plan === 'savings' ? 'savings' : 'volume';
  const tracked = METRICS.filter(m => cfg.metrics[m.key].enabled && rateOf(cfg, m.key, 'plan') > 0);
  const missingRates = METRICS.filter(m => cfg.metrics[m.key].enabled && rateOf(cfg, m.key, 'plan') === 0).map(m => m.key);
  const commitOf = (k, cy) => commitFor(cfg.metrics[k].commits, cy);
  const topUp = Math.max(0, Number(cfg.deal && cfg.deal.topUp) || 0);
  const overRate = k => (plan === 'volume' ? rateOf(cfg, k, 'over') || rateOf(cfg, k, 'plan') : rateOf(cfg, k, 'plan'));
  const beyondRate = k => (plan === 'volume' ? overRate(k) : rateOf(cfg, k, 'payg') || rateOf(cfg, k, 'plan'));

  const rows = months.map(mo => {
    const state = STATE(mo.key, nowKey);
    const bySpend = {}; // usage x plan rate
    let minimum = 0; // value of this month's minimums (drawn from the deal value in full)
    let over = 0; // usage above the minimums, valued at the overage rate
    let overBeyond = 0; // the same overage at the rate it is billed at once the top-up is used up
    let unused = 0; // minimum not consumed (finished months)
    tracked.forEach(m => {
      const plan_ = rateOf(cfg, m.key, 'plan');
      const commit = commitOf(m.key, mo.cy);
      minimum += commit * plan_;
      if (state === 'future') return;
      const u = actualsByMetric[m.key] && actualsByMetric[m.key][mo.key];
      const used = u === undefined ? 0 : u;
      if (u !== undefined) bySpend[m.key] = u * plan_;
      const overUnits = Math.max(0, used - commit);
      over += overUnits * overRate(m.key);
      overBeyond += overUnits * beyondRate(m.key);
      if (state === 'past') unused += Math.max(0, commit - used) * plan_;
    });
    const spend = Object.keys(bySpend).length ? Object.values(bySpend).reduce((a, b) => a + b, 0) : null;
    return { ...mo, state, spend, bySpend, minimum, over, overBeyond, unused };
  });

  const dealValue = rows.reduce((s, r) => s + r.minimum, 0);
  const cur = rows.find(r => r.state === 'current');
  const past = rows.filter(r => r.state === 'past');
  const future = rows.filter(r => r.state === 'future');

  // running balances per month (finished and current months only)
  let cumMin = 0;
  let cumOver = 0;
  rows.forEach(r => {
    if (r.state === 'future') { r.dealLeft = null; r.topUpLeft = null; r.fromTopUp = 0; r.beyond = 0; return; }
    cumMin += r.minimum;
    const topUpBefore = Math.max(0, topUp - cumOver);
    r.fromTopUp = Math.min(r.over, topUpBefore);
    const overflow = r.over - r.fromTopUp;
    r.beyond = r.over > 0 ? overflow * (r.overBeyond / r.over) : 0; // what is billed for the part the top-up did not cover
    cumOver += r.over;
    r.dealLeft = dealValue - cumMin;
    r.topUpLeft = Math.max(0, topUp - cumOver);
  });

  const minimumToDate = rows.reduce((s, r) => s + (r.state === 'future' ? 0 : r.minimum), 0);
  const overToDate = rows.reduce((s, r) => s + (r.state === 'future' ? 0 : r.over), 0);
  const unusedToDate = past.reduce((s, r) => s + r.unused, 0);
  const beyondToDate = rows.reduce((s, r) => s + r.beyond, 0);
  const overBeyondToDate = rows.reduce((s, r) => s + (r.state === 'future' ? 0 : r.overBeyond), 0);
  const beyondFactor = overToDate > 0 ? overBeyondToDate / overToDate : 1;

  // projection: overage continues at the average of the last three finished months
  const runOver = avg(past.slice(-3).map(r => r.over));
  const curOver = cur ? Math.max(cur.over, runOver) : 0;
  const pastOver = past.reduce((s, r) => s + r.over, 0);
  const projectedOver = pastOver + curOver + runOver * future.length;
  const projectedTopUpUse = Math.min(projectedOver, topUp);
  const projectedBeyondValue = Math.max(0, projectedOver - topUp);

  let topUpRunsOutOn = null;
  if (topUp > 0 && overToDate < topUp && projectedOver > topUp) {
    let cum = pastOver;
    const step = (amount, startMs, spanMs) => {
      if (amount <= 0 || topUpRunsOutOn) return;
      if (cum + amount >= topUp) topUpRunsOutOn = new Date(startMs + ((topUp - cum) / amount) * spanMs);
      cum += amount;
    };
    if (cur) step(curOver, Date.UTC(cur.y, cur.m - 1, 1), daysInMonth(cur.y, cur.m) * 86400000);
    future.forEach(r => step(runOver, Date.UTC(r.y, r.m - 1, 1), daysInMonth(r.y, r.m) * 86400000));
  }

  let status = 'ontrack';
  if (!tracked.length) status = METRICS.some(m => cfg.metrics[m.key].enabled && rows.some(r => commitOf(m.key, r.cy) > 0)) ? 'norates' : 'nocommit';
  else if (dealValue <= 0) status = 'nocommit';
  else if (overToDate > 0 && topUp === 0) status = 'notopup';
  else if (overToDate > 0 && overToDate >= topUp) status = 'depleted';
  else if (projectedOver > topUp && projectedOver > 0) status = 'depletes';
  else if (unusedToDate > 0.1 * Math.max(1, minimumToDate)) status = 'under';

  const byMetric = tracked.map(m => {
    const units = Object.values(actualsByMetric[m.key] || {}).reduce((x, y) => x + y, 0);
    return { key: m.key, units, spend: units * rateOf(cfg, m.key, 'plan') };
  });

  return {
    plan, currency: (cfg.deal && cfg.deal.currency) || 'USD', rows, byMetric, tracked, missingRates, status,
    dealValue, minimumToDate, dealLeft: dealValue - minimumToDate, dealPct: dealValue > 0 ? (minimumToDate / dealValue) * 100 : null,
    unusedToDate, usageSpend: rows.reduce((s, r) => s + (r.spend || 0), 0),
    topUp, overToDate, topUpUsed: Math.min(overToDate, topUp), topUpLeft: Math.max(0, topUp - overToDate),
    projectedOver, projectedTopUpUse, topUpRunsOutOn, runOver,
    beyondToDate, beyondFactor, projectedBeyondValue, projectedBeyondCost: projectedBeyondValue * beyondFactor,
    billedToDate: plan === 'volume' ? minimumToDate + beyondToDate : null, // volume: minimums + overage the top-up did not cover
    elapsedPct: rows.length ? ((past.length + (cur ? 1 : 0)) / rows.length) * 100 : 0,
    hasCommit: dealValue > 0
  };
}
