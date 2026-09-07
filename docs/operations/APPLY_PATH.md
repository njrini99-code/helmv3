# Apply path

The only way a migration reaches production: `npm run db:apply`. Everything
before it is preparation; everything it does is printed as PASS/FAIL, and it
refuses to proceed on the first FAIL.

## Flow

1. **Write the migration** — additive per `.claude/rules/database.md`. If it
   mutates data/DDL (INSERT/UPDATE/DELETE/DROP/ALTER), it MUST carry a
   `-- ROLLBACK:` block (how to undo it, or a named reason none is needed)
   and a `-- VERIFY:` block (one `SELECT` per line that must return >= 1 row
   post-apply). See `docs/operations/DECLARATIVE_SCHEMA.md` for the schema
   file this migration should also update if one exists for the object
   changed.
2. **pgTAP** — add/extend a test under `supabase/tests/rls/`; `npm run
   test:rls` runs it against the local stack (`npm run db:local` first).
3. **`scripts/db/check-migration-headers.mjs`** (`npm run
   check:migration-headers`) fails the PR if a new migration needs headers
   and lacks them. Pre-existing files are grandfathered in
   `.migration-headers-baseline.json` — a ratchet, it only shrinks.
4. **PR + review** — `db-migration-reviewer` is mandatory for anything R3
   (privileged) per `memory/system/golfhelm-engineering-os.md`.
5. **Replay in CI** — the Supabase lint + RLS tests job in `ci.yml` replays
   every migration against a fresh database.
6. **Merge to `main`.**
7. **`npm run db:apply -- <migration-file>`** (dry run by default):
   - HEAD is `main`, clean, and the file is reachable from `origin/main`.
   - The file is not `HOLD`/`OBSOLETE` in `supabase/migrations/HELD.md`
     (or `--held-override <row anchor> --reason "..."` is passed
     deliberately).
   - The ledger doesn't already carry the file's version.
   - Prints a PITR marker timestamp — record it before taking a backup.
   - `supabase db push --dry-run --linked` shows the plan.
8. **`npm run db:apply -- <migration-file> --apply`** — pushes that one
   file, re-reads the ledger, runs the file's own `-- VERIFY:` queries, and
   prints recorded-vs-applied. `--apply` is NOT pre-approved for agents —
   `.claude/settings.json` `permissions.deny` blocks the `--apply` form of
   this command; only the `db push`/dry-run form is allowed. Only the owner
   runs `--apply`.
9. **Verify** — the same `-- VERIFY:` queries, run again independently, plus
   whatever the migration's own header calls for.

## HOLD / OBSOLETE

`supabase/migrations/HELD.md` is the register for anything that can't take
this path cleanly: a migration held back on purpose, one applied through a
different route and later reconciled, or one superseded before it shipped.
`db:apply` reads it and refuses past a `HOLD`/`OBSOLETE` row without an
explicit override.
