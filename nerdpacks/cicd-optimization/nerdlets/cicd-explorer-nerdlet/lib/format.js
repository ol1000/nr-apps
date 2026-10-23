// Formatting helpers (pure, no nr1 imports so they can be unit-tested).

export function formatCount(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  if (n >= 1e6) return `${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${trim(n / 1e3)}k`;
  return String(Math.round(n));
}

function trim(x) {
  return x >= 100 ? x.toFixed(0) : x.toFixed(x >= 10 ? 1 : 2).replace(/\.?0+$/, '');
}

export function formatPct(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return '-';
  if (p === 0) return '0%';
  return `${p < 10 ? p.toFixed(1) : p.toFixed(0)}%`;
}

// ms -> "8m 6s", "1h 2m", "9.6s", "340ms", "0ns"
export function formatDuration(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '-';
  if (ms <= 0) return '0ns';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const rs = Math.round(s - m * 60);
  if (m < 60) return rs ? `${m}m ${rs}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m - h * 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}

// Change in duration vs the previous period.
// -> { text, direction: 'up' | 'down' | 'flat' | 'none' }  ("up" = slower = bad)
export function formatChange(current, previous) {
  if (previous === null || previous === undefined || current === null || current === undefined) {
    return { text: '-', direction: 'none' };
  }
  const diff = current - previous;
  if (Math.abs(diff) < 1) return { text: '0ns', direction: 'flat' };
  return { text: formatDuration(Math.abs(diff)), direction: diff > 0 ? 'up' : 'down' };
}
