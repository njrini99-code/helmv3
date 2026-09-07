# ADR-2026-09-06 — Demo seeding against production is scoped, not forbidden

**Status:** accepted · **Date:** 2026-09-06 · **Supersedes:** nothing ·
**Anchor SHA:** `522b7ad0e62ee07c8a1bad93b13fd17f1f196e40`

## Context

`https://github.com/njrini99-code/helmv3/blob/docs-attic-2026-09/docs/archive/2026-07/baseballhelm-overnight/baseballhelm-overnight/DECISION_LOG.md`
(D3, 2026-07-28) recorded a still-binding safety pattern while doing this: the
project has one shared production Supabase database, no staging copy
(`.claude/rules/shipping.md`), and `.env.local` points at it. Seed scripts that
write demo data therefore write to production. That reads as a hazard at
first glance, but the existing seed scripts (e.g.
`scripts/seed-baseball-surfaces-demo.ts`, `scripts/seed-course-library-scorecards.ts`)
are dry-run-by-default, require an explicit `--confirm`, and target a
dedicated demo organization documented as safe to ignore in production lists
— matching an established precedent (the Pat Edwards golf demo clone). The
rest of that log (recon-before-code, branch-vs-worktree, the session-only
heartbeat) was specific to that one overnight run and is not restated here.

## Decision

Demo seeding against the production Supabase project is legitimate when, and
only when:
- it targets one dedicated, clearly-named demo organization;
- writes are idempotent and org-scoped — no unscoped `DELETE`/`TRUNCATE`, no
  write touching a row outside the demo org;
- any schema change goes through a migration, never an ad hoc script;
- the script defaults to dry-run and requires an explicit confirm flag to
  write.

## Consequences

A demo/seed script that writes to production without these guards is a
policy violation, not a style nit. Reviewers checking a new or changed seed
script should verify org-scoping and the dry-run default before treating the
script as safe. The historical log this ADR draws from moved to the attic
(tag `docs-attic-2026-09`, see the URL above) as part of the 2026-09 docs
lifecycle sweep; this ADR is the durable record of the one entry from it
worth carrying forward.
