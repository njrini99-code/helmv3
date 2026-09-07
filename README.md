# Helm Sports Labs

[![CI](https://github.com/njrini99-code/helmv3/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/njrini99-code/helmv3/actions/workflows/ci.yml)
[![CodeQL](https://github.com/njrini99-code/helmv3/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/njrini99-code/helmv3/actions/workflows/codeql.yml)
[![Review Gate](https://github.com/njrini99-code/helmv3/actions/workflows/review-gate.yml/badge.svg?branch=main)](https://github.com/njrini99-code/helmv3/actions/workflows/review-gate.yml)

Multi-sport SaaS platform for college athletics, built by Helm Sports Labs.

## Products

- **BaseballHelm** — college baseball recruiting (coaches ↔ players) plus
  in-season team management (roster, calendar, messaging, Lift Lab).
- **GolfHelm** — college golf team management (roster, rounds, stats,
  qualifiers, travel) with the **CoachHelm** AI layer for insights,
  patterns, and player development.

## Stack

Next.js 16 (App Router) · TypeScript (strict) · Supabase (Postgres + Auth
+ Storage) · Tailwind CSS

## Getting started

Humans setting this up locally: see
[`docs/setup/RUN_ON_YOUR_MACHINE.md`](docs/setup/RUN_ON_YOUR_MACHINE.md).

AI agents (Claude Code, etc.) working in this repo: read
[`CLAUDE.md`](CLAUDE.md) first — it routes to the right feature docs,
schema references, and code patterns before you touch anything.

For the full documentation map, see [`docs/README.md`](docs/README.md).

**Git hooks:** `npm install` wires these automatically (the `prepare`
lifecycle script, `scripts/setup-hooks.mjs`); run `npm run hooks:install` to
do it by hand. It points `core.hooksPath` at the tracked `.githooks/`
directory instead of the untracked, unreviewable `.git/hooks/`. Two hooks
live there today: `pre-commit` (regenerate `src/lib/types/database.ts` when
a migration is staged, and run `gitleaks protect --staged` if `gitleaks` is
on PATH) and `pre-push` (typecheck, eslint, the lint ratchet, sqlfluff,
gitleaks, markdownlint, and generated-docs freshness — each scoped to only
the files the push actually changes; see "Before you push" in
[`docs/CI_RUNBOOK.md`](docs/CI_RUNBOOK.md)); a missing local tool is skipped,
not failed, when CI's Review Gate still covers it.
**`core.hooksPath` lives in the SHARED git config** (`.git/config` at the
common dir), not per-worktree — `setup-hooks.mjs` writes the *relative*
value `.githooks`, which git resolves against each working tree's own top
level, so one shared config entry still runs each worktree's own checked-out
hooks rather than pinning every worktree to whichever checkout last ran
`npm install`.

## Common commands

```bash
npm run dev          # Dev server (localhost:3000)
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run build        # Production build
npm test             # Unit tests (Vitest)
npm run test:all     # Unit + integration + RLS tests
npm run test:e2e     # Playwright end-to-end
```

## Repository layout

```
src/app/            # Next.js routes (baseball/, golf/, admin/, api/)
src/components/      # UI components, by product
src/lib/             # Supabase clients, types, CoachHelm engine, utils
supabase/migrations/ # Database schema history
docs/                # Setup guides, audits, feature specs (see docs/README.md)
memory/              # Living feature/schema docs consumed by CLAUDE.md routing
```

## License

Proprietary — Helm Sports Labs. All rights reserved.
