# Baseline Health

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

| Check | Status | Notes |
|---|---|---|
| npm install | Pass | Installed existing dependencies, then audit tooling. npm reported 52 vulnerabilities after audit-tool install. |
| typecheck | Pass | `npm run typecheck` completed with no reported TypeScript errors. |
| lint | Pass with warnings | ESLint completed with 0 errors and 2415 warnings; many BaseballHelm warnings are deferred. |
| build | Pass | `npm run build` completed successfully. |
| unit tests | Pass | 292 passed | 1 skipped (293). |
| e2e tests | Not Run | Playbook says run if supported; first pass used unit and coverage commands. |
| coverage | Pass | 38.25% ( 18250/47701 ). |
| bundle analyze | Fail | `npm run analyze` hit Node heap OOM during analyzed build. |
| Supabase db lint | Fail / Environment | Local Postgres on 127.0.0.1:54322 was not running. |
| Supabase db diff | Fail / Environment | Docker daemon was not available. |

## Existing Failures

- SECURITY_REVIEW: npm audit reports 52 vulnerabilities after installing audit tooling. No dependency updates were made.
- BUNDLE_REVIEW: analyzed build fails with Node out-of-memory. Normal build passes.
- DATABASE_REVIEW: Supabase CLI checks could not run locally because local Postgres/Docker were unavailable.
- ARCHITECTURE_REVIEW: dependency-cruiser could not run because no config exists and the playbook did not pass `--no-config`.
- Lint baseline has 2415 warnings but 0 errors. BaseballHelm warnings are deferred.

## Important Rule

Do not blame cleanup for failures that already existed at baseline, but do not make them worse.
