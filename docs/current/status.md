# Current Repo Status

Last updated: 2026-06-30

## Hard Gates

| Gate | Status | Notes |
|---|---|---|
| TypeScript | Green locally | `npm run typecheck` passed. |
| ESLint | Green locally | `npm run lint` passed under the repo warning ceiling. |
| Lint Ratchet | Green locally | Baseline locked at 2132 warnings after net cleanup. |
| Unit Tests | Green locally | `npm run test:run` passed: 3434 passed, 39 skipped. |
| Build | Green locally | `npm run build` passed with the 8GB heap setting. |
| Workflow lint | Green locally | `actionlint .github/workflows/*.yml` passed. |
| Repo Health | Green locally | `npm run repo:health` passed (iOS Capacitor bundle no longer tracked). |
| Supabase RLS | Green in CI | `Supabase lint + RLS tests` passed on PR #358. |
| Gitleaks | Green in CI | Current-tree scan reports zero findings. |
| Playwright Smoke | Green locally | 3/3 runnable smoke tests passed; auth demo test skips without `E2E_AUTH_SMOKE_ENABLED`. |
| Playwright Critical | Green locally | 3/3 public route critical tests passed. |
| dependency-cruiser | Green | 0 errors (was 25); `npm run analyze:deps`. |
| Semgrep advisory | Tuned | 19 `catch-collapses` warnings (was 56+); 0 service-role-in-client findings. |

## Recently Closed (2026-06-30)

- [#350](https://github.com/njrini99-code/helmv3/issues/350): Branch protection includes `Business contracts` and `Route Hygiene P0/P1`.
- [#351](https://github.com/njrini99-code/helmv3/issues/351): Playwright smoke + critical paths green locally (advisory full suite; not promoted to hard gate).
- [#352](https://github.com/njrini99-code/helmv3/issues/352): Dense legacy raw-button surfaces migrated to design-system primitives where feasible; file-level disables removed.
- [#355](https://github.com/njrini99-code/helmv3/issues/355): Capacitor iOS `public/` + `config.xml` untracked; regenerated via `cap sync` in Xcode Cloud.
- [#362](https://github.com/njrini99-code/helmv3/issues/362): dependency-cruiser violations resolved (25 → 0).
- [#363](https://github.com/njrini99-code/helmv3/issues/363): Semgrep Helm rules tuned; service-role false positives eliminated, catch-collapses scoped.
- [#364](https://github.com/njrini99-code/helmv3/issues/364): JSCPD excludes generated paths via `.jscpd.json`.
- [#365](https://github.com/njrini99-code/helmv3/issues/365): Prod DB audit skips gracefully without `PROD_AUDIT_DATABASE_URL`; documented in ops stack.

## Open Follow-Ups

- Continue shrinking the 19 remaining Semgrep `catch-collapses` advisories in product UI loaders.
- Optional: enable `E2E_AUTH_SMOKE_ENABLED` in CI for the demo-login smoke path.
