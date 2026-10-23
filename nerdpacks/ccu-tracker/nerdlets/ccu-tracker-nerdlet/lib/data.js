// Queries and aggregation for per-user CCU / aCCU (pure, no nr1 imports).
export const GQL = `query($id: Int!, $q: Nrql!) {
  actor { account(id: $id) { nrql(query: $q, timeout: 120) { results } } }
}`;

export const SIDES = ['core', 'adv'];
const METRIC_OF = { CoreCCU: 'core', AdvancedCCU: 'adv' };
export const UNATTRIBUTED = '__system__';

// Some compute types are logged in raw units, not CCU, and would swamp every total:
//  - Cloud Rule processing (~1e11, no user) and New Relic AI Tokens (token counts): always excluded.
//  - Advanced Entity Lookups/Relationships/Writes and NRDB Queries: raw counts before June 2026, CCU after.
const RAW_CUTOFF_MS = Date.UTC(2026, 5, 1);
const BASE_WHERE =
  "metric IN ('CoreCCU','AdvancedCCU') AND dimension_computeType NOT IN ('Cloud Rule processing','New Relic AI Tokens') " +
  "AND NOT (metric = 'AdvancedCCU' AND dimension_computeType IN ('Entity Lookups','Entity Relationships','Entity Writes','NRDB Queries') " +
  `AND timestamp < ${RAW_CUTOFF_MS})`;

const pad = n => String(n).padStart(2, '0');
export const monthKey = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  return monthKey(new Date(Date.UTC(y, m - 1 + delta, 1)));
}
export function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const fmt = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} 00:00:00`;
  return { start, since: fmt(start), until: fmt(end), days: Math.round((end - start) / 864e5) };
}
export const historyMonths = (now, count) =>
  Array.from({ length: count }, (_, i) => shiftMonth(monthKey(now), i - (count - 1)));

export function monthQuery(month) {
  const { since, until } = monthBounds(month);
  return `SELECT sum(usage) AS usage FROM NrComputeUsage WHERE ${BASE_WHERE} ` +
    `FACET dimension_email, metric, dimension_productCapability SINCE '${since}' UNTIL '${until}' WITH TIMEZONE 'UTC' LIMIT MAX`;
}
export function dailyQuery(month) {
  const { since, until } = monthBounds(month);
  return `SELECT sum(usage) AS usage FROM NrComputeUsage WHERE ${BASE_WHERE} ` +
    `FACET dimension_email, metric SINCE '${since}' UNTIL '${until}' TIMESERIES 1 day WITH TIMEZONE 'UTC' LIMIT MAX`;
}

const userKey = email => (email ? String(email).toLowerCase() : UNATTRIBUTED);
const round = n => Math.round(n * 1e4) / 1e4;

/** Facet rows -> { truncated, core: Map(key -> user), adv: Map } */
export function parseMonth(rows) {
  const out = { truncated: (rows || []).length >= 5000, core: new Map(), adv: new Map() };
  (rows || []).forEach(r => {
    const [email, metric, product] = r.facet;
    const side = METRIC_OF[metric];
    if (!side || !r.usage) return;
    const key = userKey(email);
    const u = out[side].get(key) || { key, email: email || null, total: 0, products: {} };
    u.total += r.usage;
    const p = product || 'Other / unclassified';
    u.products[p] = (u.products[p] || 0) + r.usage;
    out[side].set(key, u);
  });
  return out;
}

/** Timeseries facet rows -> { core: { key: [perDay] }, adv: {...} } */
export function parseDaily(rows, month) {
  const out = { core: {}, adv: {} };
  const startMs = monthBounds(month).start.getTime();
  (rows || []).forEach(r => {
    const [email, metric] = r.facet;
    const side = METRIC_OF[metric];
    if (!side) return;
    const day = Math.floor((r.beginTimeSeconds * 1000 - startMs) / 864e5);
    if (day < 0) return;
    const arr = (out[side][userKey(email)] = out[side][userKey(email)] || []);
    arr[day] = (arr[day] || 0) + (r.usage || 0);
  });
  return out;
}

const EMPTY = { truncated: false, core: new Map(), adv: new Map() };

/** One month's ranked view, both metrics. cur/prev from parseMonth, daily from parseDaily. */
export function buildMonth(month, cur, prev, daily, now) {
  const { days, start } = monthBounds(month);
  const isCurrent = month === monthKey(now);
  const daysElapsed = isCurrent ? Math.max((now.getTime() - start.getTime()) / 864e5, 1) : days;
  const result = { month, days, daysElapsed, isCurrent, truncated: cur.truncated, metrics: {} };
  const prevData = prev || EMPTY;
  const dailyData = daily || { core: {}, adv: {} };

  SIDES.forEach(side => {
    let attributed = 0;
    let prevAttributed = 0;
    let unattributedRow = null;
    const users = [];
    const dayCount = isCurrent ? Math.ceil(daysElapsed) : days;
    cur[side].forEach(u => {
      const series = [];
      for (let i = 0; i < dayCount; i++) series.push(round((dailyData[side][u.key] || [])[i] || 0));
      const row = {
        key: u.key,
        email: u.email,
        total: round(u.total),
        prevTotal: round((prevData[side].get(u.key) || {}).total || 0),
        projected: round(isCurrent ? (u.total / daysElapsed) * days : u.total),
        products: Object.keys(u.products).map(name => ({ name, value: round(u.products[name]) })).sort((a, b) => b.value - a.value),
        daily: series
      };
      if (u.key === UNATTRIBUTED) unattributedRow = row;
      else { attributed += u.total; users.push(row); }
    });
    prevData[side].forEach((u, k) => {
      if (k === UNATTRIBUTED) return;
      prevAttributed += u.total;
      // used last month but not this one: keep them in the list, at zero
      if (!cur[side].has(k)) users.push({ key: k, email: u.email, total: 0, prevTotal: round(u.total), projected: 0, products: [], daily: [] });
    });
    if (unattributedRow) unattributedRow.prevTotal = round(((prevData[side].get(UNATTRIBUTED)) || {}).total || 0);
    users.sort((a, b) => b.total - a.total);
    result.metrics[side] = {
      users,
      unattributed: unattributedRow,
      attributed: round(attributed),
      prevAttributed: round(prevAttributed),
      projectedAttributed: round(isCurrent ? (attributed / daysElapsed) * days : attributed)
    };
  });
  return result;
}

/** [{ month, core: { attributed, unattributed, users }, adv: {...} }] */
export function buildHistory(months, datas) {
  return months.map((month, i) => {
    const row = { month };
    SIDES.forEach(side => {
      let attributed = 0;
      let unattributed = 0;
      let users = 0;
      datas[i][side].forEach(u => {
        if (u.key === UNATTRIBUTED) unattributed += u.total;
        else { attributed += u.total; users++; }
      });
      row[side] = { attributed: round(attributed), unattributed: round(unattributed), users };
    });
    return row;
  });
}

/** One user's monthly totals across the lookback window. */
export function userHistory(key, months, datas) {
  return months.map((month, i) => ({
    month,
    core: round((datas[i].core.get(key) || {}).total || 0),
    adv: round((datas[i].adv.get(key) || {}).total || 0)
  }));
}
