# nr-apps

New Relic apps and nerdpacks for compute (CCU) and ingest cost visibility.

| Path | What it is |
| --- | --- |
| `apps/ccu-tracker` | Zero-dependency local web app: per-user CCU/aCCU usage, budgets, month-end pace |
| `nerdpacks/ccu-tracker` | Nerdpack version of the CCU tracker |
| `nerdpacks/cicd-optimization` | CI/CD explorer nerdlet |
| `nerdpacks/contract-consumption` | Contract consumption vs. plan (Volume, Savings, Advantage). Full setup: [INSTALL.md](nerdpacks/contract-consumption/INSTALL.md) |
| `nerdpacks/dashboard-optimizer` | Dashboard query cost linting and rewrites |
| `nerdpacks/ingest-monitor` | Ingest monitor |

## Configuration

Account-specific values were removed from this copy. Before use:

- **`apps/ccu-tracker`**: set `NEWRELIC_API_KEY` and `NEWRELIC_ACCOUNT_ID` (optionally `NEWRELIC_ACCOUNT_NAME`, `NEWRELIC_GRAPHQL_URL` for EU) in the environment or a `.mcp.env` two folders up, then run `node server.js`.
- **Nerdpacks**: edit `lib/config.js` in each nerdlet and replace the `0` account IDs marked `TODO`, then deploy with the New Relic One CLI (`nr1`).
