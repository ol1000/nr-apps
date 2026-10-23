// Ingest statistics (pure functions, no nr1 imports).
import {
  BASELINE_DAYS, Z_ELEVATED, Z_OVER, MIN_EXCESS_GB_PER_DAY, MIN_HISTORY_DAYS
} from './config';

export function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const sum = a => a.reduce((x, y) => x + y, 0);

export const STATUS_ORDER = { over: 0, elevated: 1, new: 2, below: 3, normal: 4, idle: 5 };

/**
 * Analyse one account.
 * @param daily  daily GB, oldest first, newest last (newest = the 24h ending now). Missing days = 0.
 * @param W      window length in days (1..n)
 * @returns ingest in the window, the window before it, change %, what was expected, and a status.
 */
export function analyzeAccount(daily, W, opts = {}) {
  const baselineDays = opts.baselineDays || BASELINE_DAYS;
  const zElevated = opts.zElevated || Z_ELEVATED;
  const zOver = opts.zOver || Z_OVER;
  const minExcessPerDay = opts.minExcessPerDay === undefined ? MIN_EXCESS_GB_PER_DAY : opts.minExcessPerDay;
  const minHistory = opts.minHistory || MIN_HISTORY_DAYS;

  const n = daily.length;
  const cur = sum(daily.slice(n - W));
  const prev = n >= 2 * W ? sum(daily.slice(n - 2 * W, n - W)) : null;
  const base = daily.slice(Math.max(0, n - W - baselineDays), n - W);
  const history = base.filter(v => v > 0).length;

  const med = median(base);
  const mad = median(base.map(v => Math.abs(v - med))) * 1.4826;
  // floor the spread so a perfectly flat account is not flagged for tiny wobbles
  const sigmaDay = Math.max(mad, 0.1 * med, 0.02);
  const expected = med * W;
  const sigma = sigmaDay * Math.sqrt(W);
  const excess = cur - expected;
  const z = sigma > 0 ? excess / sigma : 0;

  let status = 'normal';
  if (history < minHistory) {
    status = cur > minExcessPerDay * W ? 'new' : 'idle';
  } else if (z >= zOver && excess >= minExcessPerDay * W) {
    status = 'over';
  } else if (z >= zElevated && excess >= minExcessPerDay * W) {
    status = 'elevated';
  } else if (z <= -zOver && expected >= 5 * minExcessPerDay * W) {
    status = 'below';
  } else if (cur === 0 && med === 0) {
    status = 'idle';
  }

  // trivially small accounts: percentages are meaningless noise
  const negligible = cur < 0.05 * W && expected < 0.05 * W;

  return {
    negligible,
    cur,
    prev,
    delta: prev === null ? null : cur - prev,
    changePct: negligible || prev === null || prev <= 0 ? null : ((cur - prev) / prev) * 100,
    expected,
    median: med,
    sigma,
    z,
    excess,
    excessPct: negligible || expected <= 0 ? null : (excess / expected) * 100,
    history,
    status
  };
}

/** Parse NerdGraph TIMESERIES facet results into Map(accountId -> { id, name, daily[] }). */
export function parseSeries(results, begin, days) {
  const bucketMs = 24 * 3600 * 1000;
  const out = new Map();
  (results || []).forEach(r => {
    const f = Array.isArray(r.facet) ? r.facet : [r.facet];
    const id = String(f[0]);
    const name = f[1] ? String(f[1]) : id;
    if (!out.has(id)) out.set(id, { id, name, daily: new Array(days).fill(0) });
    const idx = Math.round((r.beginTimeSeconds * 1000 - begin) / bucketMs);
    if (idx >= 0 && idx < days) out.get(id).daily[idx] += Number(r.gb) || 0;
  });
  return out;
}

export function buildAccountRows(seriesMap, W, opts) {
  return Array.from(seriesMap.values()).map(s => ({ id: s.id, name: s.name, daily: s.daily, ...analyzeAccount(s.daily, W, opts) }));
}

export function summarize(rows) {
  const cur = sum(rows.map(r => r.cur));
  const prevRows = rows.filter(r => r.prev !== null);
  const prev = prevRows.length ? sum(prevRows.map(r => r.prev)) : null;
  return {
    cur,
    prev,
    changePct: prev && prev > 0 ? ((cur - prev) / prev) * 100 : null,
    over: rows.filter(r => r.status === 'over').length,
    elevated: rows.filter(r => r.status === 'elevated').length,
    accounts: rows.length
  };
}

/** Map the platform time range to a window length in whole days (1..max) and its end time. */
export function resolveWindow(timeRange, maxDays, now = Date.now()) {
  if (timeRange && timeRange.begin_time && timeRange.end_time) {
    const days = Math.round((timeRange.end_time - timeRange.begin_time) / 86400000);
    return { days: Math.min(maxDays, Math.max(1, days)), end: timeRange.end_time };
  }
  const dur = timeRange && timeRange.duration ? timeRange.duration : 86400000;
  return { days: Math.min(maxDays, Math.max(1, Math.round(dur / 86400000))), end: now };
}
