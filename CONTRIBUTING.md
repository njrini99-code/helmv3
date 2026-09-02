# Contributing to HelmV3

This is the private/commercial monorepo for Helm Sports Labs
(GolfHelm · CoachHelm · BaseballHelm). The canonical engineering conventions
live in [`CLAUDE.md`](./CLAUDE.md) and [`AGENTS.md`](./AGENTS.md) — read those
first; this file is just the workflow summary.

## Workflow

1. **Branch from `main`.** `main` is protected (linear history, no force-push,
   required reviews + checks). Never push to it directly.
2. **Open a PR** and fill out the template. Stale branches are auto-deleted on
   merge; use the "Update branch" button if you fall behind.
3. **Pass the required checks.** A PR can merge only when these five are
   green: `CI aggregate`, `Review Gate aggregate`, `Analyze (actions)`,
   `Analyze (javascript-typescript)` and `Analyze (python)`. Treat
   `Supabase lint + RLS tests`, `Static checks`, `Lint`, `TypeScript`,
   `Unit tests`, and `Next build` as must-pass too — they gate `CI aggregate`.
   (`Smoke checks` was a sixth required check until 2026-09-02; it was a
   second copy of `Next build` and was removed with its job.)

   This list was wrong until 2026-08-19. It named `CodeRabbit` (dropped
   2026-07-20), `CodeQL` (never a check name — that workflow posts three
   `Analyze (...)` runs) and `all` (renamed to the two aggregates). Required
   contexts are matched by NAME, so a name nothing posts is indistinguishable
   from a check that has not finished — which is why every PR was
   unsatisfiable. Verify against the API, not this file, if in doubt:
   `gh api repos/njrini99-code/helmv3/branches/main/protection`

## Local checks before you push

```bash
npm run typecheck
npm run lint            # must not increase per-rule warnings (lint ratchet)
npm test                # unit + business-contract tests
npm run build           # catches SSR / prerender breakage
```

## Database & RLS

- Migrations live in `supabase/migrations/` and must be **additive and
  idempotent** (`IF NOT EXISTS`, `DROP POLICY IF EXISTS … CREATE POLICY …`).
  They run against a **shared golf-prod** database — no destructive writes.
- Every table needs RLS enabled with **one policy per command** and `anon`
  revoked unless intentionally public. Add/extend a pgTAP suite under
  `supabase/tests/rls/`; the `Supabase lint + RLS tests` job runs them all.
- Pages that read Supabase at request time must not be statically prerendered —
  add `export const dynamic = 'force-dynamic'`.

## UI

Use the design-system primitives. Raw `<button>`/`<input>`, arbitrary `px`
spacing, and `bg-white` are caught by the lint ratchet and will fail CI.

## Security

See [`SECURITY.md`](./SECURITY.md). Never commit secrets — push protection will
block it. Report vulnerabilities privately, not as public issues.
