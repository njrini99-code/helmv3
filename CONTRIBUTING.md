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

## Tests

New tests go in a `__tests__/` folder next to the code they cover
(`AGENTS.md`). `src/test/**` is the older central location; its test-file count
may only fall (`npm run lint:test-location`). Likewise the counts of
`fromUntyped` imports and explicit `any` may only fall
(`npm run lint:any-ratchet`).

## Dependencies

- **Animation:** `motion` (import from `motion/react`). `framer-motion` is not
  a dependency and has no importers. GSAP is used only by the marketing pages
  (`src/components/landing`, `src/components/products`, `src/app/products`,
  through `src/lib/motion/gsap`); leave it there and do not use it in product
  screens.
- **Charts:** Recharts is the chart stack (10 files). Three Fairway charts
  (`LeakMap`, `ShotDispersion`, `StrokesGainedTornado`) use visx. Do not add
  more visx; port those three to Recharts or to plain SVG when one of them is
  next touched, then drop the `@visx/*` packages.
- **Base UI:** use the stable `@base-ui/react`. The old `@base-ui-components`
  package name is not imported anywhere.
- **Type packages:** `@types/*` live in `devDependencies`.
- **`overrides` in `package.json`:** each entry must change the resolved tree.
  Test an override by removing it and running
  `npm install --package-lock-only --ignore-scripts` in a scratch copy; if the
  lockfile does not change, the entry is dead weight. The seven that remain each
  change the lockfile when removed.

## Database & RLS

- Migrations live in `supabase/migrations/` and must be **additive and
  idempotent** (`IF NOT EXISTS`, `DROP POLICY IF EXISTS … CREATE POLICY …`).
  They run against the **single production Supabase project** (`qmnssrrolpinvwjjnufo`),
  shared by Golf, Baseball and Lift Lab — no destructive writes.
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

## Repository size

`.git` is well over a gigabyte (about 1.5 GB packed on a fresh clone today).
Almost all of it is old course-geometry data (`output/course-geometry/**`:
TIFF, NPY and elevation rasters) and an `.ultracode` event log
(`.ultracode/baseballhelm/events.ndjson`, committed several times at about 30 MB
each). Those files are no longer in the tree but live in history. A history
rewrite is not planned: it would change every commit id and break open PRs
and worktrees. To keep a clone small, skip the blobs
you do not read:

```bash
git clone --filter=blob:none https://github.com/njrini99-code/helmv3.git
```

Do not commit generated data, rasters, logs or screenshots; see the UI section.

## Security

See [`SECURITY.md`](./SECURITY.md). Never commit secrets — push protection will
block it. Report vulnerabilities privately, not as public issues.
