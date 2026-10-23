// CCU Tracker. Zero dependencies: node server.js
// Reads credentials from ../../.mcp.env and queries NerdGraph read-only; the key never reaches the browser.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const PORT = process.env.PORT || 4317;
const BUDGET_FILE = path.join(__dirname, 'data', 'budget.json');
const TTL_MS = 5 * 60 * 1000;
const HISTORY_MONTHS = 9;

function loadEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return env;
}
const env = { ...loadEnv(path.join(ROOT, '.mcp.env')), ...process.env };
const API_KEY = env.NEWRELIC_API_KEY;
const ACCOUNT_ID = Number(env.NEWRELIC_ACCOUNT_ID);
const GRAPHQL_URL = env.NEWRELIC_GRAPHQL_URL || 'https://api.newrelic.com/graphql';
if (!API_KEY || !ACCOUNT_ID) { console.error('NEWRELIC_API_KEY and NEWRELIC_ACCOUNT_ID must be set (environment or ../../.mcp.env)'); process.exit(1); }

const METRICS = { core: 'CoreCCU', adv: 'AdvancedCCU' };
// Some compute types are logged in raw units, not CCU, and would swamp every total:
//  - Cloud Rule processing (~1e11, no user) and New Relic AI Tokens (token counts): always excluded.
//  - Advanced Entity Lookups/Relationships/Writes and NRDB Queries: raw counts before June 2026, CCU after.
const RAW_CUTOFF_MS = Date.UTC(2026, 5, 1);
const BASE_WHERE = `metric IN ('CoreCCU','AdvancedCCU') AND dimension_computeType NOT IN ('Cloud Rule processing','New Relic AI Tokens') ` +
  `AND NOT (metric = 'AdvancedCCU' AND dimension_computeType IN ('Entity Lookups','Entity Relationships','Entity Writes','NRDB Queries') AND timestamp < ${RAW_CUTOFF_MS})`;

async function nrql(query) {
  const gql = `{ actor { account(id: ${ACCOUNT_ID}) { nrql(query: ${JSON.stringify(query)}, timeout: 120) { results } } } }`;
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'API-Key': API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: gql }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(body.errors.map((e) => e.message).join('; '));
  return body.data.actor.account.nrql.results;
}

const cache = new Map();
async function cached(key, fn, ttl = TTL_MS) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  return value;
}

