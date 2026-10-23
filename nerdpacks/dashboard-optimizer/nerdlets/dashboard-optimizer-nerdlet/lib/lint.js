// Static analysis of NRQL for patterns that burn CCU (pure, no nr1 imports).
//
// The rules here come from MEASURING queries on a reference account (rawResponse.queryUsage.ccu / scannedEvents), not from
// folklore. Cost is about 8.26e-10 CCU per event scanned, and on that data:
//   no effect (1.00x):  WHERE (even indexed attributes), filter(), LIMIT, SELECT *, TIMESERIES (any bucket), SLIDE BY,
//                       percentile/uniques/uniqueCount, extra aggregates, plain subqueries, backticks
//   FACET:              2.00x, whatever the attributes, LIMIT or cardinality (FACET cases() is 1.00x)
//   COMPARE WITH:       about 1.8x (the earlier period is scanned too)
//   time window:        linear (1 hour 0.05x, 7 days 8x of a 1-day query); no SINCE means 1 hour
// So only things that change how many events are scanned are flagged. A narrower WHERE is never offered as a saving.
// See .claude/skills/ccu-invariance-with-filtering and ccu-optimization-best-practices. A flag means "worth a look", not
// "wrong"; the observed CCU from NrComputeUsage is the ground truth they are ranked alongside, and the Dashboards tab can
// measure any flagged query for real.

const UNIT_DAYS = { second: 1 / 86400, minute: 1 / 1440, hour: 1 / 24, day: 1, week: 7, month: 30, year: 365 };

// Event types that are big enough for a long window to hurt.
const HIGH_VOLUME = /^(log|span|metric|transaction|transactionerror|pageview|pageaction|ajaxrequest|browserinteraction|jserror|mobilerequest|systemsample|processsample|networksample|storagesample|k8s\w*sample|containersample|infrastructureevent|distributedtracespan|syntheticrequest)$/i;
// Small, low-cardinality tables (usage, alert and entity records): long windows over these are cheap.
const SMALL = /^(nr[a-z]\w*|entity|workloadstatus|syntheticcheck|deployment|changetrackingevent)$/i;

export const SEVERITY = { high: 3, medium: 2, low: 1 };

const unitOf = u => UNIT_DAYS[String(u).toLowerCase().replace(/s$/, '')];

