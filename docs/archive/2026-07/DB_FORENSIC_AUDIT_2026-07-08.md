# Production Database Forensic Audit — 2026-07-08

Shared GolfHelm + BaseballHelm Supabase project. 5 read-only auditors + Supabase
advisors. Overall grade: **C+** — structurally messy, operationally small, **zero
data corruption**. Security/hygiene debt, not integrity failure.

## Dimension grades

| Dimension | Grade | Verdict |
|---|---|---|
| RLS coverage | B− | 100% of 260 tables have RLS. One cross-tenant write hole (course library). |
| SECURITY DEFINER fns | C→**fixed** | Anon clean; 2 fns leaked all user emails to any authed user. **Gated 2026-07-08.** |
| Data quality | C | Zero orphans/corruption; E2E still writes into prod (`organizations` 50% junk). |
| Schema truth | C+ | 8/8 recent migrations verified applied; 27 prod migrations have no repo file; drift bugs. |
| Performance | B+ | 591 MB, 9/60 conns, cached. 694 perf advisories ~all cosmetic at this scale. |

## Fixed in this PR (applied to prod + repo migrations)

- **[P0] PII leak** — `get_users_with_auth()` / `get_platform_health_stats()` were
  SECURITY DEFINER + authenticated-EXECUTE with no gate; any logged-in user could
  dump every user's email + auth metadata. Now `is_admin()/is_super_admin()`-gated
  (migration `20260708020000`).
- **[P1] Ungated RPC cluster** — `update_user_last_seen` (could overwrite any user's
  timestamp) now self-or-admin; dead RPCs (`get_pending_task_reminders`,
  `mark_task_reminder_sent`), CRM analytics (`get_crm_click_destinations`,
  `get_crm_template_performance`), and `refresh_crm_coach_engagement` (cron uses
  service_role) had authenticated EXECUTE revoked (migration `20260708021000`).
- **[P0] CSV stat upload broken** — `uploadStatsCSV` wrote `upload_batch_id` (a
  column that never existed) on every insert → every upload failed. Removed the
  legacy write; added the 7 real stat columns the type declared but the table
  lacked (`caught_stealing`, `sacrifice_bunts`, `runs_allowed`, `pitches_thrown`,
  `strikes_thrown`, `launch_angle`, `spin_rate`) additively so the DB matches the
  type; type now names the 6 real `source_*`/`import_run_id` columns it was
  missing (migration `20260708022000`).

## Deferred — needs your decision (NOT changed)

- **[P1] Course-library cross-tenant writes.** `golf_course_tee_holes` (ALL,
  `USING true`), `golf_course_tees` (UPDATE, `USING true`), `golf_courses` (UPDATE,
  `auth.uid() IS NOT NULL`) let any authenticated user edit/delete any school's
  course data. **This may be intentional** — the library is a soft-delete,
  crowd-sourced "grows-from-saves" wiki. I did not tighten it because it's a live
  golf product and the open-edit model is plausibly by design. **Decision needed:**
  is cross-school course editing intended (wiki model → add a server-side audit
  trigger so edits are always logged) or not (→ scope writes to owner/admin)?
- Security-definer `*_public` views expose a platform-wide coach directory to any
  authed user (no PII); fine at 10 teams, add `is_public` opt-in before scaling.
- 27 orphan migrations (recorded in prod, no repo file); `schema_migrations`
  version/filename mismatches + 6 double-recorded — a future replay-from-scratch
  hazard, not a live bug.
- `admin_events` + `error_logs` = 80% of DB size, ~1,550 rows/day, no retention.
- E2E suite writes into the shared prod DB (an "E2E Test University" org was created
  6 days before this audit). See the separate-E2E-project recommendation.

## Healthy (verified, don't worry)

RLS on every table. Zero FK orphans, zero childless conversations, zero
impossible/negative stats, zero future-dated rows. 160-game E2E purge held.
Graveyard tables dormant. The scary advisor counts (199 unindexed FKs, 259 unused
indexes) waste 9.6 MB total and sit on tiny tables — cosmetic at this scale.
