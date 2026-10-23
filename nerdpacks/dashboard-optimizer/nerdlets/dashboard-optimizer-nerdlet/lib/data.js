// Month maths and the NRQL wrapper query (pure, no nr1 imports).
export const GQL = `query($id: Int!, $q: Nrql!) {
  actor { account(id: $id) { nrql(query: $q, timeout: 120) { results } } }
}`;

const pad = n => String(n).padStart(2, '0');
export const monthKey = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
export function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  return monthKey(new Date(Date.UTC(y, m - 1 + delta, 1)));
}
export function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const fmt = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} 00:00:00`;
  return { start, since: fmt(start), until: fmt(end), days: Math.round((end - start) / 864e5) };
}
export const historyMonths = (now, count) =>
  Array.from({ length: count }, (_, i) => shiftMonth(monthKey(now), i - (count - 1)));
