# HelmV3

HelmV3 is the main Helm Sports Labs application repo. It contains the Next.js app, Supabase schema/tests, product surfaces for GolfHelm/BaseballHelm/Lifting, CI gates, agent instructions, and current operating docs.

## Start Here

| Need | Go To |
|---|---|
| Current repo operating model | `docs/current/README.md` |
| Product and feature map | `docs/current/product-map.md` |
| Architecture map | `docs/current/architecture-map.md` |
| CI and merge gates | `docs/operations/GATE_MATRIX.md` |
| CI triage runbook | `docs/operations/CI_RUNBOOK.md` |
| Branch protection | `docs/operations/BRANCH_PROTECTION.md` |
| Agent rules | `AGENTS.md` and `CLAUDE.md` |
| Feature routing | `memory/registry.yml` |

## Local Commands

```bash
npm run dev
npm run typecheck
npm run lint
npm run lint:ratchet
npm run test:run
npm run build
npm run verify
```

Use `npm run verify` as the local merge-readiness check. Use `npm run verify:full` when touching database, feature-routing, or broader cross-product behavior.

## Test Lanes

```bash
npm run test:unit
npm run test:integration
npm run test:rls
npm run test:all
npm run verify:e2e:smoke
npm run test:e2e
```

Playwright smoke is the intended hard E2E gate. The full Playwright suite remains advisory until it is stable enough to block merges.

## Source Of Truth

- GitHub Issues: current work queue.
- GitHub Project: current priority.
- `memory/registry.yml`: feature ownership and context routing.
- `docs/current/`: current system map.
- `docs/operations/`: gates, runbooks, and operational policy.
- `AGENTS.md` / `CLAUDE.md`: agent behavior and verification rules.

Historical audits and planning notes live under `docs/legacy/`, `docs/audits/`, `docs/plans/`, or `archive/`. Treat them as evidence, not the current work queue.

## Repo Hygiene

- Do not commit generated Playwright reports, MCP snapshots, `.next`, `test-results`, or local agent scratch.
- Do not update `.lint-baseline.json` unless warning count decreases or the cleanup is intentional and documented.
- Do not say a task is done unless verification passed or the exact blocker is named.
