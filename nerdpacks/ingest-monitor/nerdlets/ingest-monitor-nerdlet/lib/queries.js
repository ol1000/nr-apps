// NRQL for org-wide daily ingest per account (pure, no nr1 imports).
import { HISTORY_DAYS } from './config';

export const GQL = `query($id: Int!, $q: Nrql!) {
  actor { account(id: $id) { nrql(query: $q, timeout: 120) { results } } }
}`;

/**
 * Daily ingest (GB) per account for the HISTORY_DAYS ending at `end`.
 * Buckets are exactly 24h wide and end at `end`, so the newest bucket is "the last 24 hours".
 */
export function buildIngestQuery(end, days = HISTORY_DAYS) {
  const begin = Math.floor(end) - days * 24 * 3600 * 1000;
  return {
    begin,
    query:
      'SELECT sum(GigabytesIngested) AS gb FROM NrConsumption ' +
      "WHERE productLine = 'DataPlatform' " +
      'FACET consumingAccountId, consumingAccountName ' +
      `TIMESERIES 1 day SINCE ${begin} UNTIL ${Math.floor(end)} LIMIT 300`
  };
}
