import React from 'react';
import { NerdGraphQuery } from 'nr1';
import ContractView from './view';
import { USAGE_ACCOUNT_ID } from './lib/config';
import { GQL, buildUsageQueries, parseUsage } from './lib/queries';
import { METRICS, defaultConfig, buildMonths, actualsFor, analyzeMetric, analyzeDeal } from './lib/contract';
import { loadConfig, saveConfig } from './lib/storage';
import './styles.scss';

const clone = o => JSON.parse(JSON.stringify(o));

/** Fill any field a saved contract is missing (older saves, new metrics) from the defaults. */
function mergeConfig(saved, now) {
  const d = defaultConfig(now);
  if (!saved) return d;
  const out = { ...d, ...saved };
  out.metrics = Object.fromEntries(METRICS.map(m => [m.key, { ...d.metrics[m.key], ...((saved.metrics || {})[m.key] || {}) }]));
  out.rates = Object.fromEntries(METRICS.map(m => [m.key, { ...d.rates[m.key], ...((saved.rates || {})[m.key] || {}) }]));
  // the deal value is calculated from the minimums; only the top-up amount and currency are stored
  const old = saved.savings || {};
  out.deal = { currency: (saved.deal && saved.deal.currency) || old.currency || d.deal.currency, topUp: saved.deal && saved.deal.topUp !== undefined ? saved.deal.topUp : old.buffer !== undefined ? old.buffer : '' };
  delete out.savings;
  out.overrides = saved.overrides || {};
  return out;
}

function errorText(res) {
  const errs = (res && (res.errors || res.error)) || null;
  if (!errs) return null;
  if (Array.isArray(errs)) return errs.map(e => e.message || String(e)).join('; ');
  return errs.message || String(errs);
}

async function runNrql(query) {
  const res = await NerdGraphQuery.query({ query: GQL, variables: { id: USAGE_ACCOUNT_ID, q: query } });
  const nrql = res && res.data && res.data.actor && res.data.actor.account && res.data.actor.account.nrql;
  if (!nrql) throw new Error(errorText(res) || 'No data returned');
  return nrql.results;
}

export default class ContractConsumption extends React.Component {
  constructor(props) {
    super(props);
    const cfg = defaultConfig(new Date());
    this.state = {
      cfg, draft: clone(cfg), source: 'none', usage: {}, loading: true, error: null,
      tab: 'all', groupBy: 'contract', setupOpen: false, saveState: {}, refresh: 0
    };
  }

  async componentDidMount() {
    const { config, source } = await loadConfig();
    const cfg = mergeConfig(config, new Date());
    // first visit: open the setup so the inputs are obvious
    this.setState({ cfg, draft: clone(cfg), source, setupOpen: !config }, () => this.loadUsage());
  }

  async loadUsage() {
    const { cfg } = this.state;
    const [sy, sm] = cfg.termStart.split('-').map(Number);
    const since = Date.UTC(sy, sm - 1, 1);
    const until = Date.now();
    if (since >= until) { this.setState({ usage: {}, loading: false, error: null }); return; }
    this.setState({ loading: true, error: null });
    try {
      const q = buildUsageQueries(since, until);
      const [sums, users] = await Promise.all([runNrql(q.sums), runNrql(q.users)]);
      this.setState({ usage: parseUsage(sums, users), loading: false });
    } catch (e) {
      this.setState({ usage: {}, loading: false, error: e.message || String(e) });
    }
  }

  onSave = async () => {
    const { draft, cfg } = this.state;
    if (draft.termStart > draft.termEnd) { this.setState({ saveState: { tone: 'bad', text: 'Term end must be after term start.' } }); return; }
    this.setState({ saveState: { text: 'Saving...' } });
    const where = await saveConfig(draft);
    const text = where === 'account' ? 'Saved to account storage.' : where === 'browser' ? 'Saved in this browser only (account storage was not available).' : 'Could not save.';
    const restartUsage = draft.termStart !== cfg.termStart;
    this.setState({ cfg: clone(draft), source: where === 'failed' ? this.state.source : where, saveState: { tone: where === 'failed' ? 'bad' : 'good', text } },
      () => { if (restartUsage) this.loadUsage(); });
  };

  render() {
    const s = this.state;
    const now = new Date();
    const { cfg } = s;
    const months = buildMonths(cfg.termStart, cfg.termEnd);
    const actualsByMetric = Object.fromEntries(METRICS.map(m => [m.key, actualsFor(m, s.usage, cfg.overrides, cfg.basis)]));
    const analyses = METRICS.filter(m => cfg.metrics[m.key].enabled).map(m => analyzeMetric(m, cfg.metrics[m.key], months, actualsByMetric[m.key], now));
    const deal = analyzeDeal(cfg, months, actualsByMetric, now);

    const dm = buildMonths(s.draft.termStart, s.draft.termEnd);
    const nowKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const missingMonths = s.loading ? [] : dm.filter(m => m.key < nowKey && s.usage[m.key] === undefined).map(m => m.key);

    return (
      <ContractView
        cfg={cfg} plan={cfg.plan} analyses={analyses} deal={deal}
        tab={s.tab} groupBy={s.groupBy} setupOpen={s.setupOpen}
        draft={s.draft} missingMonths={missingMonths} saveState={s.saveState}
        loading={s.loading} error={s.error} source={s.source} usageAccountId={USAGE_ACCOUNT_ID}
        onTab={tab => this.setState({ tab })}
        onGroupBy={groupBy => this.setState({ groupBy })}
        onToggleSetup={() => this.setState(({ setupOpen }) => ({ setupOpen: !setupOpen, draft: setupOpen ? s.draft : clone(s.cfg), saveState: {} }))}
        onDraft={draft => this.setState({ draft })}
        onSave={this.onSave}
        onReset={() => this.setState({ draft: clone(s.cfg), saveState: { text: 'Changes discarded.' } })}
        onRefresh={() => this.loadUsage()}
      />
    );
  }
}
