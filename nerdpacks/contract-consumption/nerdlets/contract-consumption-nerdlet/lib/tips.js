// Explanations shown in the "i" pop-ups. One place, so wording stays consistent with the calculations in contract.js.

export const TIPS = {
  plan: {
    volume: 'Volume Plan: you commit to a minimum volume per metric every month (users, data GB, Core CCU, aCCU). The deal value is calculated from those minimums. Usage above a minimum is overage, billed that month at the overage rate; an optional prepaid top-up is applied as credit against those bills.',
    savings: 'Savings Plan: the same minimum volumes per metric every month. The deal value is calculated from them and drawn down by the minimums each month. Usage above a minimum is overage: it draws on the prepaid top-up first, then is billed pay-as-you-go.'
  },

  // ---- the deal cards
  dealValue: 'Calculated, not entered. For every month of the term it adds up each tracked metric\'s monthly minimum x its plan rate. The minimums are drawn from it in full every month, whether or not the usage happens. Metrics without a plan rate are left out.',
  dealDrawn: 'The minimums for finished months plus the whole current month (a monthly minimum applies for the whole month), valued at the plan rate. "Left" is the deal value minus this. The bar shows how much is drawn; the black tick shows how much of the term has passed.',
  dealUnused: 'Finished months only: for each metric where usage was below the minimum, (minimum - usage) x plan rate. It is still drawn from the deal value. It is never credited to another month or another metric.',
  topUp: {
    volume: 'A prepaid amount you enter, applied as credit against overage bills month by month. "Left" is the top-up minus the overage bills credited so far. When it is used up, overage bills are invoiced in full. The run-out date projects the average overage of the last three finished months.',
    savings: 'A prepaid amount you enter. Overage (usage above a minimum, valued at the plan rate) draws on it first. "Left" is the top-up minus the overage so far. Once it is used up, overage is pay-as-you-go at the PAYG rates. The run-out date projects the average overage of the last three finished months.'
  },
  overageBill: 'For each month: units above the minimum x the overage rate (the plan rate if no overage rate is set). It is billed in that month and never netted against another month or another metric. "Covered by the top-up" is the prepaid credit applied; "invoiced" is the rest. The projection continues the average of the last three finished months.',
  invoiced: 'What has been invoiced so far: the monthly minimums (finished months plus the whole current month) plus the overage bills the top-up did not cover.',
  missingRates: 'A metric with a monthly minimum but no plan rate cannot be valued in money, so it is left out of the deal value, the top-up and the overage figures. Enter its plan rate under Edit contract.',

  // ---- status chips
  status: {
    nocommit: 'No monthly minimum has been entered, so there is nothing to compare usage against.',
    norates: 'Minimums are set but no plan rate, so the money cannot be calculated. Units are still shown.',
    ontrack: 'Usage is in line with the minimums and any overage is covered by the top-up.',
    under: 'More than 10% of the minimums drawn so far had no usage behind it: you are paying for minimum you are not using.',
    depletes: 'At the recent overage run-rate the top-up will be used up before the term ends.',
    depleted: 'The top-up is used up. Further overage is no longer covered.',
    notopup: 'There is overage and no top-up amount entered, so it is billed straight away.'
  },
  metricStatus: {
    nocommit: 'No monthly minimum is set for this metric.',
    nodata: 'A minimum is set but no usage has been recorded yet.',
    ontrack: 'The run-rate is between 90% and 100% of the minimum.',
    under: 'Usage is below the minimum (data/CCU: the run-rate is under 90% of it; users: the latest peak is below it). You are paying for minimum you are not using.',
    over: 'Usage is above the minimum (data/CCU: the run-rate is over 100% of it; users: the latest peak is above it). Expect overage.'
  },

  // ---- metric cards
  metricCard: 'Big number: usage this month so far (or last month if nothing has been recorded yet). Users are the monthly peak. "Minimum" is this metric\'s monthly minimum for the current contract year. "Run-rate" is the average of the last three finished months, shown as a % of the minimum (the bar passes the black tick when usage is above it). The counts say how many finished months were above or below the minimum. Overage / not-used totals add up the units over or under the minimum across finished months.',

  // ---- charts
  chart: 'Each bar is one month\'s usage; the dark line is that month\'s minimum. Blue: within the minimum. Amber with a dashed outline: below it (the dashed part is unused minimum). Red on top: above it (overage). A faded bar is the month in progress, which is not judged yet. Future months show only the minimum line. Hover a bar for exact figures. Charts show units, never money.',
  chartUsers: 'Users: monthly peak. One colour per user type, side by side for each month. Each type has its own minimum line. Red on top is users above the minimum; the dashed outline is users below it.',

  // ---- controls
  groupBy: 'Contract year groups the months from the start month of the term; calendar year groups them Jan-Dec. Only the grouping rows in the grid change.',
  tabs: 'Filter the cards, charts and grid by metric group: users, data, or CCU / aCCU. All shows everything that is being tracked.',
  usageSource: 'Usage comes from the organisation\'s main account (the NrConsumption and NrMTDConsumption usage events). The contract inputs are saved to account storage, or to this browser if account storage is not available.',

  // ---- grid columns
  grid: {
    month: 'Calendar month. "MTD" marks the month in progress (month to date). The grey group rows are totals for the contract or calendar year.',
    metric: 'Usage that month. The small bar is usage as a % of that month\'s minimum (red when over it); "+x above" is the amount over the minimum. Users are the monthly peak. Group rows show the year\'s total (users: highest peak) against the year\'s minimums.',
    minimum: 'The value of that month\'s minimums: minimum x plan rate, added up across the tracked metrics. Drawn from the deal value in full, used or not.',
    overageBill: 'Overage billed in that month: units above each metric\'s minimum x the overage rate, added up. Not netted against other months or metrics.',
    overageSavings: 'Overage in that month: units above each metric\'s minimum x the plan rate, added up. It draws on the top-up.',
    topUpCredit: 'The part of that month\'s overage bill paid from the prepaid top-up.',
    invoiced: 'The part of that month\'s overage bill the top-up did not cover: what is invoiced.',
    topUpLeft: 'Prepaid top-up remaining after that month.',
    payg: 'The part of the overage the top-up did not cover, billed pay-as-you-go at the PAYG rates (an estimate).',
    dealLeft: 'Deal value minus all the minimums drawn up to and including that month.'
  },

  // ---- setup panel
  setup: {
    term: 'The contract term. Months are shown as whole calendar months from the start month, and contract years run from that month. An end date on the anniversary of the start (or the day before) is a whole number of years.',
    topUp: 'A prepaid amount that covers overage (usage above a minimum). Leave it empty if there is none.',
    currency: 'Only used to label the money values.',
    basis: 'Whether free usage counts towards the minimum: Total uses billable + free, Billable only uses just the billable part.',
    minimums: 'The minimum for each metric, per month. Users are a minimum number of users (monthly peak); data and CCU are the minimum consumed each month. Tick Track to include a metric. A later year left blank keeps the previous year\'s minimum.',
    planRate: 'Price per unit the minimums are valued at (users: per user per month). The deal value is minimum x this rate. Savings Plan overage draws on the top-up at this rate.',
    overRate: 'Price per unit of usage above the minimum. Leave blank to use the plan rate.',
    paygRate: 'Price per unit once the top-up is used up. Leave blank to use the plan rate.',
    manual: 'Months before New Relic\'s usage history starts have no recorded usage. Enter what you know here so they count towards the totals. Real usage always wins over a manual figure.'
  }
};
