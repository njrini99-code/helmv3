# Contributing to HelmV3

This is the private/commercial monorepo for Helm Sports Labs
(GolfHelm · CoachHelm · BaseballHelm). The canonical engineering conventions
live in [`CLAUDE.md`](./CLAUDE.md) and [`AGENTS.md`](./AGENTS.md) — read those
first; this file is just the workflow summary.

## Workflow

1. **Branch from `main`.** `main` is protected (linear history, no force-push,
   required status checks, no required approvals). Never push to it directly.
2. **Open a PR** and fill out the template. Stale branches are auto-deleted on
   merge; use the "Update branch" button if you fall behind.
3. **Pass the required checks.** Read the live list rather than trusting a
   copy: `gh api repos/njrini99-code/helmv3/branches/main/protection --jq
   '.required_status_checks.contexts'`. `docs/CI_RUNBOOK.md` explains each
   one; the jobs behind `CI aggregate` are must-pass too.

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

**Screenshots do not belong in the tree.** Git LFS is registered
(`.gitattributes` marks image extensions `binary`) but nothing actually
routes images through it — `git lfs ls-files` returns zero tracked objects,
so every screenshot ever committed sits in plain git blob storage, growing
the repo forever. A one-off QA/visual-audit screenshot pack
(docs/qa/baseball-fairway-visual-audit-2026-07-04/ was ~80MB before being
pruned) belongs in a PR description or an external link, not a committed
directory.

## Security

See [`SECURITY.md`](./SECURITY.md). Never commit secrets — push protection will
block it. Report vulnerabilities privately, not as public issues.
