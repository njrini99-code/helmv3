# Supabase Drift Report — 2026-07-03

Read-only verification pass against the linked production project
(`qmnssrrolpinvwjjnufo`), per the HelmV3 stabilization brief Phase 2. All
queries were run via the Supabase MCP (`execute_sql`, `list_migrations`)
and the Supabase CLI (`supabase migration list --linked`). **No writes,
no `db push`, no `migration repair` were run.**

## Summary

The specific drift findings named in issues #651, #728, #732, and the
linked-lint fix plan (#772) were **re-verified directly against live
`information_schema` / `pg_proc`, not against migration history** (per
the brief's own instruction not to trust `schema_migrations` alone), and
**all of them are already resolved** in production as of this pass —
apparently by a prior session's work earlier today and yesterday
(2026-07-02 / 2026-07-03), before this stabilization pass started. These
issues should be moved from "open, needs fix" to "needs evidence comment
+ regression/drift-guard coverage" in the issue ledger.

Separately, this pass found a **new, much larger, previously undocumented
finding**: a systemic mismatch between local migration filenames and the
version identifiers actually recorded in the remote ledger, affecting
essentially every migration since ~2026-05-26 (193 local-only / 445
remote-only entries by naive version-string diff, but almost entirely
1:1 name-paired — i.e. the same migration, same name, applied under a
*different* timestamp than its local filename). This is evidence of a
non-standard apply process, not evidence that ~190 migrations are
missing from production — see "Migration Ledger Integrity" below.

## #651 — Baseball schema drift: **RESOLVED**

All 12 columns named in #651 exist in production today, confirmed via
direct `information_schema.columns` query:

| Table | Column | Type |
|---|---|---|
| `baseball_teams` | `program_type` | text |
| `baseball_practice_effectiveness_reviews` | `disposition` | text |
| `baseball_practice_effectiveness_reviews` | `focus_area` | text |
| `baseball_stat_sources` | `source_name` | text |
| `baseball_fielding_events` | `measured_at` | timestamptz |
| `baseball_fielding_events` | `chance_difficulty` | text |
| `baseball_baserunning_events` | `measured_at` | timestamptz |
| `baseball_baserunning_events` | `runner_id` | uuid |
| `baseball_catching_events` | `measured_at` | timestamptz |
| `baseball_catching_events` | `catcher_id` | uuid |
| `baseball_plate_appearances` | `data_context` | text |
| `baseball_decision_log` | `detail` | text |

Corresponding migrations exist both on disk and in the remote ledger:
`baseball_651_column_reconcile` (local `20260702095900`, remote
`20260702035814`) and `baseball_651_settings_os_reconcile` (local
`20260703050000`, remote `20260703044143`). Version-number mismatch
between local/remote is the same pattern described below — not evidence
of missing content.

**Recommendation:** close as `fixed — verified 2026-07-03`, add the
column list to the drift guard (Phase 4) so a future revert can't
silently reintroduce the gap.

## #728 — `recalculate_baseball_season_stats` function drift: **RESOLVED**

Fetched the live function body via `pg_get_functiondef`. It does **not**
reference `b.so` anywhere — there is no `so` column/alias at all in the
current body (strikeouts are `v_k` for batting, `v_k_thrown` for
pitching). The function now includes a body-level coach-authorization
guard:

```sql
IF current_setting('request.jwt.claims', true) IS NOT NULL
   AND coalesce(auth.role(), '') <> 'service_role'
   AND NOT public.is_baseball_team_coach_v2(p_team_id)
THEN
  RAISE EXCEPTION 'forbidden: caller is not a coach of team %', p_team_id
    USING ERRCODE = '42501';
END IF;
```

A matching migration, `baseball_recalc_fn_drift_realign` (remote version
`20260702213426`), exists in both places.

**Recommendation:** close as `fixed — verified 2026-07-03`. The drift
*guard* itself (Phase 4) is still the right permanent fix — this
verification confirms the hotfix held, not that regression is
impossible.

## #772 linked-lint functions: **RESOLVED**

### `public.can_manage_baseball_lift_group`

Live body:

```sql
CREATE OR REPLACE FUNCTION public.can_manage_baseball_lift_group(p_team_id uuid, p_group_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Post helm-unification: legacy strength-group creator-override is gone
  -- (baseball_strength_groups graveyarded); capability is the sole check.
  -- Kept (not dropped) because graveyarded lift-table policies reference it
  -- and must stay restorable.
  RETURN public.has_baseball_staff_capability(p_team_id, 'can_manage_lifting');
END;
$function$
```

No reference to `baseball_strength_groups` in the executable body (only
in an explanatory comment). Confirmed **not** restoring the graveyarded
table — consistent with the fix plan's explicit instruction not to.

### `public.baseball_accept_staff_invite`

Live body reads `v_invitation.email` and `v_invitation.invitee_name` —
both real columns on `baseball_staff_invitations` (confirmed via
`information_schema.columns`: the table has `email` and `invitee_name`,
**not** `invitee_email`). No stale field reference remains.

**Recommendation:** close both linked-lint findings as `fixed — verified
2026-07-03`.

## #732 — `public.rate_limits` / `expires_at`: no first-party function reference found

- `public.rate_limits` does **not exist** as a table (`information_schema.tables`
  confirms only `auth_rate_limits` exists in `public`).
- Scanned every function body in `public` for `rate_limits` or
  `expires_at`: matches are `baseball_accept_staff_invite` (uses
  `baseball_staff_invitations.expires_at` — a real, correctly-named
  column), `helm_lifting_accept_invite` (`helm_lifting_coach_invites.expires_at`),
  and `try_redeem_baseball_team_invitation`
  (`baseball_team_invitations.expires_at`) — all legitimate uses of each
  table's own `expires_at` column, not a phantom `public.rate_limits`
  reference.

**Recommendation:** no DB-side fix identified. Per the issue's own note,
the caller producing the original error is likely a dependency, edge
function, or external probe rather than a first-party `src/` or
`public.*` function. Keep #732 open, reclassify as "needs runtime-log
correlation, not schema fix" in the issue ledger — the next investigative
step is checking Supabase project logs / edge function logs at the time
of the reported error, not another schema search.

## Historical golf drift context (from prior sessions) — still resolved, no new evidence of regression

Spot-checked the golf-side drift items called out as historical context:

- `golf_rounds.status` exists (not `round_status`).
- `golf_documents.is_public` exists (not `player_visible`).
- `golf_player_classes` exists.
- `golf_event_rsvps` does **not** exist (matches the documented drop).

No action needed; this confirms the historical narrative and gives the
drift guard (Phase 4) a concrete "golf" section to extend into, per the
brief's instruction to make the guard a repeatable framework rather than
Baseball-only.

## Migration Ledger Integrity — NEW finding, needs its own investigation

`supabase migration list --linked` and the repo's own
`scripts/check-migration-ledger.mjs` (run against a live ledger dump via
`select json_agg(...) from supabase_migrations.schema_migrations`) both
show a **massive, systemic** local/remote version mismatch:

- 193 local migration files have no version match in the remote ledger.
- 445 remote ledger entries have no version match on disk.
- Critically, this is **not** ~190 missing migrations — filtering by
  migration *name* (not version) shows the overwhelming majority are
  1:1 name pairs, e.g.:

  | Local file (version) | Remote ledger (version) | Name |
  |---|---|---|
  | `20260703050000` | `20260703044143` | `baseball_651_settings_os_reconcile` |
  | `20260704070000` | `20260703150438` | `graveyard_dead_liftlab_tables_phase2` |
  | `20260704090000` | `20260703164052` | `graveyard_legacy_liftlab_tables_phase3` |
  | `20260607030000` | `20260607145401` | `lock_distance_proximity_putt_rpcs_to_service_role` |
  | `20260624000010` | `20260624194331` | `baseball_stat_uploads_reconcile` |
  | *(~190 more, same pattern)* | | |

  This pattern holds continuously from **2026-05-26 through the most
  recent migrations** (some local files are even dated **2026-07-04**,
  i.e. tomorrow relative to this report — e.g.
  `20260704130000_integrity_check_admin_readability_tripwire.sql` vs
  remote `20260703163234`).
- This means whatever applies migrations to this project (not plain
  `supabase db push` with filenames preserved) re-stamps each migration
  with a new version at apply-time instead of preserving the file's own
  timestamp, and/or local migration files get renamed/renumbered after
  the fact without a corresponding ledger update. Either way, **`npm run
  check:migration-ledger` (if wired into CI) would fail continuously**
  on this repo in its current state, and `supabase migration list
  --linked` cannot be trusted as a "is X applied" signal here — exactly
  the trap the brief's hard guardrails warned about ("Do not rely only
  on `schema_migrations`... query `information_schema` and live
  `pg_proc` directly").
- Every specific issue verified above (#651, #728, #772) was confirmed
  the *correct* way (direct schema/function inspection), independent of
  this ledger noise, and all came back resolved.

**This needs its own follow-up, not a same-pass fix:**

- [ ] Identify what actually applies migrations to this project (manual
  dashboard SQL editor paste? A custom script? `supabase db push` from a
  different local clone with different file timestamps?). Check
  `scripts/apply-migration.sh`, `.github/workflows/**` for any
  migration-apply step, and ask whoever runs deploys.
- [x] **Confirmed:** `npm run check:ledger` (→
  `scripts/check-migration-ledger.mjs`) is **not wired into CI at all**.
  `.github/workflows/ci.yml`'s "Schema invariants" job runs
  `./scripts/check-schema-invariants.sh`, a different script, and
  neither `check:ledger` nor `check-migration-ledger` appears anywhere
  in `.github/workflows/**`, `.circleci/config.yml`, or
  `check-schema-invariants.sh`. This is the same pattern as the
  `scripts/__tests__/` dead-test finding documented in the P0 security
  PR (`fix/p0-rotate-hardcoded-service-role-secrets`) — a real
  correctness script exists, looks like it should be a safety net, and
  has never actually run anywhere. Wiring it in is not free, though:
  given the systemic mismatch above, turning it on today would fail
  continuously until the version-numbering root cause is fixed or the
  script is taught to reconcile by name-when-version-differs.
- [ ] Given every individually-checked case resolved correctly, this is
  very likely a bookkeeping-only problem (content applied, version
  string not matching) rather than a real content gap — but that should
  be confirmed, not assumed, before trusting the ledger again.

## What this report deliberately does NOT do

- No migrations were created or applied.
- No `supabase db push`, `migration repair`, or `db reset` were run.
- No production schema was mutated.
- Issue closures are **recommended**, not performed — per the brief's
  guardrail not to close issues automatically from an agent pass.

## Next steps (not done in this pass)

1. Add an evidence comment + close (or leave open per maintainer
   preference) #651, #728, and the two #772 linked-lint findings, citing
   this report.
2. Reclassify #732 to "needs log correlation" rather than "needs schema
   fix."
3. Build the drift guard (`scripts/db/check-supabase-drift.mjs`, Phase 4
   of the brief) using the same direct-`information_schema`/`pg_proc`
   method used here — not migration-ledger diffing, which this report
   shows is currently unreliable on this project.
4. Separately track the migration-ledger integrity investigation above;
   do not conflate it with "missing migrations" without per-file
   confirmation.
