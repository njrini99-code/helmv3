# Free Production Readiness Stack

This branch wires the free/open-source production-readiness foundation for Helm without changing product behavior.

## Installed Tools

Repo dev dependencies:

- `fast-check`
- `@stryker-mutator/core`
- `@stryker-mutator/vitest-runner`
- `dependency-cruiser`
- `jscpd`
- `knip`
- `@axe-core/playwright`
- `@lhci/cli`

Machine CLIs verified on this workstation:

- `semgrep`
- `gitleaks`
- `osv-scanner`
- `k6`

## New Lanes

- `npm run test:business`: low-gray Vitest business contracts.
- `npm run test:business:advisory`: source-shape advisory contracts.
- `npm run routes:check`: route inventory plus duplicate/stale/boundary/coverage/dead-route checks.
- `npm run analyze:semgrep`: Helm Semgrep CE rules.
- `npm run analyze:deps`: dependency-cruiser architecture report.
- `npm run analyze:duplicates`: jscpd duplicate-code report (scans `src/`; ignores generated artifacts via `.jscpd.json`).
- `npm run prod:audit:db`: SELECT-only production DB audit. Skips with a clear JSON status when `PROD_AUDIT_DATABASE_URL` is unset.
- `npm run db:audit:local`: same audit against local Supabase via `LOCAL_DB_AUDIT_DATABASE_URL` or `DATABASE_URL`.
- `npm run auditor:all`: aggregates generated reports into issue drafts.

Generated reports go under `docs/operations/generated/` and are ignored by git.

## Production DB audit (`PROD_AUDIT_DATABASE_URL`)

The read-only production DB audit checks RLS coverage, primary keys, and unsafe `SECURITY DEFINER` functions. It never mutates data (`default_transaction_read_only = on`, 10s statement timeout).

### GitHub Actions

1. In the repo: **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `PROD_AUDIT_DATABASE_URL`
3. Value: a **read-only** Postgres connection string for production (Supabase: Project Settings → Database → Connection string, use a dedicated read-only role if possible)
4. The `prod-db-audit` job in `.github/workflows/free-production-readiness.yml` runs on every PR and `workflow_dispatch`.

When the secret is **missing**, CI still passes: the script writes `docs/operations/generated/prod-db-audit-findings.json` with `"skipped": true` and `"finding_count": 0`. The Helm auditor does not open a recurring issue for that skip.

When the secret is **present**, real P0/P1 findings are aggregated by `npm run auditor:all` and may produce issue drafts under `docs/operations/revealed-bugs/production-readiness/`.

### Local runs

Production (read-only URL you control):

```bash
export PROD_AUDIT_DATABASE_URL='postgresql://readonly:...@...:5432/postgres'
npm run prod:audit:db
cat docs/operations/generated/prod-db-audit-findings.json
```

Local Supabase stack:

```bash
# optional override; otherwise uses DATABASE_URL from .env.local
export LOCAL_DB_AUDIT_DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'
npm run db:audit:local
```

Full production-readiness sweep (includes DB audit when the env var is set):

```bash
npm run prod:audit:db && npm run auditor:all
```

### Capacitor iOS web bundle (untracked)

`ios/App/App/public/` and `ios/App/App/config.xml` are **gitignored** — they are regenerated on every native build via `npx cap sync ios`. Xcode Cloud runs this in `ios/App/ci_scripts/ci_post_clone.sh` (phase 5) after `npm ci`.

Do not commit Capacitor sync output; CI and local iOS builds reproduce it from `public/` + `capacitor.config.ts`.

## Gate Posture

Immediate hard candidates:

- Business contracts
- Route Hygiene P0/P1
- Existing CI hard gates
- Existing Review Gate / gitleaks / semgrep / CodeQL checks

Advisory first:

- Business source-shape advisory
- Stryker mutation pilots
- Knip
- jscpd
- dependency-cruiser lower-severity findings
- k6 staging load
- Lighthouse public route budgets

## Gray-Test Cleanup

Source-sniffing contracts were moved to `*.advisory.contract.test.ts`. The low-gray path now includes pure product-trust state mappers and property contracts for GolfHelm stats.
