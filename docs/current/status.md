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
| Repo Health | Green locally | `npm run repo:health` passed, including root docs, generated artifact, and tracked-ignored-file checks. |
| Supabase RLS | Green in CI | `Supabase lint + RLS tests` passed on PR #358. |
| Gitleaks | Green in CI | Current-tree scan reports zero findings after secret-bearing script removal. |
| Playwright Smoke | Listed locally | Four smoke tests are discoverable. Full execution depends on browser/server env. |

## Known Follow-Ups

- [#351](https://github.com/njrini99-code/helmv3/issues/351): Stabilize the full Playwright suite before making it a hard gate.
- [#352](https://github.com/njrini99-code/helmv3/issues/352): Continue design-system primitive migration for dense legacy raw-button surfaces.
- [#355](https://github.com/njrini99-code/helmv3/issues/355): Decide whether to untrack the generated Capacitor iOS public bundle after native build verification.
- [#362](https://github.com/njrini99-code/helmv3/issues/362): Untangle dependency-cruiser architecture boundary findings (25 remaining).
- [#363](https://github.com/njrini99-code/helmv3/issues/363): Triage custom Semgrep advisory findings.
- [#364](https://github.com/njrini99-code/helmv3/issues/364): Reduce JSCPD duplication hotspots.
- [#365](https://github.com/njrini99-code/helmv3/issues/365): Run production DB audit with read-only database URL.

## Recently Closed (2026-06-30)

- [#349](https://github.com/njrini99-code/helmv3/issues/349): Supabase local stack + RLS tests green in CI.
- [#350](https://github.com/njrini99-code/helmv3/issues/350): Branch protection updated with `Business contracts` and `Route Hygiene P0/P1`.
- [#353](https://github.com/njrini99-code/helmv3/issues/353): Legacy `.helm` task-system references retired from active tool flows.
- [#354](https://github.com/njrini99-code/helmv3/issues/354): Cleanup secret-scan now writes redacted output only (`npm run cleanup:secret-scan`).
- [#359](https://github.com/njrini99-code/helmv3/issues/359): Gitleaks candidates remediated; current-tree scan is clean.
