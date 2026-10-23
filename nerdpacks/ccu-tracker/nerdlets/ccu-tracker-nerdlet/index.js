import React from 'react';
import { NerdGraphQuery } from 'nr1';
import CcuView from './view';
import { ACCOUNT_ID, ACCOUNT_NAME, HISTORY_MONTHS } from './lib/config';
import { GQL, monthKey, historyMonths, monthQuery, dailyQuery, parseMonth, parseDaily, buildMonth, buildHistory } from './lib/data';
import { loadBudget, saveBudget, mergeBudget, loadPaused, savePaused } from './lib/storage';
import { LABEL } from './lib/format';
import './styles.scss';

const clone = o => JSON.parse(JSON.stringify(o));

function errorText(res) {
  const errs = (res && (res.errors || res.error)) || null;
  if (!errs) return null;
  if (Array.isArray(errs)) return errs.map(e => e.message || String(e)).join('; ');
  return errs.message || String(errs);
}

async function runNrql(query) {
  const res = await NerdGraphQuery.query({ query: GQL, variables: { id: ACCOUNT_ID, q: query } });
  const nrql = res && res.data && res.data.actor && res.data.actor.account && res.data.actor.account.nrql;
  if (!nrql) throw new Error(errorText(res) || 'No data returned');
  return nrql.results;
}

export default class CcuTracker extends React.Component {
  constructor(props) {
    super(props);
    this.now = new Date();
    this.months = historyMonths(this.now, HISTORY_MONTHS);
    this.monthCache = {};
    this.dailyCache = {};
    const budget = mergeBudget(null);
    this.state = {
      side: 'core', month: monthKey(this.now), budget, draft: clone(budget), source: 'none',
      datas: null, dailies: {}, loading: true, error: null,
      search: '', hideZero: true, tip: null, budgetOpen: false, saveText: '',
      paused: {}, confirm: null, notice: null
    };
  }

  async componentDidMount() {
    const { budget, source } = await loadBudget();
    this.setState({ budget, draft: clone(budget), source });
    this.load();
    loadPaused().then(paused => this.setState({ paused })).catch(e => {
      console.error('[ccu-tracker] could not load the paused list', e);
      this.setState({ notice: { tone: 'bad', text: `Could not load the paused-users list, so Resume buttons may be missing: ${(e && e.message) || e}` } });
    });
  }

  getMonth(m) {
    if (!this.monthCache[m]) this.monthCache[m] = runNrql(monthQuery(m)).then(parseMonth);
    return this.monthCache[m];
  }

  getDaily(m) {
    if (!this.dailyCache[m]) this.dailyCache[m] = runNrql(dailyQuery(m)).then(rows => parseDaily(rows, m));
    return this.dailyCache[m];
  }

  async load() {
    this.setState({ loading: true, error: null });
    try {
      const datas = await Promise.all(this.months.map(m => this.getMonth(m)));
      const daily = await this.getDaily(this.state.month);
      this.setState(s => ({ datas, dailies: { ...s.dailies, [s.month]: daily }, loading: false }));
    } catch (e) {
      // a failed query must not stay cached
      this.monthCache = {};
      this.dailyCache = {};
      this.setState({ loading: false, error: e.message || String(e) });
    }
  }

  onMonth = async month => {
    this.setState({ month, tip: null });
    try {
      const daily = await this.getDaily(month);
      this.setState(s => ({ dailies: { ...s.dailies, [month]: daily }, error: null }));
    } catch (e) {
      this.dailyCache = {};
      this.setState({ error: e.message || String(e) });
    }
  };

  onRefresh = () => {
    this.monthCache = {};
    this.dailyCache = {};
    this.now = new Date();
    this.setState({ datas: null, dailies: {} }, () => this.load());
  };

  onSaveBudget = async () => {
    this.setState({ saveText: 'Saving...' });
    const where = await saveBudget(this.state.draft);
    const saveText = where === 'account' ? 'Saved to account storage.'
      : where === 'browser' ? 'Saved in this browser only (account storage was not available).' : 'Could not save.';
    if (where === 'failed') { this.setState({ saveText }); return; }
    this.setState({ budget: clone(this.state.draft), source: where, saveText });
  };

  onDraft = (side, field, value) => this.setState(s => ({ draft: { ...s.draft, [side]: { ...s.draft[side], [field]: value } }, saveText: '' }));

