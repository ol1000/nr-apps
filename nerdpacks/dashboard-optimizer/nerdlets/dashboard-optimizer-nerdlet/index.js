import React from 'react';
import DashboardsTab from './view';
import { scanDashboards, fetchObserved, listAccounts } from './lib/dashboards';
import { analyseDashboards } from './lib/lint';
import { ACCOUNT_NAME, ACCOUNT_ID, HISTORY_MONTHS } from './lib/config';
import { monthKey, historyMonths } from './lib/data';
import { monthLabel } from './lib/format';
import './styles.scss';

export default class DashboardOptimizer extends React.Component {
  constructor(props) {
    super(props);
    const now = new Date();
    this.months = historyMonths(now, HISTORY_MONTHS);
    this.state = {
      month: monthKey(now), period: 'month', accounts: {},
      dash: { status: 'idle', done: 0, total: 0, analysed: null, error: null },
      obs: { status: 'idle', data: null, error: null }
    };
  }

  componentDidMount() { this.ensureDash(); }

  onMonth = month => this.setState({ month }, () => this.loadObserved());

  onPeriod = period => this.setState({ period }, () => this.loadObserved());

  onRefresh = () => {
    this.setState({ dash: { status: 'idle', done: 0, total: 0, analysed: null, error: null }, obs: { status: 'idle', data: null, error: null } }, () => this.ensureDash());
  };

  ensureDash() {
    const { dash } = this.state;
    if (dash.status === 'loading' || dash.status === 'done') return;
    this.setState({ dash: { status: 'loading', done: 0, total: 0, analysed: null, error: null } });
    listAccounts().then(accounts => this.setState({ accounts })).catch(() => {});
    this.loadObserved();
    scanDashboards((done, total) => this.setState(s => (s.dash.status === 'loading' ? { dash: { ...s.dash, done, total } } : null)))
      .then(entities => this.setState({ dash: { status: 'done', done: entities.length, total: entities.length, analysed: analyseDashboards(entities), error: null } }))
      .catch(e => {
        console.error('[dashboard-optimizer] dashboard scan failed', e);
        this.setState({ dash: { status: 'error', done: 0, total: 0, analysed: null, error: (e && e.message) || String(e) } });
      });
  }

  async loadObserved() {
    const { month, period } = this.state;
    const key = `${month}|${period}`;
    this.obsKey = key;
    this.setState(s => ({ obs: { ...s.obs, status: 'loading', error: null } }));
    try {
      const data = await fetchObserved(month, period);
      if (this.obsKey === key) this.setState({ obs: { status: 'done', data, error: null } });
    } catch (e) {
      console.error('[dashboard-optimizer] observed usage failed', e);
      if (this.obsKey === key) this.setState({ obs: { status: 'error', data: null, error: (e && e.message) || String(e) } });
    }
  }

  render() {
    const { month, period, accounts, dash, obs } = this.state;
    return (
      <div className="ccu core">
        <header className="topbar">
          <div className="brand">
            <h1>Dashboard Optimizer <small>{ACCOUNT_NAME} · {ACCOUNT_ID}</small></h1>
          </div>
          <div className="controls">
            <select value={month} onChange={e => this.onMonth(e.target.value)} aria-label="Month">
              {this.months.slice().reverse().map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <button className="btn" onClick={this.onRefresh}>Refresh</button>
          </div>
        </header>
        <DashboardsTab dash={dash} obs={obs} month={month} period={period} accounts={accounts} onPeriod={this.onPeriod} />
      </div>
    );
  }
}