/** "7 days ago" / "1 week ago" / "yesterday" -> days back from now, or null when unparseable. */
function daysAgo(expr) {
  const s = String(expr).trim().toLowerCase();
  let m = s.match(/^(\d+(?:\.\d+)?|an?|one)\s*(second|minute|hour|day|week|month|year)s?\s+ago$/);
  if (m) return (m[1].match(/^\d/) ? parseFloat(m[1]) : 1) * unitOf(m[2]);
  if (s === 'now') return 0;
  if (s === 'yesterday') return 1;
  if (s === 'today') return 0.5;
  if (/^last\s+week$/.test(s)) return 14;
  if (/^last\s+month$/.test(s)) return 60;
  if (/^this\s+week$/.test(s)) return 3.5;
  if (/^this\s+month$/.test(s)) return 15;
  m = s.match(/^'?(\d{4}-\d{2}-\d{2})/);
  if (m) { const t = Date.parse(m[1]); return Number.isNaN(t) ? null : (Date.now() - t) / 864e5; }
  if (/^\d{10,13}$/.test(s)) { const t = s.length === 10 ? +s * 1000 : +s; return (Date.now() - t) / 864e5; }
  return null;
}

/** Window the query itself fixes, in days; null when it follows the dashboard time picker. */
export function windowDays(q) {
  const since = q.match(/\bSINCE\s+(.+?)(?=\s+(?:UNTIL|LIMIT|FACET|TIMESERIES|COMPARE|WITH|SLIDE|ORDER|EXTRAPOLATE)\b|$)/i);
  if (!since) return null;
  const start = daysAgo(since[1]);
  if (start === null) return null;
  const until = q.match(/\bUNTIL\s+(.+?)(?=\s+(?:LIMIT|FACET|TIMESERIES|COMPARE|WITH|SLIDE|ORDER|EXTRAPOLATE)\b|$)/i);
  const end = until ? daysAgo(until[1]) : 0;
  return Math.max(start - (end === null ? 0 : end), 0);
}

/** The same query over a different window: drops any SINCE/UNTIL and adds the new one (before COMPARE WITH, which must come last). */
export function setWindow(query, since) {
  let q = String(query).replace(/\s+/g, ' ').trim();
  q = q.replace(/\s+SINCE\s+.+?(?=\s+(?:UNTIL|LIMIT|FACET|TIMESERIES|COMPARE|WITH|SLIDE|ORDER|EXTRAPOLATE)\b|$)/i, '');
  q = q.replace(/\s+UNTIL\s+.+?(?=\s+(?:LIMIT|FACET|TIMESERIES|COMPARE|WITH|SLIDE|ORDER|EXTRAPOLATE)\b|$)/i, '');
  const clause = ` SINCE ${since}`;
  const cw = q.search(/\s+COMPARE\s+WITH\b/i);
  return cw >= 0 ? q.slice(0, cw) + clause + q.slice(cw) : q + clause;
}

function eventTypes(q) {
  // FROM Log, Span  /  SELECT ... FROM Transaction  /  FROM (SELECT ... FROM Log)
  const out = [];
  const re = /\bFROM\s+((?:`[^`]+`|[A-Za-z_][\w.]*)(?:\s*,\s*(?:`[^`]+`|[A-Za-z_][\w.]*))*)/gi;
  let m;
  while ((m = re.exec(q))) m[1].split(',').forEach(t => out.push(t.replace(/[`\s]/g, '')));
  return out;
}

/** Split a FACET clause on top-level commas. */
function splitTop(s) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts.map(p => p.trim()).filter(Boolean);
}

const bucketDays = q => {
  const m = q.match(/\bTIMESERIES\s+(\d+(?:\.\d+)?)\s*(second|minute|hour|day|week)s?/i);
  return m ? parseFloat(m[1]) * unitOf(m[2]) : null;
};

const HIGH_CARDINALITY = /(^|\.)(guid|traceid|trace\.id|span\.id|spanid|sessionid|session|userid|user\.id|requestid|request\.id|uuid|url|uri|message|pageurl|targeturl|clientip|remoteaddr)$/i;

/** -> [{ rule, severity, title, why, fix }] for one NRQL string. */
export function lintQuery(query, opts = {}) {
  const q = String(query || '').replace(/\s+/g, ' ').trim();
  if (!q) return [];
  const out = [];
  const add = (rule, severity, title, why, fix) => out.push({ rule, severity, title, why, fix });

  const days = opts.windowDays !== undefined && opts.windowDays !== null ? opts.windowDays : windowDays(q);
  const types = eventTypes(q);
  const big = types.some(t => HIGH_VOLUME.test(t));
  const small = !big && types.length > 0 && types.every(t => SMALL.test(t));
  const isLog = types.some(t => /^log$/i.test(t));
  // how loud a flag should be for this data: big types hurt most, small tables barely register
  const tier = (hi, mid, lo) => (big ? hi : small ? lo : mid);
  const facetM = q.match(/\bFACET\s+(.+?)(?=\s+(?:LIMIT|SINCE|UNTIL|TIMESERIES|ORDER|WITH|COMPARE|SLIDE|EXTRAPOLATE)\b|$)/i);
  const facets = facetM ? splitTop(facetM[1]) : [];
  // FACET cases(...) is a bucketing function, measured at 1.00x; every other facet doubles the scan
  const realFacet = facets.length > 0 && !facets.every(f => /^cases\s*\(/i.test(f));

  // 1. Time window: the lever. Scan size is linear in it.
  if (days !== null && !(small && days < 90)) {
    const vs = days >= 1 / 24 ? ` (about ${Math.round(days * 24).toLocaleString()}x the data of a 1-hour window)` : '';
    if (days >= 30) add('window-30d', tier('high', 'medium', 'low'), `Looks back ${fmtDays(days)}`, `Every event in the window is scanned on each run${vs}.`, 'Shorten to 1-7 days, or chart a pre-aggregated metric (events-to-metrics) for long trends.');
    else if (days >= 7) add('window-7d', tier('high', 'medium', 'low'), `Looks back ${fmtDays(days)}`, `Every event in the window is scanned on each run${vs}.`, 'Drop to 1-3 days, or use the dashboard time picker so people choose the range.');
    else if (days >= 3 && big) add('window-3d', 'medium', `Looks back ${fmtDays(days)} on a high-volume type`, `Multi-day scans of big event types add up across refreshes and viewers${vs}.`, 'Shorten the window, or query a Metric / E2M rule instead of raw events.');
  }

  // 2. FACET doubles the scan (measured 2.0x), regardless of attributes, LIMIT or cardinality.
  // A 2x on a 1-hour query is noise; it only matters when the scan it multiplies is already big.
  const bigScan = !small && days !== null && days >= (big ? 1 : 7);
  if (realFacet && bigScan) {
    add('facet', 'medium', 'FACET doubles the events scanned', 'Measured at 2.0x the cost of the same query without FACET, whatever the attributes, LIMIT or cardinality (LIMIT 5 costs the same as LIMIT MAX).', 'Drop the FACET where a single number will do, or move the breakdown to a drill-down widget or page.');
  }

  // 3. COMPARE WITH scans the earlier period as well.
  if (/\bCOMPARE\s+WITH\b/i.test(q) && bigScan) {
    add('compare-with', days >= 7 ? 'high' : 'medium', 'COMPARE WITH', 'Scans the earlier period too, about 1.8x to 2x the cost.', 'Compare on short windows only, or drop it on dashboards that refresh often.');
  }

  // 4. Recurring raw-event reads: pre-aggregated data has far fewer events to scan.
  if (isLog && (days === null || days >= 1) && !/\bFROM\s+Metric\b/i.test(q)) {
    add('log-recurring', days !== null && days >= 7 ? 'medium' : 'low', 'Recurring Log aggregation over raw logs', 'Log is the biggest table; each run scans every log event in the window.', 'Convert the aggregation to an Events-to-Metrics rule and chart the resulting Metric, which has far fewer events to scan.');
  } else if (big && !isLog && !types.some(t => /^metric$/i.test(t)) && days !== null && days >= 1) {
    add('prefer-metric', 'low', `Raw ${types.filter(t => HIGH_VOLUME.test(t))[0]} events over ${fmtDays(days)}`, 'A pre-aggregated Metric or Events-to-Metrics series answers the same question from far fewer events.', 'Use a Metric query (e.g. timeslice data) or an Events-to-Metrics rule for recurring queries.');
  }

  // 5. From the compute guide / FET optimizer (not measured here)
  if (/apm\.service\.transaction\.overview/i.test(q)) {
    add('apm-overview', 'medium', 'Uses apm.service.transaction.overview', 'The compute guide says this metric is built for the APM Summary UI and is high-cardinality.', 'Use apm.service.transaction.duration instead.');
  }
  const shortMin = q.match(/\bSINCE\s+(\d+(?:\.\d+)?)\s*(second|minute)s?\s+ago/i);
  if (shortMin && parseFloat(shortMin[1]) * unitOf(shortMin[2]) <= 5 / 1440 + 1e-9) {
    add('short-window', 'medium', 'Window of 5 minutes or less', 'Per the compute guide, tiny windows make auto-refreshing and TV-mode dashboards re-query every few seconds, and refresh frequency multiplies cost.', 'Use a window of an hour or more on dashboards that refresh automatically.');
  }
  if (opts.accountCount > 1) {
    add('cross-account', 'medium', `Runs across ${opts.accountCount} accounts`, 'Each account in a cross-account query is scanned, so the data read multiplies.', 'Query one account unless the combined view is genuinely needed.');
  }

  return out;
}

function fmtDays(d) {
  if (d >= 60) return `${Math.round(d / 30)} months`;
  if (d >= 14) return `${Math.round(d / 7)} weeks`;
  if (d >= 2) return `${Math.round(d)} days`;
  return `${Math.round(d * 24)} hours`;
}

const POINTS = { high: 10, medium: 4, low: 1 };
const HEAVY_PAGE = 8;
const HEAVY_SHARE = 0.02; // a non-candidate with at least 2% of all dashboard CCU counts as heavy

/** Dashboard entities (see queries.js) -> analysed dashboards with per-widget findings. */
export function analyseDashboards(entities) {
  return entities.map(d => {
    const widgets = [];
    const seen = {};
    (d.pages || []).forEach(p => (p.widgets || []).forEach(w => {
      const queries = ((w.rawConfiguration || {}).nrqlQueries || []).filter(x => x && x.query);
      queries.forEach(x => {
        const norm = x.query.replace(/\s+/g, ' ').trim();
        seen[norm] = (seen[norm] || 0) + 1;
        const accountCount = Array.isArray(x.accountIds) ? x.accountIds.length : 1;
        const accountId = x.accountId || (Array.isArray(x.accountIds) ? x.accountIds[0] : null) || d.accountId;
        widgets.push({ page: p.name, title: w.title || '(untitled)', query: norm, accountId, findings: lintQuery(norm, { accountCount }), days: windowDays(norm) });
      });
    }));
    // identical NRQL in several widgets runs once per widget
    const dups = Object.keys(seen).filter(k => seen[k] > 1);
    dups.forEach(k => widgets.filter(w => w.query === k).forEach(w => w.findings.push({
      rule: 'duplicate', severity: 'low', title: `Same query in ${seen[k]} widgets`,
      why: 'Identical NRQL runs once per widget on every load.', fix: 'Keep one widget, or use a template variable instead of near-duplicate widgets and dashboards.'
    })));
    const flagged = widgets.filter(w => w.findings.length);
    const counts = { high: 0, medium: 0, low: 0 };
    flagged.forEach(w => w.findings.forEach(f => { counts[f.severity]++; }));
    // All widgets on a page run together when it opens, so a page packed with heavy ones multiplies every load.
    const heavyPerPage = {};
    widgets.forEach(w => { if (w.findings.some(f => f.severity === 'high' || /^window-/.test(f.rule))) heavyPerPage[w.page] = (heavyPerPage[w.page] || 0) + 1; });
    const pageFindings = Object.keys(heavyPerPage).filter(pg => heavyPerPage[pg] >= HEAVY_PAGE).map(pg => ({
      rule: 'heavy-page', severity: 'medium', title: `Page "${pg}" runs ${heavyPerPage[pg]} heavy widgets at once`,
      why: 'Every widget on a page runs when it opens, so heavy ones multiply each load.',
      fix: 'Move the heaviest widgets to a separate "deep analysis" page or dashboard so they only run when someone opens it.'
    }));
    pageFindings.forEach(f => { counts[f.severity]++; });
    const score = counts.high * POINTS.high + counts.medium * POINTS.medium + counts.low * POINTS.low;
    const worst = flagged.map(w => w.findings.slice().sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity])[0])
      .concat(pageFindings)
      .sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity])[0] || null;
    return {
      guid: d.guid, name: d.name, accountId: d.accountId, permalink: d.permalink,
      widgetCount: widgets.length, flaggedCount: flagged.length, counts, score, worst, pageFindings,
      widgets: flagged.sort((a, b) => widgetScore(b) - widgetScore(a))
    };
  });
}

export const widgetScore = w => w.findings.reduce((s, f) => s + POINTS[f.severity], 0);

// ---- observed usage (NrComputeUsage) joined to the static analysis ----

const unb64 = s => {
  const padded = String(s) + '='.repeat((4 - (String(s).length % 4)) % 4);
  return typeof atob === 'function' ? atob(padded) : Buffer.from(padded, 'base64').toString();
};
/** Entity GUIDs are base64 of "acct|DOMAIN|TYPE|id"; usage records also carry APM apps, workflows etc. */
export const isDashboardGuid = g => { try { return unb64(g).includes('|VIZ|DASHBOARD|'); } catch (e) { return false; } };
const keyOf = g => String(g || '').replace(/=+$/, '');

/**
 * analysed: analyseDashboards() output.  obs: { dashboards: [{ guid, name, ccu, runs, windowDays }],
 * queries: [{ guid, query, ccu, runs, windowDays, ms }] }.
 * -> one row per dashboard (scanned or only seen in usage), with its observed totals and top queries linted.
 */
export function joinObserved(analysed, obs) {
  const byKey = {};
  analysed.forEach(d => { byKey[keyOf(d.guid)] = { ...d, ccu: 0, runs: 0, windowDays: null, queries: [], scanned: true }; });
  ((obs && obs.dashboards) || []).forEach(o => {
    if (!isDashboardGuid(o.guid)) return;
    const k = keyOf(o.guid);
    const row = byKey[k] || (byKey[k] = {
      guid: o.guid, name: o.name || `(deleted or unscanned) ${unb64(o.guid).split('|').pop()}`, accountId: Number(unb64(o.guid).split('|')[0]) || null,
      widgetCount: 0, flaggedCount: 0, counts: { high: 0, medium: 0, low: 0 }, score: 0, worst: null, widgets: [], scanned: false, queries: []
    });
    row.ccu = o.ccu;
    row.runs = o.runs;
    row.windowDays = o.windowDays;
  });
  ((obs && obs.queries) || []).forEach(o => {
    const row = byKey[keyOf(o.guid)];
    if (!row) return;
    // what it really ran: a query that follows the time picker has no SINCE, so use the window it was actually run with
    const findings = lintQuery(o.query, { windowDays: windowDays(o.query) !== null ? undefined : o.windowDays });
    row.queries.push({ ...o, findings });
  });
  const rows = Object.keys(byKey).map(k => {
    const r = byKey[k];
    r.queries.sort((a, b) => b.ccu - a.ccu);
    r.queries = r.queries.slice(0, 5);
    // Widgets that follow the time picker have no SINCE to lint, but the usage records show the window they really ran with.
    r.obsFindings = [];
    const staticWindow = r.widgets.some(w => w.findings.some(f => /^window-/.test(f.rule)));
    if (r.ccu > 0 && r.windowDays !== null && r.windowDays >= 7 && !staticWindow) {
      r.obsFindings.push({
        rule: 'observed-window', severity: r.windowDays >= 30 ? 'high' : 'medium', title: `Typically run over ${fmtDays(r.windowDays)}`,
        why: 'Seen in usage records, not in the NRQL: the dashboard time picker (or a variable) is set to a long range when it runs.',
        fix: 'Set a shorter default time range on the dashboard and avoid saving it with a long look-back.'
      });
      r.counts = { ...r.counts, [r.obsFindings[0].severity]: r.counts[r.obsFindings[0].severity] + 1 };
      r.score += POINTS[r.obsFindings[0].severity];
      if (!r.worst || SEVERITY[r.obsFindings[0].severity] > SEVERITY[r.worst.severity]) r.worst = r.obsFindings[0];
    }
    return r;
  });
  // Risk score, 0-100, built from two parts so a dashboard can be risky because of how it is written, how it is used, or both:
  //  - static, up to 70: severity-weighted lint findings (high 10, medium 4, low 1 points) with diminishing returns, so
  //    5 highs is about 44 and 20 highs about 69; one dashboard with hundreds of flags cannot run away from the scale
  //  - observed, up to 30: CCU actually used, as a square-root share of the biggest spender in the period, so a dashboard
  //    at a quarter of the top spender still scores 15
  const maxCcu = Math.max(0, ...rows.map(r => r.ccu));
  const totalCcu = rows.reduce((a, r) => a + r.ccu, 0);
  const periodDays = (obs && obs.periodDays) || null;
  rows.forEach(r => {
    const raw = r.counts.high * POINTS.high + r.counts.medium * POINTS.medium + r.counts.low * POINTS.low;
    r.riskStatic = Math.round(70 * (1 - Math.exp(-raw / 50)));
    r.riskObserved = maxCcu > 0 ? Math.round(30 * Math.sqrt(r.ccu / maxCcu)) : 0;
    r.risk = r.riskStatic + r.riskObserved;
    r.band = riskBand(r.risk);

    // An optimisation CANDIDATE is a dashboard that really used CCU in the period and has at least one medium or high
    // finding. Low findings never make one (they are hygiene), and a flagged dashboard nobody ran costs nothing, so it
    // is "latent" risk instead: worth knowing about, not worth the first hour.
    const actionable = r.counts.high + r.counts.medium > 0;
    r.candidate = r.ccu > 0 && actionable;
    r.latent = r.ccu === 0 && r.counts.high > 0;
    // HEAVY: a big share of the dashboard CCU but nothing in the queries to fix. The cost is how often it runs, so the
    // levers are refresh rate, TV mode, who has it open and whether it is still needed, not the NRQL.
    r.heavy = !r.candidate && totalCcu > 0 && r.ccu >= HEAVY_SHARE * totalCcu;
    if (r.heavy) {
      const perDay = periodDays ? r.runs / periodDays : null;
      r.heavyNote = {
        perDay,
        per1000: r.runs > 0 ? (r.ccu / r.runs) * 1000 : null
      };
    }

    // the reasons, grouped: "Looks back 7 days (14 widgets)", most serious first
    const byTitle = {};
    const note = f => {
      if (f.severity === 'low') return;
      const e = byTitle[f.title] || (byTitle[f.title] = { title: f.title, severity: f.severity, count: 0, fix: f.fix });
      e.count++;
    };
    r.widgets.forEach(w => w.findings.forEach(note));
    (r.obsFindings || []).forEach(note);
    (r.pageFindings || []).forEach(note);
    r.topIssues = Object.keys(byTitle).map(k => byTitle[k])
      .sort((a, b) => (SEVERITY[b.severity] - SEVERITY[a.severity]) || (b.count - a.count));
  });
  return rows;
}

/** 60+ high, 30-59 medium, otherwise low. */
export const riskBand = score => (score >= 60 ? 'high' : score >= 30 ? 'medium' : 'low');
