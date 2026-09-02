# Every path that can write a migration or the ledger

**Project:** `qmnssrrolpinvwjjnufo` (production) · **Compiled:** 2026-08-19 ~03:50Z
**Method:** read-only inspection of the repo at `main` (`46f286555`), CI config,
`.git/hooks`, and git history for deleted tooling. Split **ACTIVE** (can write
today) vs **HISTORICAL** (existed, now deleted — the duplicates were produced by
something, and it may no longer exist).

Confidence is marked per row. Rows marked **UNVERIFIED** were identified by name
and location but their internals were not read line-by-line in this pass.

---

## The finding that matters most

**No CI pipeline applies migrations to production.** Not
`.github/workflows/*`, not `.circleci/config.yml`. Every workflow that mentions
`supabase/migrations/**` only *lints or gates* it (sqlfluff, Squawk, the
migration-lockdown guard). There is no automated deploy path to the prod schema.

Every write to production's schema and ledger is therefore **manual and
interactive** — a person or an agent, at a keyboard or a tool call. That is the
structural reason the ledger diverged: there is no single mechanized path to be
correct, so there are several human ones that disagree. It also means the
duplicate-name mechanism in `DUPLICATE_NAME_ANALYSIS.md` cannot be fixed by
editing a pipeline; it is a workflow choice.

---

## ACTIVE — can write today

### A1. Supabase Dashboard / Management API — **the dominant writer**
- **Evidence:** 339 of 805 ledger rows carry `created_by = njrini99@gmail.com`,
  always with `statements` populated. Range `20260311192653` → `20260819033336`
  (i.e. still in use tonight).
- Stamps its **own execution-time version**, ignoring any local filename.
- **This is one half of the dual-path duplicate mechanism.**

### A2. Supabase MCP `apply_migration` / `execute_sql`
- Reaches production directly with `service_role`; never touches a file.
- **Gated** by `.claude/hooks/guard-sql.sh`, wired at
  `.claude/settings.json:95` (`"matcher": "mcp__.*(apply_migration|execute_sql)"`).
- cb used this path tonight for `golf_staff_invite_single_use`; it stamped
  normally with `statements`.

### A3. Supabase CLI `db push` (manual, from the repo root)
- **Evidence:** ledger rows with `created_by IS NULL` **and** `statements`
  populated. Uses the local **filename** as the version.
- **This is the other half of the dual-path mechanism** — A1 and A3 applying the
  same file is what creates a duplicate name.

### A4. Direct `INSERT` into `supabase_migrations.schema_migrations`
- **Used tonight** by `helmv3-cb`:
  `INSERT (version, name) … ON CONFLICT (version) DO NOTHING` × 248.
- Leaves `statements`, `created_by`, `idempotency_key`, `rollback` all NULL —
  which is what makes those rows identifiable.
- 258 rows currently have `statements IS NULL`; 248 are cb's, ~10 predate tonight.
- Highest-risk path: it asserts "applied" **without applying anything**.

### A5. Repo scripts that apply migrations — **UNVERIFIED internals**
Identified by name and location; not read line-by-line in this pass.
- `scripts/apply-migration.sh`
- `scripts/run-migration.mjs`
- `scripts/apply-crm-migration.mjs`
- `scripts/run-crm-migration.mjs`
- `scripts/migrate-crm-statuses.mjs`, `scripts/migrate-raw-buttons.mjs` (data
  migrations rather than schema, judging by name)

  Each needs a read before being trusted or retired. Any that stamps the ledger
  under a generated timestamp is a third producer of duplicate names.

### A6. `.git/hooks/pre-commit` — **untracked, undocumented, live**
- **Verified by reading it.** It is *not* a migration or ledger writer. On any
  staged `supabase/migrations/*.sql` it runs `npm run db:types` and
  `git add src/lib/types/database.ts`.
- Still worth naming: it is hidden execution authority that **reads `.env.local`**
  (`SUPABASE_PROJECT_ID`, else parses `NEXT_PUBLIC_SUPABASE_URL`) and **hits
  production** on every commit touching a migration. It exists on one machine,
  in no one's checkout but this one, and nothing documents it.
- It cannot produce duplicate ledger rows.

---

## READ-ONLY — checkers and gates, not writers

Confirmed non-writing.

