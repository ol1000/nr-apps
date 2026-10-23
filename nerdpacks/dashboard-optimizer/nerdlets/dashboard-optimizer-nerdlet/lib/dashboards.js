// Fetch dashboards (what they contain) and observed dashboard CCU (what they actually cost).
import { NerdGraphQuery, NerdGraphMutation } from 'nr1';
import { ACCOUNT_ID } from './config';
import { GQL, monthBounds, shiftMonth } from './data';

const errorText = res => {
  const errs = (res && (res.errors || res.error)) || null;
  if (!errs) return null;
  if (Array.isArray(errs)) return errs.map(e => e.message || String(e)).join('; ');
  return errs.message || String(errs);
};

// NO_CACHE: the SDK's default cache can answer an entity fragment with partial data (no permalink / pages) for some dashboards.
const NO_CACHE = NerdGraphQuery.FETCH_POLICY_TYPE && NerdGraphQuery.FETCH_POLICY_TYPE.NO_CACHE;

async function gql(query, variables) {
  const res = await NerdGraphQuery.query({ query, variables, fetchPolicyType: NO_CACHE });
  const err = errorText(res);
  if (err) throw new Error(err);
  if (!res || !res.data) throw new Error('No data returned');
  return res.data;
}

async function nrql(query) {
  const d = await gql(GQL, { id: ACCOUNT_ID, q: query });
  return d.actor.account.nrql.results;
}

