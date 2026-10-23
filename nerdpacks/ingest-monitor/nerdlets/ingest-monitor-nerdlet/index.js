import React from 'react';
import { PlatformStateContext, NerdGraphQuery } from 'nr1';
import MonitorView from './monitor-view';
import { USAGE_ACCOUNT_ID, HISTORY_DAYS, MAX_WINDOW_DAYS } from './lib/config';
import { GQL, buildIngestQuery } from './lib/queries';
import { parseSeries, buildAccountRows, summarize, resolveWindow } from './lib/stats';
import './styles.scss';

function errorText(res) {
  const errs = (res && (res.errors || res.error)) || null;
  if (!errs) return null;
  if (Array.isArray(errs)) return errs.map(e => e.message || String(e)).join('; ');
  return errs.message || String(errs);
}

class Monitor extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      series: new Map(),
      loading: true,
      error: null,
      filter: 'all',
      search: '',
      sort: { key: 'status', dir: 'asc' },
      page: 0,
      refresh: 0
    };
    this.requestId = 0;
  }

  componentDidMount() {
    this.load();
  }

  componentDidUpdate(prevProps, prevState) {
    // The 35-day history is fetched once per end time; the window length is applied client-side.
    const win = resolveWindow(this.props.timeRange, MAX_WINDOW_DAYS);
    const prevWin = resolveWindow(prevProps.timeRange, MAX_WINDOW_DAYS);
    if (prevState.refresh !== this.state.refresh || (prevProps.timeRange && JSON.stringify(prevProps.timeRange) !== JSON.stringify(this.props.timeRange) && Math.abs(win.end - prevWin.end) > 60000)) {
      this.load();
    }
  }

  async load() {
    const id = ++this.requestId;
    const { end } = resolveWindow(this.props.timeRange, MAX_WINDOW_DAYS);
    const { query, begin } = buildIngestQuery(end, HISTORY_DAYS);
    this.setState({ loading: true, error: null, page: 0 });
    try {
      const res = await NerdGraphQuery.query({ query: GQL, variables: { id: USAGE_ACCOUNT_ID, q: query } });
      const nrql = res && res.data && res.data.actor && res.data.actor.account && res.data.actor.account.nrql;
      if (!nrql) throw new Error(errorText(res) || 'No data returned');
      if (id !== this.requestId) return;
      this.setState({ series: parseSeries(nrql.results, begin, HISTORY_DAYS), loading: false });
    } catch (e) {
      if (id !== this.requestId) return;
      this.setState({ series: new Map(), loading: false, error: e.message || String(e) });
    }
  }

  render() {
    const s = this.state;
    const { days } = resolveWindow(this.props.timeRange, MAX_WINDOW_DAYS);
    const rows = buildAccountRows(s.series, days);
    return (
      <MonitorView
        rows={rows}
        summary={summarize(rows)}
        windowDays={days}
        loading={s.loading}
        error={s.error}
        filter={s.filter}
        search={s.search}
        sort={s.sort}
        page={s.page}
        usageAccountId={USAGE_ACCOUNT_ID}
        onFilter={filter => this.setState({ filter, page: 0 })}
        onSearch={search => this.setState({ search, page: 0 })}
        onSort={key => this.setState(({ sort }) => ({
          sort: sort.key === key ? { key, dir: sort.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' || key === 'status' ? 'asc' : 'desc' },
          page: 0
        }))}
        onPage={page => this.setState({ page })}
        onRefresh={() => this.setState(({ refresh }) => ({ refresh: refresh + 1 }))}
      />
    );
  }
}

export default class IngestMonitorNerdlet extends React.Component {
  render() {
    return (
      <PlatformStateContext.Consumer>
        {platformState => <Monitor timeRange={platformState && platformState.timeRange} />}
      </PlatformStateContext.Consumer>
    );
  }
}
