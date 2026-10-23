// Formatting helpers (pure).

export function formatGB(gb) {
  if (gb === null || gb === undefined || Number.isNaN(gb)) return '-';
  const a = Math.abs(gb);
  if (a === 0) return '0 GB';
  if (a >= 1000) return `${(gb / 1000).toFixed(a >= 10000 ? 0 : 1)} TB`;
  if (a >= 100) return `${gb.toFixed(0)} GB`;
  if (a >= 10) return `${gb.toFixed(1)} GB`;
  if (a >= 1) return `${gb.toFixed(2)} GB`;
  if (a >= 0.01) return `${gb.toFixed(2)} GB`;
  return `${(gb * 1000).toFixed(0)} MB`;
}

export function formatPct(p, withSign) {
  if (p === null || p === undefined || Number.isNaN(p)) return '-';
  const a = Math.abs(p);
  const body = a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(1);
  const sign = p > 0 ? '+' : p < 0 ? '−' : '';
  return `${withSign ? sign : p < 0 ? '−' : ''}${body}%`;
}

export const STATUS_LABEL = {
  over: 'Over expected',
  elevated: 'Elevated',
  new: 'New / no history',
  below: 'Below expected',
  normal: 'Normal',
  idle: 'Idle'
};
