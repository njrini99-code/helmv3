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
