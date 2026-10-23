// Plan and build a cheaper copy of a dashboard (pure, no nr1 imports).
//
// The only edit made is the time window of a query, because that is the one thing measured to change how many events are
// scanned (see lint.js). Everything else on the dashboard is copied as it was: pages, widget order and layout, visualisations,
// thresholds and the rest of each widget's rawConfiguration. The original dashboard is never touched.
import { lintQuery, windowDays } from './lint';

export const WINDOWS = [['1 hour ago', 1 / 24], ['6 hours ago', 0.25], ['1 day ago', 1], ['3 days ago', 3], ['7 days ago', 7]];
export const COPY_SUFFIX = ' (CCU optimized)';

const clone = o => JSON.parse(JSON.stringify(o));
const norm = q => String(q).replace(/\s+/g, ' ').trim();
const SINCE_CLAUSE = /(\bSINCE\s+)(.+?)(?=\s+(?:UNTIL|LIMIT|FACET|TIMESERIES|COMPARE|WITH|SLIDE|ORDER|EXTRAPOLATE)\b|$)/i;
const RELATIVE = /^\d+(?:\.\d+)?\s*(?:second|minute|hour|day|week|month|year)s?\s+ago$/i;

/**
 * The window of a query we are willing to shorten, in days, or null. Only a relative SINCE ("7 days ago") qualifies: a query
 * with variables, an UNTIL, or a fixed date range would show something different if rewritten, so it is left exactly as it is.
 */
export function shortenableDays(query) {
  const q = norm(query);
  if (/\{\{.*?\}\}/.test(q) || /\bUNTIL\b/i.test(q)) return null;
  const m = q.match(SINCE_CLAUSE);
  return m && RELATIVE.test(m[2]) ? windowDays(q) : null;
}

/** The same query with only its SINCE value replaced, so every other clause keeps its place. */
export const withSince = (query, since) => norm(query).replace(SINCE_CLAUSE, (all, kw) => `${kw}${since}`);
const queriesOf = w => ((w.rawConfiguration || {}).nrqlQueries || []).filter(x => x && x.query);

/**
 * entity: a DashboardEntity as fetched by fetchDashboard().
 * -> { blocked, widgets: [{ key, page, title, current, options, suggested, queries: [{ query, days }] }] }
 * Only widgets that lint.js flags for a long window of their own are offered; a window that comes from the time picker is not
 * in the NRQL, so it cannot be edited here (set a shorter default range on the dashboard instead).
 */
export function planRewrite(entity) {
  const blocked = (entity.variables || []).length
    ? 'This dashboard uses variables. A copy has to carry them over exactly, which is not supported yet.' : null;
  const widgets = [];
  (entity.pages || []).forEach((p, pi) => (p.widgets || []).forEach((w, wi) => {
    const queries = queriesOf(w).map(x => ({ query: x.query, days: shortenableDays(x.query), accountId: x.accountId || (x.accountIds || [])[0] || entity.accountId }));
    const flagged = queries.some(q => q.days !== null && lintQuery(q.query).some(f => /^window-/.test(f.rule)));
    if (!flagged) return;
    const current = Math.max(...queries.map(q => q.days || 0));
    const options = WINDOWS.filter(x => x[1] < current * 0.9);
    if (!options.length) return;
    widgets.push({
      key: `${pi}:${wi}`, page: p.name, title: w.title || '(untitled)', current, options,
      suggested: options[options.length - 1][0],
      queries
    });
  }));
  return { blocked, widgets };
}

/**
 * choices: { [widget key]: window string, e.g. '1 day ago' } for the widgets to change.
 * -> { input, changes } where input is a DashboardInput for dashboardCreate and changes lists each rewritten query.
 */
export function buildInput(entity, choices) {
  const changes = [];
  const pages = (entity.pages || []).map((p, pi) => ({
    name: p.name,
    description: p.description || null,
    widgets: (p.widgets || []).map((w, wi) => {
      const raw = w.rawConfiguration ? clone(w.rawConfiguration) : w.rawConfiguration;
      const since = choices[`${pi}:${wi}`];
      const target = since && WINDOWS.find(x => x[0] === since);
      if (target && raw && Array.isArray(raw.nrqlQueries)) {
        raw.nrqlQueries.forEach(x => {
          if (!x || !x.query) return;
          const days = shortenableDays(x.query);
          // only shorten; a query already at or under the chosen window is left alone
          if (days === null || days <= target[1]) return;
          const to = withSince(x.query, since);
          changes.push({ page: p.name, title: w.title || '(untitled)', from: x.query, to });
          x.query = to;
        });
      }
      const widget = { title: w.title, rawConfiguration: raw };
      if (w.layout) widget.layout = { column: w.layout.column, row: w.layout.row, width: w.layout.width, height: w.layout.height };
      if (w.visualization) widget.visualization = { id: w.visualization.id };
      const linked = (w.linkedEntities || []).map(e => e.guid);
      if (linked.length) widget.linkedEntityGuids = linked;
      return widget;
    })
  }));
  return {
    input: { name: `${entity.name}${COPY_SUFFIX}`, description: entity.description || null, permissions: entity.permissions, pages },
    changes
  };
}