| Path | Role |
|---|---|
| `scripts/check-migration-ledger.mjs` (`npm run check:ledger`) | reads ledger JSON on stdin, reports out-of-sync; only writes to stdout/stderr |
| `scripts/check-migration-versions.mjs` | version-format check (UNVERIFIED internals) |
| `scripts/db/check-supabase-drift.mjs` (`npm run db:drift:check`) | connects via `postgres` directly; its own header states "this script never writes" |
| `scripts/gen-db-types.sh` (`npm run db:types`) | generates types; "never writes anything back" |
| `.github/workflows/migration-lockdown.yml` | **blocks** PR edits to historical migrations below baseline `20260527120000` |
| `.github/workflows/ci.yml` (`Lint migrations`), `review-gate.yml` (sqlfluff) | lint only |
| `.circleci/config.yml` (`squawk-migrations`, full-repo sqlfluff) | weekly safety scan |

`migration-lockdown.yml` is also a **source of truth about intent**: it
allowlists exactly two files as *"replay-safety no-op edit for superseded
pre-baseline migration"* —
`20260526070000_widen_insight_type_check_for_v3_generators.sql` and
`20260526180000_fix_v3_goals_suggestions_rls.sql`. Both are in the unmatched 32.
CI itself says they are superseded, which is why the reconciliation classifies
them `PRE_BASELINE_SUBSUMED` rather than as gaps.

---

## GUARDS — what is deterministically prevented

`.claude/hooks/guard-sql.sh` (PreToolUse) covers **both** routes SQL reaches the
DB — Write/Edit of a `.sql` file, and MCP `apply_migration`/`execute_sql`
payloads. Blocks:
- `GRANT` to `anon`/`PUBLIC`
- `SECURITY DEFINER` with no matching `REVOKE`
- `DROP TABLE` / `TRUNCATE`
- `DELETE FROM` with no `WHERE`

`.claude/hooks/guard-bash.sh` blocks `supabase db reset`, force push,
`git stash`, `git clean -f`, and unscoped recursive `rm`.

**Gap worth naming:** no guard covers **A4**, a direct
`INSERT`/`UPDATE`/`DELETE` on `supabase_migrations.schema_migrations`. The one
path that can assert "applied" without applying anything is the one path with no
deterministic guard. Reported, not recommended — adding a guard is the owner's
call.

---

## HISTORICAL — existed, now deleted

- **`d25c639e1` (2026-01-14) "Major cleanup — remove temporary files, old
  migrations, and archive scripts"** deleted the entire numbered series
  `supabase/migrations/001_schema.sql` … `069_*.sql`, plus
  `supabase/MIGRATION_INSTRUCTIONS.md` and `supabase/QUICK_START_MIGRATIONS.md`.
  The ledger still carries **67 short-numeric rows (`001`–`069`)** whose files no
  longer exist. **This is the root cause of "`supabase/migrations/` can no longer
  rebuild production"** — 67 applied migrations have no source in the repo.
  It is *not* the duplicate-name cause: 0 of the 27 historical duplicate groups
  involve a short-numeric version.

- **`PENDING_` prefix convention.**
  `supabase/migrations/PENDING_golf_conversation_participants_tenant_isolation.sql`
  was deleted in `3454c3e6c` (2026-08-07). Evidence of a prior convention for
  deliberately-unapplied migrations — the same need `20260708141000` and
  `20260715141727` have today, now tracked only in peers' heads.

- Other deleted migrations: `20260506120000_admin_rollup_explicit_caller.sql`
  (`923de62a4`), `20260313_admin_dashboard_upgrade.sql`,
  `20260314_fix_shot_tracking_bugs.sql` (`47787751a`).

- Repo-wide deletion sweeps that removed one-off scripts —
  `761bea048` (devibe wave 1, 2026-07-15), `a4cf22083` (2026-07-09),
  `d25c639e1`. Any ad-hoc apply script that produced the June-24 double-push
  most plausibly died in one of these. **Not positively identified** — the
  double-push is established from its ledger fingerprint (whole filename as
  `name`, generated version, two runs ~11 min apart), not from surviving code.

---

## Summary: which writer produced what

| Ledger signature | Rows | Writer |
|---|---:|---|
| `created_by` set, `statements` set | 339 | A1 Dashboard / Management API / MCP |
| `created_by` NULL, `statements` set | ~207 | A3 CLI `db push` |
| `created_by` NULL, `statements` NULL | 258 | A4 direct INSERT (248 = cb tonight) |
| short-numeric version `001`–`069` | 67 | deleted numbered series (source gone) |

Duplicate names come from **A1 + A3 applying the same file**. The unmatched 32
come from **A1 without A3** (applied via Dashboard, never stamped under the
filename version). The unrebuildable history comes from the **2026-01-14
deletion**. Three different causes, routinely conflated as one "drift" problem.
