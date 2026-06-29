# Helm Gate Matrix

This file is the current map of hard merge blockers versus advisory checks.

## Hard Merge Blockers

| Gate | Command / Workflow | Protects Against |
|---|---|---|
| TypeScript | `npm run typecheck` / `CI / TypeScript` | broken types, invalid imports |
| ESLint | `npm run lint` / `CI / ESLint` | code-quality and hook-rule regressions |
| Lint Ratchet | `npm run lint:ratchet` / `CI / Lint ratchet` | adding warnings above the baseline |
| Unit Tests | `npm run test:run` / `CI / Unit tests` | broken logic and components |
| Next Build | `npm run build` / `CI / Next build` | build and deployment failures |
| Database Types | `npm run check:types-drift` / `CI / Database types drift` | stale generated Supabase types |
| Schema Invariants | `./scripts/check-schema-invariants.sh` / `CI / Schema invariants` | repeated known database mistakes |
| Feature Knowledge | `npm run knowledge:check` / `CI / Feature knowledge` | stale or missing feature-routing docs for mapped code |
| Supabase RLS | `CI / Supabase lint + RLS tests` | migration and row-level-security regressions |
| Playwright Smoke | `npm run verify:e2e:smoke` / `Playwright Smoke` | broken critical browser entry points |
| Review Gate / ast-grep | `review-gate.yml` | project-specific banned patterns |
| Review Gate / semgrep | `review-gate.yml` | security and static-analysis risks |
| Review Gate / gitleaks | `review-gate.yml` | leaked secrets |

## Advisory Checks

| Check | Why Advisory |
|---|---|
| Playwright E2E Advisory | full suite is still stabilizing |
| Course picker screenshots | visual evidence artifact, not a merge blocker |
| Lighthouse | performance and accessibility visibility |
| Knip | dead-code discovery |
| Stryker | mutation-test signal |
| Promptfoo | AI output drift signal |
| npm audit | dependency-risk triage |
| full sqlfluff | SQL style and risk signal |
| Squawk | migration-safety signal |
| iOS compile | heavier platform visibility |

## Ratchet Rule

Only run `npm run lint:ratchet:update` after the net warning count decreases or after an explicit cleanup decision. Do not update the baseline just to make CI green.