  onUserTip = (e, user) => this.setState({ tip: { kind: 'user', user, x: e.clientX, y: e.clientY } });

  onMonthTip = (e, row) => this.setState({ tip: { kind: 'month', row, x: e.clientX, y: e.clientY } });

  // Pause / Restore is display-only: it marks the user in this app (kept in account storage so everyone sees it)
  // and does not change anyone's access in New Relic.
  onPauseAsk = u => this.setState({ confirm: { kind: 'pause', email: u.email } });

  onResumeAsk = u => this.setState({ confirm: { kind: 'resume', email: u.email } });

  onCancelConfirm = () => { if (!(this.state.confirm && this.state.confirm.busy)) this.setState({ confirm: null }); };

  onConfirm = async () => {
    const { confirm, paused } = this.state;
    if (!confirm || confirm.busy) return;
    this.setState({ confirm: { ...confirm, busy: true, error: null } });
    const key = confirm.email.toLowerCase();
    const next = { ...paused };
    if (confirm.kind === 'pause') next[key] = { email: confirm.email, pausedAt: new Date().toISOString() };
    else delete next[key];
    try {
      await savePaused(next);
      const text = confirm.kind === 'pause' ? `Paused ${confirm.email}.` : `Restored access for ${confirm.email}.`;
      this.setState({ paused: next, confirm: null, notice: { tone: 'good', text } });
    } catch (e) {
      console.error('[ccu-tracker] could not save the paused list', e);
      this.setState(st => ({ confirm: { ...st.confirm, busy: false, error: `Could not save: ${(e && e.message) || e}` } }));
    }
  };

  onCsv = () => {
    const { side, month, budget } = this.state;
    const view = this.view();
    if (!view) return;
    const users = view.metrics[side].users;
    const perUser = Number(budget[side].perUser) || '';
    const q = s => `"${String(s).replace(/"/g, '""')}"`;
    const products = [...new Set(users.flatMap(u => u.products.map(p => p.name)))];
    const lines = [['rank', 'user', LABEL[side], 'budget', 'pct_of_budget', 'projected_month_end', 'prev_month', ...products.map(p => `product: ${p}`)]];
    users.forEach((u, i) => lines.push([
      i + 1, u.email, u.total, perUser, perUser ? (u.total / perUser).toFixed(4) : '', u.projected, u.prevTotal,
      ...products.map(p => (u.products.find(x => x.name === p) || { value: 0 }).value)
    ]));
    const csv = lines.map(r => r.map(c => (typeof c === 'string' ? q(c) : c)).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${LABEL[side]}-${month}.csv`;
    a.click();
  };

  view() {
    const { datas, month, dailies } = this.state;
    if (!datas || !dailies[month]) return null;
    const i = this.months.indexOf(month);
    return buildMonth(month, datas[i], i > 0 ? datas[i - 1] : null, dailies[month], this.now);
  }

  render() {
    const s = this.state;
    return (
      <CcuView
        accountName={ACCOUNT_NAME} accountId={ACCOUNT_ID}
        side={s.side} month={s.month} months={this.months} datas={s.datas}
        history={s.datas ? buildHistory(this.months, s.datas) : null}
        view={this.view()} budget={s.budget} search={s.search} hideZero={s.hideZero}
        tip={s.tip} error={s.error} loading={s.loading} source={s.source}
        budgetOpen={s.budgetOpen} draft={s.draft} saveText={s.saveText}
        onMonth={this.onMonth} onSide={side => this.setState({ side, tip: null })}
        onSearch={search => this.setState({ search })} onHideZero={hideZero => this.setState({ hideZero })}
        onUserTip={this.onUserTip} onMonthTip={this.onMonthTip} onLeave={() => this.setState({ tip: null })}
        onBudget={() => this.setState({ budgetOpen: true, draft: clone(s.budget), saveText: '' })}
        onCloseBudget={() => this.setState({ budgetOpen: false })}
        onDraft={this.onDraft} onSaveBudget={this.onSaveBudget}
        onCsv={this.onCsv} onRefresh={this.onRefresh}
        paused={s.paused} confirm={s.confirm} notice={s.notice} onDismissNotice={() => this.setState({ notice: null })}
        onPauseAsk={this.onPauseAsk} onResumeAsk={this.onResumeAsk} onConfirm={this.onConfirm} onCancelConfirm={this.onCancelConfirm}
      />
    );
  }
}
