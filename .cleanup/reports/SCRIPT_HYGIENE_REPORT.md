# Script Hygiene Report

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

## Existing Scripts

| Script | Purpose | Keep/Review/Remove Candidate |
|---|---|---|
| `dev` | Next dev server | Keep |
| `build` | Production build | Keep |
| `typecheck` | TypeScript validation | Keep |
| `lint` / `lint:ratchet` | ESLint and warning ratchet | Keep |
| `test*` | Unit/integration/e2e/coverage | Keep |
| `db:types*` | Supabase type generation/check | Keep |
| `docs:*`, `knowledge:*` | Docs/knowledge generation | Review |
| `coachhelm:*`, `check:stats` | CoachHelm/stats operations | Safety-critical; keep |
| `analyze` | Analyzed build | Review because current run OOMs |
| `ui:*` | UI route/auth tooling | Review |

## Potentially Obsolete Scripts

| Script | Why Suspicious |
|---|---|
| `evals`, `evals:view` | promptfoo is flagged by depcheck but may be intentional. |
| `lighthouse` | Requires LHCI setup; verify current usage. |
| `ui:*` | Generated artifact workflow; verify owner. |

## Safety-Critical Scripts

| Script | Why Important |
|---|---|
| `check:env` | Required env gate before build. |
| `check:ledger` | Migration ledger safety. |
| `check:stats` | Stats correctness. |
| `db:types:check` | Prevents DB type drift. |
| `test:rls` | Database access safety. |

## Suggested Future Scripts

| Script | Purpose |
|---|---|
| `cleanup:audit` | Runs the safe non-secret subset of this playbook. |
| `cleanup:secret-scan` | Runs redacted/exclusion-safe secret scan. |
| `analyze:heap` | Runs bundle analyze with explicit Node heap size. |
