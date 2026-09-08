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
   - The filename matches `<14-digit version>_<name>.sql` and the file
     contains no `CONCURRENTLY` (see below).
   - Prints a PITR marker timestamp — record it before taking a backup.
   - Prints the plan: the exact SQL body `--apply` would send.
8. **`npm run db:apply -- <migration-file> --apply`** — sends that one file,
   re-reads the ledger, runs the file's own `-- VERIFY:` queries, and
   prints recorded-vs-applied. `--apply` is NOT pre-approved for agents —
   `.claude/settings.json` `permissions.deny` blocks the `--apply` form of
   this command; only the dry-run form is allowed. Only the owner runs
   `--apply`.
9. **Verify** — the same `-- VERIFY:` queries, run again independently, plus
   whatever the migration's own header calls for.

## One file means one file

`--apply` sends the migration through `supabase db query --linked --file`,
not `supabase db push`. `db push` applies EVERY pending migration;
`--include-all=false` does not narrow that to the named one — it only
excludes migrations older than the remote ledger tip. The body sent is the
reviewed file byte for byte plus one appended `insert` recording the version
in `supabase_migrations.schema_migrations`, the row `db push` would have
written.

No `begin;`/`commit;` is added. The Management API behind `--linked` already
runs a multi-statement body in a single transaction, so the migration and its
ledger row commit or roll back together. Two consequences:

- A migration containing `CONCURRENTLY` cannot take this path and is refused
  up front, since `CREATE INDEX CONCURRENTLY` will not run inside a
  transaction block.
- `supabase db query --local` cannot rehearse a migration at all — it uses
  the extended query protocol and rejects any multi-statement file. Rehearse
  against the local stack with `psql` instead.

`db query` exits 1 on a SQL error and 0 on success (measured on the pinned
CLI, 2.115.0), so a failed apply throws rather than reporting green. The
ledger re-read and the `-- VERIFY:` queries still run even when the apply
reports failure, and that is deliberate: the apply can fail on the response
while the server has already committed, and those two steps are the only
partial-commit detector. Do not restructure them into an early exit.

The CONCURRENTLY refusal strips whole-line `--` comments only. A trailing
comment on a code line (`create index x; -- CONCURRENTLY was considered`)
will trip it and refuse an otherwise fine file. That is fail-closed and
deliberate — the cost is one manual review, against a half-applied migration.

Because other pending migrations are now skipped rather than swept in,
`db-apply.yml`'s guard checks for the opposite hazard: applying a file while
OLDER migrations are still pending lands it out of order, which needs
`allow_out_of_order` ticked deliberately.

## HOLD / OBSOLETE

`supabase/migrations/HELD.md` is the register for anything that can't take
this path cleanly: a migration held back on purpose, one applied through a
different route and later reconciled, or one superseded before it shipped.
`db:apply` reads it and refuses past a `HOLD`/`OBSOLETE` row without an
explicit override.
