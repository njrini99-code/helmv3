# A2 resolved — and one new finding it exposed

Session `helmv3-3f`, 2026-09-07. Addendum to `BLOCKED.md` §A2.
Read-only throughout; no workflow, script or source file was modified.

`BLOCKED.md` §A2 could not run its grep because `guard-config-change` text-matched the
workflow directory. Two guard fixes landed in this branch's merge — `9b03fb923` ("block on
the write TARGET, not on words in the command text") and `fdf97ccd5` — so the read now
passes. §A2 is answered below.

---

## 1. The §A2 grep, and why its answer is not a clean "empty"

The exact command in §A2 returns nothing (exit 1):

```
grep -rln "rls-coverage\|check-supabase-drift" .github/workflows/
```

That is a **false negative for one of the two scripts**. Workflows call the npm alias, not
the script path. Broadening to the aliases splits three scripts three ways:

| Script | Wired? | Does it cover G-38? |
|---|---|---|
| `scripts/db/rls-coverage.mjs` | **No caller** in `.github/` or `.circleci/` | — §A2's conclusion holds for this one |
| `scripts/db/check-supabase-drift.mjs` | Yes, twice: `ci.yml:965` (per-PR, local stack rebuilt from migrations) and `db-drift.yml:68` (daily, production via Management API) | **No.** Its 12 invariants are hardcoded and none touches `golf_conversation_participants` |
| `scripts/db/check-ledger-vs-catalog.mjs` | Yes, `db-drift.yml` step 2 | Shape-wise yes — it selects `policyname from pg_policies` and `proname from pg_proc` and compares against every parsed `CREATE POLICY` / `CREATE FUNCTION` in an applied migration (`:228-229`) |

So the correction to §A2: `check-supabase-drift` **is** invoked and always was; the grep
pattern missed it. `rls-coverage` genuinely has no caller. And the check that could have
settled G-38 is a third script §A2 did not name.

## 2. The new finding — that third check has never executed, and is dead on arrival

`db-drift.yml` runs two steps in sequence, neither carrying an `if:`:

1. `Check production schema invariants` → `npm run db:drift:check`
2. `Check ledger objects against the live catalog` → `npm run db:ledger-vs-catalog`

Step 1 has failed on **every** scheduled run: 09-02, 09-03, 09-04, 09-05, 09-06 (runs
`33627261663`, `33752302931`, `33870408992`, `33962486112`, `34030446368`). A `run:` step
without `if:` is skipped once the job is failing, so step 2 never runs. Confirmed on the
most recent run — its step list ends at the failed step:

```
success  Install dependencies
failure  Check production schema invariants
skipped  Post Setup Node
```

Step 2 and the ledger check do not appear at all. Both the ledger step and the failure
alerting were added on 2026-09-07 by `09cea5e39` (#1885), *after* the last scheduled run —
so this is not five days of a check being masked, it is a **brand-new check whose first
run tomorrow will be skipped for the same reason**, behind a red step that predates it.

**Proposal, not a change made here** (`db-drift.yml` is owner-governed config): give step 2
`if: always()`, or reorder so an independent check is not gated on an unrelated one. The
same shape `quality-gates.md` names for `check:ledger` and `orphans:mounts` — a script
that exists, is now even wired, and still never runs.

## 3. What this does and does not do to G-38

Do **not** read "fix the drift job and G-38 is settled". It splits:

- If migration `20260819070000` **is** recorded in the ledger as applied, a running step 2
  would compare its `CREATE POLICY golf_participants_insert_v2` / `CREATE FUNCTION
  golf_conversation_has_other_participant` against the live catalog and flag them if absent.
- If it was **never recorded** — and the migration self-reports `NOT APPLIED BY THE
  AUTHORING SESSION` — step 2 skips it by construction. Nothing anywhere checks it.

Either branch leaves `BLOCKED.md` §A1 exactly as it was: the manual production read is
still the only path that settles G-38, and it still needs owner access.

Attempting §A1 from here was re-confirmed impossible: `node scripts/db/check-ledger-vs-catalog.mjs`
exits with `Missing DATABASE_URL (or SUPABASE_PROJECT_ID + SUPABASE_DB_PASSWORD), and no
SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_ID to fall back on` — worktrees get a stub
`.env.local` by design. Reading `.env.local` remains denied (§A4).

## 4. Two live production defects, adjacent to this audit — not messages findings

Recorded here because they are the cause of the masking above, and because nothing has
alerted on them. **They belong to no lane and are not in `M00-MANIFEST.md`.** From run
`34030446368`'s log:

- **Ten `baseball_*` columns queried by code are missing in production**:
  `baseball_timeline_event_acks.{user_id,acknowledged_at}`,
  `baseball_pitch_events.{batter_id,pitch_type_classified,is_called_strike,count_state}`,
  `baseball_workload_events.{count,high_intent_count}`,
  `baseball_camp_registrations.{registered_at,attended_at}`. The script's own message: these
  are selected by timeline acknowledgements, CoachHelm telemetry, or the workload view.
  **Discriminator run:** `ci.yml`'s `Supabase lint + RLS tests` job runs the *same* 12
  invariants against a stack rebuilt from migrations, and is `success` on the four most
  recent completed `main` runs (`34090876801`, `34084923252`, `34084046103`, `34074321374`).
  The migrations therefore do produce these columns — **production has drifted**, this is not
  a missing migration. Closed issue #651 is the same shape, previously.
- **`admin_allowlist` and `users.role='admin'` have diverged**: one allowlisted user no
  longer has `role='admin'`. Admin RPCs still work via `is_super_admin()`, so it is not
  currently an outage.

No alert issue exists (`gh issue list --label db-drift --state all` is empty) because the
alerting steps are also new as of `09cea5e39`. They carry `if: failure()`, so unlike step 2
they *will* fire on the next scheduled run.
