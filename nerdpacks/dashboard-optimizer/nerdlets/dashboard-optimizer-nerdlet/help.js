import React from 'react';

// The "How this works" page for the Dashboards tab. The measured numbers come from running queries on a reference account
// and reading rawResponse.queryUsage (see .claude/skills/ccu-invariance-with-filtering/references/measured-behaviour.md).

const COSTS = [
  ['A long time window', 'Linear in the window', 'A 1-hour query scans about 5% of the data of a 1-day query; 3 days is 2.5x, 7 days is 8x. This is the biggest lever by far.', 'Shorten it, or let people pick the range with the time picker.'],
  ['FACET', 'Doubles the scan (2.0x)', 'Measured at exactly twice the cost of the same query without it, whatever the attributes, however many, whatever the LIMIT or cardinality. FACET cases() is the exception.', 'Drop it where a single number will do; move breakdowns to a drill-down widget or page.'],
  ['COMPARE WITH', 'About 1.8x to 2x', 'It scans the earlier period as well.', 'Compare short windows only, or leave it off busy dashboards.'],
  ['Raw events instead of pre-aggregated data', 'Scans far more events', 'Log, Span and Transaction hold millions of events. An Events-to-Metrics rule or a Metric timeslice answers the same recurring question from a handful of points.', 'Convert recurring aggregations to Events to Metrics.'],
  ['Several event types or accounts', 'The scans add up', 'FROM Transaction, Span costs the sum of both. A cross-account query scans each account.', 'Query only what you need.'],
  ['Running very often', 'Multiplies everything', 'Cost per run is small, but auto-refresh, TV mode and 5-minute windows re-run the query constantly. A static scan cannot see this, only the Runs column can.', 'Lengthen the refresh interval; avoid tiny windows on auto-refreshing dashboards; close idle tabs and TV displays.'],
  ['Many heavy widgets on one page', 'They all run together', 'Every widget on a page runs when it opens, so heavy ones multiply each load.', 'Move the heaviest to a separate "deep analysis" page so they run only when opened.'],
  ['A long time picker range', 'Hidden from the NRQL', 'Widgets without their own SINCE follow the picker. The usage records show the window they were really run with ("Typically run over 4 weeks").', 'Set a short default range on the dashboard.']
];

const FINE = [
  ['A narrower WHERE', 'Even on indexed attributes like appName and entity.guid, even when it matches nothing. The events are scanned first, then filtered.'],
  ['LIMIT', 'LIMIT 5 costs the same as LIMIT MAX. Only the number of rows returned changes.'],
  ['SELECT *', 'Costs the same as selecting one column.'],
  ['TIMESERIES bucket size', 'Any bucket, or AUTO.'],
  ['SLIDE BY', 'No extra scan.'],
  ['percentile(), uniques(), uniqueCount()', 'Or several aggregates in one query.'],
  ['filter() inside SELECT', 'Same as putting the condition in WHERE, and several filter() columns cost the same as one.'],
  ['Plain subqueries and backticks', 'Only a FACET inside a subquery matters.']
];

