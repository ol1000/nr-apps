// Usage queries and result parsing (pure, no nr1 imports).
import { keyFromTimestamp } from './contract';

export const GQL = `query($id: Int!, $q: Nrql!) {
  actor { account(id: $id) { nrql(query: $q, timeout: 120) { results } } }
}`;

/**
 * Two queries against the organisation's main account:
 *  - month-to-date consumption (data, CCU) - the latest value in a month is that month's total
 *  - user counts - the peak in the month
 * Both are faceted by account; accounts are combined client-side.
 */
export function buildUsageQueries(sinceMs, untilMs) {
  const range = `SINCE ${Math.floor(sinceMs)} UNTIL ${Math.floor(untilMs)} LIMIT MAX`;
  return {
    sums:
      'SELECT latest(GigabytesIngested) AS data, latest(GigabytesIngestedBillable) AS data_b, ' +
      'latest(CoreCCUBillable) AS core_b, latest(CoreCCUFree) AS core_f, ' +
      'latest(AdvancedCCUBillable) AS adv_b, latest(AdvancedCCUFree) AS adv_f ' +
      `FROM NrMTDConsumption FACET monthTimestamp, consumingAccountId ${range}`,
    users:
      'SELECT max(FullPlatformUsers) AS users_full, max(CoreUsers) AS users_core, max(BasicUsers) AS users_basic ' +
      `FROM NrConsumption FACET monthTimestamp, consumingAccountId ${range}`
  };
}

const n = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** -> { 'YYYY-MM': { data, data_billable, ccu_core, ccu_core_billable, ccu_adv, ccu_adv_billable, users_* } } */
export function parseUsage(sumRows, userRows) {
  const out = {};
  const slot = k => (out[k] = out[k] || {
    data: 0, data_billable: 0, ccu_core: 0, ccu_core_billable: 0, ccu_adv: 0, ccu_adv_billable: 0,
    users_full: 0, users_core: 0, users_basic: 0
  });
  (sumRows || []).forEach(r => {
    const s = slot(keyFromTimestamp(r.facet[0]));
    s.data += n(r.data);
    s.data_billable += n(r.data_b);
    s.ccu_core += n(r.core_b) + n(r.core_f);
    s.ccu_core_billable += n(r.core_b);
    s.ccu_adv += n(r.adv_b) + n(r.adv_f);
    s.ccu_adv_billable += n(r.adv_b);
  });
  // user counts are organisation-wide: take the highest figure any account reports, never a sum
  (userRows || []).forEach(r => {
    const s = slot(keyFromTimestamp(r.facet[0]));
    s.users_full = Math.max(s.users_full, n(r.users_full));
    s.users_core = Math.max(s.users_core, n(r.users_core));
    s.users_basic = Math.max(s.users_basic, n(r.users_basic));
  });
  return out;
}
