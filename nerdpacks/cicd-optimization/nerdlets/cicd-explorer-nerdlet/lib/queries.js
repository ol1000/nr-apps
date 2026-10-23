// NRQL builders and result mapping (pure, no nr1 imports).

export const ACCOUNT_ID = 2033508; // NRPRO (US)

// NRPRO holds replayed demo data: use the real spans plus the sanitised 'clean' replay batch only.
const DATA_FILTER = "demo.batch = 'clean'";

// "Group by" options: attribute names are fixed here, never user input.
export const GROUPS = {
  repository: { label: 'Repository', attr: 'service.name', noun: 'repositories' },
  trigger: { label: 'Trigger', attr: 'gitlab.pipeline.source', noun: 'triggers' },
  branch: { label: 'Branch', attr: 'vcs.ref.head.name', noun: 'branches' }
};

export const DEFAULT_BRANCHES = "('main','master','develop','development','qa')";

export const BRANCH_FILTERS = {
  default: `if(vcs.ref.head.name IN ${DEFAULT_BRANCHES}, 'Default', 'Others') = 'Default'`,
  others: `if(vcs.ref.head.name IN ${DEFAULT_BRANCHES}, 'Default', 'Others') = 'Others'`,
  all: null
};

// Escape user text for a NRQL string literal inside LIKE '%...%'
export function escapeLike(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .trim();
}

// One row per pipeline run (duration = longest span, bad = any span flagged failed),
// then aggregated per group.
export function buildGroupQuery({ groupKey, branch, search, begin, end }) {
  const attr = (GROUPS[groupKey] || GROUPS.repository).attr;
  const where = ['cicd.pipeline.run.id IS NOT NULL', DATA_FILTER];
  if (BRANCH_FILTERS[branch]) where.push(BRANCH_FILTERS[branch]);
  if (search && search.trim()) where.push(`service.name LIKE '%${escapeLike(search)}%'`);
  return (
    "SELECT count(*) AS executions, filter(count(*), WHERE bad > 0) AS failures, " +
    'median(dur) AS median_ms, percentile(dur, 95) AS p95_ms, average(dur) AS avg_ms ' +
    "FROM (SELECT max(duration.ms) AS dur, filter(count(*), WHERE cicd.pipeline.result = 'failed') AS bad " +
    `FROM Span WHERE ${where.join(' AND ')} FACET cicd.pipeline.run.id, \`${attr}\` LIMIT MAX) ` +
    `FACET \`${attr}\` LIMIT MAX SINCE ${Math.floor(begin)} UNTIL ${Math.floor(end)}`
  );
}

export const GQL = `query($id: Int!, $q: Nrql!) {
  actor { account(id: $id) { nrql(query: $q, timeout: 120) { results } } }
}`;

function num(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    const first = Object.values(v)[0]; // percentile() returns { "95": value }
    return typeof first === 'number' ? first : null;
  }
  return typeof v === 'number' ? v : null;
}

// NerdGraph results -> Map(name -> metrics)
export function mapResults(results) {
  const out = new Map();
  (results || []).forEach(r => {
    const name = r.facet === null || r.facet === undefined || r.facet === '' ? '(none)' : String(r.facet);
    out.set(name, {
      name,
      executions: num(r.executions) || 0,
      failures: num(r.failures) || 0,
      median: num(r.median_ms),
      p95: num(r.p95_ms),
      avg: num(r.avg_ms)
    });
  });
  return out;
}

// Join current and previous period into table rows.
export function buildRows(current, previous) {
  return Array.from(current.values()).map(c => {
    const p = previous && previous.get(c.name);
    return {
      ...c,
      rate: c.executions ? (c.failures / c.executions) * 100 : 0,
      prevMedian: p ? p.median : null,
      change: p && p.median !== null && c.median !== null ? c.median - p.median : null
    };
  });
}

// Platform time range -> [begin, end] in epoch ms. Falls back to the last 7 days.
export function resolveRange(timeRange, now = Date.now()) {
  if (timeRange && timeRange.begin_time && timeRange.end_time) {
    return [timeRange.begin_time, timeRange.end_time];
  }
  const duration = timeRange && timeRange.duration ? timeRange.duration : 7 * 24 * 3600 * 1000;
  return [now - duration, now];
}
