// Settings for this install.

// The organisation's MAIN (master) account. NrConsumption only holds every account's usage when queried from it.
export const USAGE_ACCOUNT_ID = 2033508;

// Days of daily history requested (must be at least 2 * WINDOW + BASELINE_DAYS for the longest window).
export const HISTORY_DAYS = 35;

// Days before the selected window used to learn what "normal" ingest looks like for an account.
export const BASELINE_DAYS = 14;

// Longest selectable window in days (the time picker is mapped onto 1..MAX_WINDOW_DAYS).
export const MAX_WINDOW_DAYS = 7;

// Anomaly rules. z = (ingest - expected) / normal spread.
export const Z_ELEVATED = 2.5; // amber
export const Z_OVER = 4; // red
// Ignore deviations smaller than this many GB per day, so tiny accounts do not trigger alerts.
export const MIN_EXCESS_GB_PER_DAY = 0.1;
// Fewer than this many baseline days with ingest = "New / no history" (no verdict).
export const MIN_HISTORY_DAYS = 5;