/** Run fn over items with a small worker pool, reporting progress. */
async function pool(items, size, fn, onDone) {
  const out = new Array(items.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      done++;
      if (onDone) onDone(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return out;
}

export async function listAccounts() {
  const d = await gql('{ actor { accounts { id name } } }');
  return Object.fromEntries(d.actor.accounts.map(a => [a.id, a.name]));
}

const SEARCH = `query($c: String) { actor { entitySearch(query: "type = 'DASHBOARD'") { count results(cursor: $c) { nextCursor entities { guid } } } } }`;
const ENTITIES = `query($g: [EntityGuid]!) { actor { entities(guids: $g) { guid name accountId
  ... on DashboardEntity { permalink pages { name widgets { title rawConfiguration } } } } } }`;

/** Every dashboard the signed-in user can see, with its widgets' NRQL. onProgress(done, total) */
export async function scanDashboards(onProgress) {
  const guids = [];
  let cursor = null;
  do {
    const d = await gql(SEARCH, { c: cursor });
    const r = d.actor.entitySearch.results;
    r.entities.forEach(e => guids.push(e.guid));
    cursor = r.nextCursor;
  } while (cursor);
  const chunks = [];
  for (let i = 0; i < guids.length; i += 25) chunks.push(guids.slice(i, i + 25));
  if (onProgress) onProgress(0, guids.length);
  let finished = 0;
  const parts = await pool(chunks, 4, async chunk => {
    const d = await gql(ENTITIES, { g: chunk });
    finished += chunk.length;
    if (onProgress) onProgress(finished, guids.length);
    return d.actor.entities.filter(Boolean);
  });
  const all = parts.reduce((a, b) => a.concat(b), []);
  const partial = all.filter(e => !e.pages || !e.permalink).length;
  if (partial) console.warn(`[dashboard-optimizer] ${partial} of ${all.length} scanned dashboards came back without pages or a permalink`);
  return all;
}

/** 'month' | '3m' | '6m' ending at the end of `month` -> NRQL SINCE/UNTIL strings. */
export function periodRange(month, period) {
  const back = period === '6m' ? 5 : period === '3m' ? 2 : 0;
  return { since: monthBounds(shiftMonth(month, -back)).since, until: monthBounds(month).until };
}

// Usage records also carry APM apps, workflows etc. in dimension_dashboardId. Dashboard GUIDs are base64 of
// "<account>|VIZ|DASHBOARD|<id>"; the account's digit count shifts the base64 alignment, so match all three alignments.
const DASHBOARD_LIKE = [0, 1, 2].map(shift => {
  const raw = 'xyz'.slice(0, shift) + '|VIZ|DASHBOARD|';
  return `dimension_dashboardId LIKE '%${btoa(raw).slice(4, Math.floor(raw.length / 3) * 4)}%'`;
}).join(' OR ');
const WHERE = `metric = 'CoreCCU' AND dimension_computeType = 'NRDB Queries' AND (${DASHBOARD_LIKE})`;

/** Observed dashboard CCU in a period: per dashboard, and per (dashboard, query). */
export async function fetchObserved(month, period) {
  const { since, until } = periodRange(month, period);
  const range = `SINCE '${since}' UNTIL '${until}' WITH TIMEZONE 'UTC'`;
  const win = 'average(dimension_untilTime) - average(dimension_sinceTime)';
  const [dash, queries] = await Promise.all([
    nrql(`SELECT sum(usage) AS ccu, count(*) AS runs, ${win} AS winMs, latest(dimension_dashboardName) AS name FROM NrComputeUsage WHERE ${WHERE} FACET dimension_dashboardId ${range} LIMIT MAX`),
    nrql(`SELECT sum(usage) AS ccu, count(*) AS runs, ${win} AS winMs, average(dimension_executionDuration) AS ms FROM NrComputeUsage WHERE ${WHERE} AND dimension_query IS NOT NULL FACET dimension_dashboardId, dimension_query ${range} LIMIT 600`)
  ]);
  const days = ms => (typeof ms === 'number' && Number.isFinite(ms) && ms > 0 ? ms / 864e5 : null);
  const utc = str => Date.parse(`${str.replace(' ', 'T')}Z`);
  // a period that includes the current month only runs up to now
  const periodDays = Math.max((Math.min(Date.now(), utc(until)) - utc(since)) / 864e5, 1);
  return {
    periodDays,
    dashboards: dash.map(r => ({ guid: r.facet, name: r.name, ccu: r.ccu || 0, runs: r.runs || 0, windowDays: days(r.winMs) })),
    queries: queries.map(r => ({ guid: r.facet[0], query: r.facet[1], ccu: r.ccu || 0, runs: r.runs || 0, windowDays: days(r.winMs), ms: r.ms }))
  };
}

const MEASURE = `query($id: Int!, $q: Nrql!) { actor { account(id: $id) { nrql(query: $q, timeout: 120) { rawResponse } } } }`;

/**
 * Run a query once and read what it really cost: rawResponse.queryUsage gives CCU and the events scanned (the same
 * numbers the FET optimizer uses to verify savings instead of estimating them). Running it costs about one dashboard
 * load of that widget, so this is only ever called from an explicit click.
 */
export async function measureQuery(accountId, query) {
  const d = await gql(MEASURE, { id: Number(accountId), q: query });
  const raw = d.actor.account.nrql.rawResponse || {};
  const usage = raw.queryUsage || {};
  if (typeof usage.ccu !== 'number') throw new Error('New Relic did not return usage for this query');
  return { ccu: usage.ccu, scanned: usage.scannedEvents, ms: (raw.performanceStats || {}).wallClockTime };
}

const FULL_DASHBOARD = `query($g: EntityGuid!) { actor { entity(guid: $g) { ... on DashboardEntity {
  guid name description permissions accountId variables { name }
  pages { name description widgets { title layout { column row width height } visualization { id } rawConfiguration linkedEntities { guid } } }
} } } }`;

/** Everything needed to copy a dashboard faithfully (the scan above only keeps titles and NRQL). */
export async function fetchDashboard(guid) {
  const d = await gql(FULL_DASHBOARD, { g: guid });
  const e = d.actor.entity;
  if (!e || !e.pages) throw new Error('Could not read this dashboard (deleted, or you do not have access).');
  return e;
}

const CREATE_DASHBOARD = `mutation($accountId: Int!, $dashboard: DashboardInput!) {
  dashboardCreate(accountId: $accountId, dashboard: $dashboard) { entityResult { guid name } errors { description type } }
}`;

/**
 * Creates a NEW dashboard from a DashboardInput. The original is never updated: this is dashboardCreate, not dashboardUpdate.
 * Only ever called from an explicit confirm. -> { guid, name }
 */
export async function createDashboard(accountId, input) {
  const res = await NerdGraphMutation.mutate({ mutation: CREATE_DASHBOARD, variables: { accountId: Number(accountId), dashboard: input } });
  const err = errorText(res);
  if (err) throw new Error(err);
  const out = res && res.data && res.data.dashboardCreate;
  if (!out) throw new Error('No data returned');
  if (out.errors && out.errors.length) throw new Error(out.errors.map(e => e.description || e.type).join('; '));
  if (!out.entityResult) throw new Error('New Relic did not return the new dashboard');
  return out.entityResult;
}
