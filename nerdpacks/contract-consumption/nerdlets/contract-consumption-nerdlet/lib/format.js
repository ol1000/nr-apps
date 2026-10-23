// Formatting helpers (pure).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function formatNum(v, unit) {
  if (v === null || v === undefined || Number.isNaN(v)) return '-';
  if (unit === 'users') return String(Math.round(v));
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(1)}k`;
  if (a >= 1e3) return `${Math.round(v).toLocaleString('en-GB')}`;
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

export function formatPct(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return '-';
  return `${p >= 100 ? p.toFixed(0) : p.toFixed(1)}%`;
}

export function formatDate(d) {
  if (!d) return '-';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export const STATUS = {
  nocommit: { label: 'No commit set', tone: 'idle' },
  ontrack: { label: 'On track', tone: 'good' },
  under: { label: 'Under-consuming', tone: 'warn' },
  over: { label: 'Over pace', tone: 'bad' },
  exceeded: { label: 'Commit exceeded', tone: 'bad' }
};
export const PEAK_STATUS = {
  nocommit: STATUS.nocommit,
  ontrack: { label: 'At commit', tone: 'good' },
  under: { label: 'Below minimum', tone: 'warn' },
  over: { label: 'Above commit', tone: 'bad' }
};