export default function DashboardsHelp({ onClose }) {
  return (
    <div className="card helppage">
      <div className="toolbar">
        <h2>How this works</h2>
        <span className="spacer" />
        <button className="btn small" onClick={onClose}>Back to dashboards</button>
      </div>

      <h3>The idea</h3>
      <p>
        Every dashboard you can see is scanned, and each widget's NRQL is checked for things that make a query scan more data.
        That is matched to the CCU each dashboard really used, from the usage records. The point is to show you where
        optimising is worth the effort, not to list every imperfect query.
      </p>
      <p>
        <strong>CCU follows the number of events a query scans, not the number of results it returns</strong> (about 8e-10 CCU
        per event, the same on every table). So only things that change how many events get scanned can save CCU.
      </p>

      <h3>How dashboards are grouped and ranked</h3>
      <table className="helptable">
        <tbody>
          <tr><th>Candidates</th><td>Used CCU in the chosen period <strong>and</strong> has at least one high or medium finding. These are worth fixing: they cost something now and have something to fix. Low findings never make a candidate.</td></tr>
          <tr><th>Heavy, nothing to fix</th><td>Not a candidate, but 2% or more of all dashboard CCU. The queries are fine; the cost is how often it runs. Check auto-refresh, TV mode, integrations and whether anyone still uses it.</td></tr>
          <tr><th>Latent risk</th><td>Flagged high but no CCU recorded in this period. Fixing these saves nothing today; worth tidying if they get used.</td></tr>
          <tr><th>All dashboards</th><td>Everything that used CCU or has a finding, including low-severity housekeeping.</td></tr>
        </tbody>
      </table>
      <p>Within a group, rows are sorted by <strong>CCU used</strong>, biggest spender first, because real spend is the best guide to where effort pays. Click any column header to sort by something else; hover the ⓘ next to a header for what it means and how it is worked out.</p>

      <h3>The risk score (0 to 100)</h3>
      <p>
        One number combining how a dashboard is <em>written</em> with how it is <em>used</em>, so it can rank high because of
        either. It is a guide to attention, not a measurement.
      </p>
      <ul>
        <li><strong>Up to 70 from findings.</strong> Each high finding is 10 points, medium 4, low 1. The total is curved as 70 x (1 - e^(-points/50)), so dozens of flags cannot run off the scale.</li>
        <li><strong>Up to 30 from observed CCU.</strong> 30 x the square root of (this dashboard's CCU / the biggest spender's CCU in the period). A dashboard at a quarter of the top spender scores 15.</li>
        <li><strong>Bands:</strong> 60 and above is high (▲), 30 to 59 medium (●), below 30 low (○).</li>
      </ul>
      <p className="muted">Example: 5 high and 5 medium findings is 70 points, which scores 53 from findings. At a quarter of the top spender's CCU it gains 15 more, so 68: high.</p>

      <h3>What costs CCU (and is flagged)</h3>
      <p>Severity depends on the size of the data: a long window on Log, Span, Metric or Transaction is high; on other tables medium; on small usage and entity tables it is not flagged under 90 days.</p>
      <table className="helptable wide">
        <thead><tr><th>Pattern</th><th>Effect (measured)</th><th>Why</th><th>What to do</th></tr></thead>
        <tbody>{COSTS.map(r => <tr key={r[0]}><th>{r[0]}</th><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>)}</tbody>
      </table>
      <p className="muted">FACET and COMPARE WITH are only flagged when the scan underneath is already big (a day or more on a large table, a week or more on other tables, and never on small usage or entity tables). Doubling a 1-hour query is noise.</p>

      <h3>What does not matter (and is never flagged)</h3>
      <p>These were each measured and changed the cost by exactly nothing. They are fine as good practice for readability, but do not expect them to save CCU, and do not let anyone spend time on them for cost.</p>
      <table className="helptable wide">
        <tbody>{FINE.map(r => <tr key={r[0]}><th>{r[0]}</th><td>{r[1]}</td></tr>)}</tbody>
      </table>

      <h3>Where the numbers come from</h3>
      <ul>
        <li><strong>CCU used, Runs, Avg window:</strong> the NrComputeUsage records for NRDB queries that ran from a dashboard, matched to the dashboard by its ID. Core CCU only (dashboards do not use aCCU). It covers usage billed to a reference account.</li>
        <li><strong>Findings:</strong> a scan of every widget's NRQL across the dashboards you can see, plus a flag when the usage records show a long window the NRQL does not reveal.</li>
        <li><strong>Measure:</strong> runs a query, and the same query over a shorter window, and reads the CCU New Relic reports for each. This is the real saving per run, not an estimate. It costs about one dashboard load, so it only runs when you click, and it cannot run queries that use dashboard variables.</li>
      </ul>

      <h3>Limits to keep in mind</h3>
      <ul>
        <li>Flags are heuristics: "worth a look", not "wrong". A long window can be exactly what a report needs.</li>
        <li>The measurements were taken on this account in October 2026. The per-event cost looked the same on every table, but re-measure before quoting figures elsewhere.</li>
        <li>Refresh frequency, 5-minute windows and the apm.service.transaction.overview metric come from New Relic's compute guide and have not been measured here.</li>
        <li>Dashboard CCU is a small share of total CCU; most of it is elsewhere (users' queries, synthetics, alerts). This tab only covers the dashboard part.</li>
      </ul>

      <h3>A good way to use it</h3>
      <ol>
        <li>Open <strong>Candidates</strong>, biggest spender first.</li>
        <li>Expand a row to see why, and the exact queries it ran.</li>
        <li>Press <strong>Measure</strong> on the worst query to see the real saving from a shorter window.</li>
        <li>Make the change in the dashboard, then check the same row next period.</li>
        <li>Look at <strong>Heavy, nothing to fix</strong> for refresh and TV-mode problems.</li>
      </ol>
    </div>
  );
}
