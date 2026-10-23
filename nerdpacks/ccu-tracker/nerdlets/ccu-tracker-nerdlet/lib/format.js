// Formatting helpers (pure).
export const LABEL = { core: 'CCU', adv: 'aCCU' };

export function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  const a = Math.abs(n);
  if (a >= 1000) return Math.round(n).toLocaleString('en-GB');
  if (a >= 100) return n.toFixed(0);
  if (a >= 10) return n.toFixed(1);
  if (a >= 1) return n.toFixed(2);
  return a === 0 ? '0' : n.toFixed(3);
}

export const pct = p => `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`;

export const monthLabel = m => new Date(`${m}-01T00:00:00Z`).toLocaleString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' });
export const monthShort = m => new Date(`${m}-01T00:00:00Z`).toLocaleString('en', { month: 'short', timeZone: 'UTC' });

/** A budget input as a positive number, or null when blank / invalid. */
export const budgetNum = v => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) || Number(v) <= 0 ? null : Number(v));

export const STATUS = {
  over: { text: '▲ over budget', tone: 'over' },
  near: { text: '● 80%+ used', tone: 'near' },
  pace: { text: '↗ on pace to exceed', tone: 'pace' }
};
export function statusOf(total, projected, perUser, isCurrent) {
  if (!perUser) return null;
  if (total >= perUser) return 'over';
  if (total >= perUser * 0.8) return 'near';
  if (isCurrent && projected >= perUser) return 'pace';
  return null;
}