const pad = (n) => String(n).padStart(2, '0');
function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const fmt = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} 00:00:00`;
  return { start, end, since: fmt(start), until: fmt(end), days: Math.round((end - start) / 864e5) };
}
const monthKey = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
const shiftMonth = (month, delta) => {
  const [y, m] = month.split('-').map(Number);
  return monthKey(new Date(Date.UTC(y, m - 1 + delta, 1)));
};

const UNATTRIBUTED = '__system__';
const userKey = (email) => (email ? email.toLowerCase() : UNATTRIBUTED);

// Per-user totals and per-product breakdown for one month, both metrics.
function monthData(month) {
  const { since, until } = monthBounds(month);
  const isCurrent = month === monthKey(new Date());
  return cached(`month:${month}`, async () => {
    const rows = await nrql(
      `SELECT sum(usage) AS usage FROM NrComputeUsage WHERE ${BASE_WHERE} ` +
      `FACET dimension_email, metric, dimension_productCapability SINCE '${since}' UNTIL '${until}' WITH TIMEZONE 'UTC' LIMIT MAX`);
    const out = { core: new Map(), adv: new Map() };
    for (const r of rows) {
      const [email, metric, product] = r.facet;
      const side = metric === METRICS.core ? out.core : metric === METRICS.adv ? out.adv : null;
      if (!side || !r.usage) continue;
      const key = userKey(email);
      const u = side.get(key) || { key, email: email || null, total: 0, products: {} };
      u.total += r.usage;
      const p = product || 'Other / unclassified';
      u.products[p] = (u.products[p] || 0) + r.usage;
      side.set(key, u);
    }
    return { truncated: rows.length >= 5000, core: out.core, adv: out.adv };
  }, isCurrent ? TTL_MS : 60 * 60 * 1000);
}

function dailyData(month) {
  const { since, until } = monthBounds(month);
  return cached(`daily:${month}`, async () => {
    const rows = await nrql(
      `SELECT sum(usage) AS usage FROM NrComputeUsage WHERE ${BASE_WHERE} ` +
      `FACET dimension_email, metric SINCE '${since}' UNTIL '${until}' TIMESERIES 1 day WITH TIMEZONE 'UTC' LIMIT MAX`);
    const out = { core: {}, adv: {} };
    const { start } = monthBounds(month);
    for (const r of rows) {
      const [email, metric] = r.facet;
      const side = metric === METRICS.core ? out.core : metric === METRICS.adv ? out.adv : null;
      if (!side) continue;
      const day = Math.floor((r.beginTimeSeconds * 1000 - start.getTime()) / 864e5);
      if (day < 0) continue;
      const arr = (side[userKey(email)] ||= []);
      arr[day] = (arr[day] || 0) + (r.usage || 0);
    }
    return out;
  }, TTL_MS);
}

const round = (n) => Math.round(n * 1e4) / 1e4;

async function buildMonth(month) {
  const { days, start } = monthBounds(month);
  const now = Date.now();
  const isCurrent = month === monthKey(new Date());
  const daysElapsed = isCurrent ? Math.max((now - start.getTime()) / 864e5, 1) : days;
  const [cur, prev, daily] = await Promise.all([monthData(month), monthData(shiftMonth(month, -1)), dailyData(month)]);
  const result = { month, days, daysElapsed: round(daysElapsed), isCurrent, truncated: cur.truncated, metrics: {} };

  for (const side of ['core', 'adv']) {
    const prevMap = prev[side];
    let attributed = 0, unattributed = 0, prevAttributed = 0, prevUnattributed = 0;
    const users = [];
    for (const u of cur[side].values()) {
      const days_ = [];
      for (let i = 0; i < (isCurrent ? Math.ceil(daysElapsed) : days); i++) days_.push(round((daily[side][u.key] || [])[i] || 0));
      const prevTotal = prevMap.get(u.key)?.total || 0;
      const row = {
        key: u.key, email: u.email, total: round(u.total), prevTotal: round(prevTotal),
        projected: round(isCurrent ? (u.total / daysElapsed) * days : u.total),
        products: Object.entries(u.products).map(([name, value]) => ({ name, value: round(value) })).sort((a, b) => b.value - a.value),
        daily: days_,
      };
      if (u.key === UNATTRIBUTED) unattributed = u.total; else { attributed += u.total; users.push(row); }
      if (u.key === UNATTRIBUTED) result.metrics[side + 'Unattributed'] = row;
    }
    for (const [k, u] of prevMap) { if (k === UNATTRIBUTED) prevUnattributed = u.total; else prevAttributed += u.total; }
    // Users who used the product last month but not this one still belong in the list (at zero).
    for (const [k, u] of prevMap) {
      if (k !== UNATTRIBUTED && !cur[side].has(k)) users.push({ key: k, email: u.email, total: 0, prevTotal: round(u.total), projected: 0, products: [], daily: [] });
    }
    users.sort((a, b) => b.total - a.total);
    result.metrics[side] = {
      users,
      attributed: round(attributed), unattributed: round(unattributed),
      prevAttributed: round(prevAttributed), prevUnattributed: round(prevUnattributed),
      projectedAttributed: round(isCurrent ? (attributed / daysElapsed) * days : attributed),
    };
  }
  return result;
}

async function buildHistory() {
  const current = monthKey(new Date());
  const months = Array.from({ length: HISTORY_MONTHS }, (_, i) => shiftMonth(current, i - (HISTORY_MONTHS - 1)));
  const data = await Promise.all(months.map(monthData));
  return {
    months: months.map((month, i) => {
      const row = { month };
      for (const side of ['core', 'adv']) {
        let attributed = 0, unattributed = 0, users = 0;
        for (const u of data[i][side].values()) {
          if (u.key === UNATTRIBUTED) unattributed += u.total; else { attributed += u.total; users++; }
        }
        row[side] = { attributed: round(attributed), unattributed: round(unattributed), users };
      }
      return row;
    }),
  };
}

// Per-user monthly series for the drill-down (lookback for one person).
async function buildUserHistory(key) {
  const current = monthKey(new Date());
  const months = Array.from({ length: HISTORY_MONTHS }, (_, i) => shiftMonth(current, i - (HISTORY_MONTHS - 1)));
  const data = await Promise.all(months.map(monthData));
  return { key, months: months.map((month, i) => ({ month, core: round(data[i].core.get(key)?.total || 0), adv: round(data[i].adv.get(key)?.total || 0) })) };
}

const DEFAULT_BUDGET = { core: { perUser: null, total: null }, adv: { perUser: null, total: null } };
function readBudget() {
  try { return { ...DEFAULT_BUDGET, ...JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8')) }; } catch { return DEFAULT_BUDGET; }
}
function writeBudget(b) {
  const clean = {};
  for (const side of ['core', 'adv']) {
    clean[side] = {};
    for (const f of ['perUser', 'total']) {
      const v = b?.[side]?.[f];
      if (v === null || v === '' || v === undefined) clean[side][f] = null;
      else if (Number.isFinite(Number(v)) && Number(v) >= 0) clean[side][f] = Number(v);
      else throw new Error(`Invalid budget value for ${side}.${f}`);
    }
  }
  fs.mkdirSync(path.dirname(BUDGET_FILE), { recursive: true });
  fs.writeFileSync(BUDGET_FILE, JSON.stringify(clean, null, 2));
  return clean;
}

const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/config') return send(res, 200, { accountName: env.NEWRELIC_ACCOUNT_NAME || 'New Relic account', accountId: ACCOUNT_ID, budget: readBudget(), currentMonth: monthKey(new Date()) });
    if (url.pathname === '/api/budget' && req.method === 'PUT') {
      let raw = ''; for await (const c of req) raw += c;
      return send(res, 200, writeBudget(JSON.parse(raw)));
    }
    if (url.pathname === '/api/month') {
      const month = url.searchParams.get('month') || monthKey(new Date());
      if (!/^\d{4}-\d{2}$/.test(month)) return send(res, 400, { error: 'month must be YYYY-MM' });
      return send(res, 200, await buildMonth(month));
    }
    if (url.pathname === '/api/history') return send(res, 200, await buildHistory());
    if (url.pathname === '/api/user-history') return send(res, 200, await buildUserHistory(url.searchParams.get('key') || ''));
    if (url.pathname === '/api/refresh' && req.method === 'POST') { cache.clear(); return send(res, 200, { ok: true }); }

    const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const full = path.join(__dirname, 'public', file);
    if (!full.startsWith(path.join(__dirname, 'public')) || !fs.existsSync(full)) return send(res, 404, { error: 'not found' });
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
    return send(res, 200, fs.readFileSync(full), types[path.extname(full)] || 'application/octet-stream');
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`CCU Tracker (account ${ACCOUNT_ID}) → http://localhost:${PORT}`));
