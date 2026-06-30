# Current Repo Status

Last updated: 2026-06-30

## Hard Gates

| Gate | Status | Notes |
|---|---|---|
| TypeScript | Green locally | `npm run typecheck` passed. |
| ESLint | Green locally | `npm run lint` passed under the repo warning ceiling. |
| Lint Ratchet | Green locally | Baseline locked at 2125 warnings after net cleanup. |
| Unit Tests | Green locally | `npm run test:run` passed. |
| Build | Green locally | `npm run build` passed with the 8GB heap setting. |
| Workflow lint | Green locally | `actionlint .github/workflows/*.yml` passed. |
| Repo Health | Green locally | `npm run repo:health` passed. |
| Route Hygiene | Green locally | `npm run routes:check` — 0 P0/P1 blockers across 262 routes. |
| Business contracts | Green locally | `npm run test:business` includes route normalizer contract. |
| Supabase RLS | Green in CI | `Supabase lint + RLS tests` passed on PR #358. |
| Gitleaks | Green in CI | Current-tree scan reports zero findings. |
| Branch protection | Updated | `main` now requires `Business contracts` and `Route Hygiene P0/P1`. |
| Playwright Smoke | Green in CI | Smoke checks passing on PR #358. |

## Known Follow-Ups

- [#351](https://github.com/njrini99-code/helmv3/issues/351): Stabilize the full Playwright suite before making it a hard gate (advisory workflow remains).
- [#352](https://github.com/njrini99-code/helmv3/issues/352): Dense spatial controls in scoped files still use documented `helm/no-raw-button` exceptions where primitives cannot preserve geometry.
- [#365](https://github.com/njrini99-code/helmv3/issues/365): Run production DB audit once `PROD_AUDIT_DATABASE_URL` secret is configured.
- [#107–#110](https://github.com/njrini99-code/helmv3/issues): Legacy Semgrep/schema tech-debt from May 2026 — separate from the production-readiness radar.

## Recently Closed (2026-06-30)

- [#350](https://github.com/njrini99-code/helmv3/issues/350): Branch protection updated with `Business contracts` and `Route Hygiene P0/P1`.
- [#355](https://github.com/njrini99-code/helmv3/issues/355): Capacitor iOS web bundle untracked; regenerated via `npx cap sync ios`.
- [#362](https://github.com/njrini99-code/helmv3/issues/362): dependency-cruiser violations resolved (0 remaining).
- [#363](https://github.com/njrini99-code/helmv3/issues/363): Semgrep noise reduced (254 → 19 advisory findings); exclusions tuned in `.semgrep/helm-rules.yml`.
- [#364](https://github.com/njrini99-code/helmv3/issues/364): JSCPD exclusions added via `.jscpd.json`; scanner remains advisory.

## Route Bug Catcher

Static checks (`npm run routes:check`):

- 262 routes inventoried
- 0 P0/P1 blockers (duplicates, stale links, boundaries, coverage)
- 131 advisory findings (dead-route candidates, coverage gaps)
- Semgrep companion rules at `.semgrep/helm-route-rules.yml`

Runtime crawler (`npm run routes:crawl`) runs advisory in `free-production-readiness.yml`.
