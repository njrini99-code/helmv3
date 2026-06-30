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
- `npm run analyze:duplicates`: jscpd duplicate-code report.
- `npm run prod:audit:db`: SELECT-only DB audit; skips safely without `PROD_AUDIT_DATABASE_URL`.
- `npm run auditor:all`: aggregates generated reports into issue drafts.

Generated reports go under `docs/operations/generated/` and are ignored by git.

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
