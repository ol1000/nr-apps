import React from 'react';
import { PlatformStateContext, NerdGraphQuery } from 'nr1';
import ExplorerView from './explorer-view';
import { ACCOUNT_ID, GQL, buildGroupQuery, mapResults, buildRows, resolveRange } from './lib/queries';
import './styles.scss';

function errorText(res) {
  const errs = (res && (res.errors || res.error)) || null;
  if (!errs) return null;
  if (Array.isArray(errs)) return errs.map(e => e.message || String(e)).join('; ');
  return errs.message || String(errs);
}

async function runGroupQuery(params, begin, end) {
  const q = buildGroupQuery({ ...params, begin, end });
  const res = await NerdGraphQuery.query({ query: GQL, variables: { id: ACCOUNT_ID, q } });
  const err = errorText(res);
  const nrql = res && res.data && res.data.actor && res.data.actor.account && res.data.actor.account.nrql;
  if (!nrql) throw new Error(err || 'No data returned');
  return mapResults(nrql.results);
}

class Explorer extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      groupKey: 'repository',
      branch: 'default',
      search: '',
      queriedSearch: '',
      mode: 'values',
      sort: { key: 'executions', dir: 'desc' },
      page: 0,
      extraCols: [],
      showColumnsMenu: false,
      rows: [],
      loading: true,
      error: null,
      refresh: 0
    };
    this.requestId = 0;
    this.searchTimer = null;
  }

  componentDidMount() {
    this.load();
  }

  componentDidUpdate(prevProps, prevState) {
    const rangeChanged = JSON.stringify(prevProps.timeRange) !== JSON.stringify(this.props.timeRange);
    const s = this.state;
    if (
      rangeChanged ||
      prevState.groupKey !== s.groupKey ||
      prevState.branch !== s.branch ||
      prevState.queriedSearch !== s.queriedSearch ||
      prevState.refresh !== s.refresh
    ) {
      this.load();
    }
  }

  componentWillUnmount() {
    clearTimeout(this.searchTimer);
  }

  async load() {
    const id = ++this.requestId;
    const { groupKey, branch, queriedSearch } = this.state;
    const [begin, end] = resolveRange(this.props.timeRange);
    const span = end - begin;
    const params = { groupKey, branch, search: queriedSearch || '' };
    this.setState({ loading: true, error: null, page: 0 });
    try {
      // current and previous period in parallel; the previous one drives the Change column
      const [cur, prev] = await Promise.all([
        runGroupQuery(params, begin, end),
        runGroupQuery(params, begin - span, begin).catch(() => null)
      ]);
      if (id !== this.requestId) return; // a newer request superseded this one
      this.setState({ rows: buildRows(cur, prev), loading: false });
    } catch (e) {
      if (id !== this.requestId) return;
      this.setState({ rows: [], loading: false, error: e.message || String(e) });
    }
  }

  onSearch = value => {
    this.setState({ search: value });
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.setState({ queriedSearch: value }), 500);
  };

  onSort = key => {
    this.setState(({ sort }) => ({
      sort: sort.key === key ? { key, dir: sort.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'name' ? 'asc' : 'desc' },
      page: 0
    }));
  };

  onToggleCol = key => {
    this.setState(({ extraCols }) => ({
      extraCols: extraCols.indexOf(key) >= 0 ? extraCols.filter(k => k !== key) : [...extraCols, key]
    }));
  };

  render() {
    const s = this.state;
    return (
      <ExplorerView
        rows={s.rows}
        loading={s.loading}
        error={s.error}
        groupKey={s.groupKey}
        branch={s.branch}
        search={s.search}
        mode={s.mode}
        sort={s.sort}
        page={s.page}
        extraCols={s.extraCols}
        showColumnsMenu={s.showColumnsMenu}
        onGroup={groupKey => this.setState({ groupKey })}
        onBranch={branch => this.setState({ branch })}
        onSearch={this.onSearch}
        onMode={mode => this.setState({ mode })}
        onSort={this.onSort}
        onPage={page => this.setState({ page })}
        onToggleCol={this.onToggleCol}
        onToggleColumnsMenu={() => this.setState(({ showColumnsMenu }) => ({ showColumnsMenu: !showColumnsMenu }))}
        onRefresh={() => this.setState(({ refresh }) => ({ refresh: refresh + 1 }))}
      />
    );
  }
}

export default class CicdExplorerNerdlet extends React.Component {
  render() {
    return (
      <PlatformStateContext.Consumer>
        {platformState => <Explorer timeRange={platformState && platformState.timeRange} />}
      </PlatformStateContext.Consumer>
    );
  }
}
