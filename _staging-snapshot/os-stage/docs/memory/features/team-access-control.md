# Feature: Team Access Control And RLS

```yaml
feature_id: team_access_control
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: not_started
```

## Purpose

Who can see and mutate golf data across coaches, players, teams, admins, and
shared surfaces — enforced through Supabase RLS, server-action auth checks,
role/team-membership tables, and route-level logic. This is foundational:
nearly every other GolfHelm feature depends on it, and several CI review-gate
rules exist specifically to catch accidental bypasses of it.

## User Contract

- A coach can only read/write data for teams they staff
  (`golf_team_coach_staff`).
- A player can only read/write their own data, or team-scoped data their
  role permits.
- No server action reaches the database before confirming who's calling it.
- No service-role credential or admin-only logic reaches a client bundle.

## Current Behavior

Every server action is expected to call `supabase.auth.getUser()` before any
DB access — spot-checked this pass across `roster.ts` (2 call sites),
`messages.ts` (1), `tasks.ts` (12), `teams.ts` (15); all non-zero, consistent
with the rule being followed rather than aspirational. `golf_team_coach_staff`
is the authorization edge for "is this coach allowed to act on this team,"
including for a coach who staffs more than one team (see `roster_team` for
the multi-team cookie mechanism).

SECURITY DEFINER functions in recent migrations pin `search_path` explicitly
— confirmed present in `20260821043500_single_flight_round_submit.sql`,
`20260821035329_can_read_golf_shot_detail_planner_cost.sql`, and
`20260820170000_single_flight_partial_round_save.sql`, all from this week.

## Invariants

- Every server action calls `supabase.auth.getUser()` before any database
  access.
- Service-role key usage is confined to `src/lib/supabase/admin.ts` and
  explicit admin/server-only boundaries — never imported by client code.
- Coach access to a team routes through `golf_team_coach_staff`, not an
  inferred or cached team_id.
- Every new table ships with RLS enabled and policies in the same migration
  (Review Gate hard rule).
- SECURITY DEFINER functions pin `search_path`.
- Bare unprefixed sport tables (`players`, `coaches`, `teams`, `rounds`) are
  wrong on sight — the prefix is load-bearing, not stylistic.

## Primary Journeys

1. **Server action auth check**: every mutating/reading action calls
   `supabase.auth.getUser()` first; a missing or unauthenticated user short-
   circuits before any `.from()`/`.rpc()` call.
2. **Coach team-scoped access**: `golf_team_coach_staff` resolves whether the
   authenticated coach may act on the target team; a coach staffing a second
   team resolves the active one via a server-validated cookie (see
   `roster_team`'s `resolveCoachTeamIdWithCookie()`).
3. **RLS-gated shot detail read**: `can_read_golf_shot_detail` (SECURITY
   DEFINER) gates fine-grained shot data reads shared by `shot_tracking` and
   `stats_analytics` — see Incident History for this week's planner-cost fix
   on this exact function.
4. **Migration review**: a new table without RLS + policy in the same
   migration is a Review Gate hard-fail, not a warning.

## Architecture/Data Flow

```txt
Request -> server action
  -> supabase.auth.getUser() (must succeed before any DB call)
  -> role/team resolution (golf_team_coach_staff for coaches;
     player_id ownership for players)
  -> .from()/.rpc() call, further gated by RLS policies at the DB layer
     (defense in depth: action-level auth check + RLS, not either/or)
```

## Permissions/Tenancy

This feature *is* the permissions/tenancy layer for the rest of GolfHelm; it
has no separate dependency on itself. Every `golf_*` table's RLS policies are
in scope. Use `memory/glossary.md`'s AUTOGEN blocks for table lookup and
`memory/context/golfhelm-database.md` for exact columns — do not hand-copy
table/column lists into this doc, they rot.

## Dependencies

Every other `golf_*`-scoped feature depends on this one. This doc does not
enumerate them individually — see each feature's own Permissions/Tenancy
section, which should point back here rather than restate policy.

## Failure Modes

- **Broad `.from()` queries before the auth check** — a query issued before
  `supabase.auth.getUser()` resolves is a bug class this feature's review
  rules exist to catch; not observed in the spot-checked files this pass,
  but not exhaustively swept either.
- **RLS-helper query-planner regressions.** A SECURITY DEFINER function used
  inside an RLS policy with no `COST` hint can cause the planner to
  sequentially evaluate it per row on a multi-table join — this exact
  failure hit `can_read_golf_shot_detail` this week (877ms → 105ms after
  adding `COST 10000`; see Incident History). Any new RLS-gating function
  should get an explicit COST annotation from the start, not retrofitted
  after a timeout cluster.
- **Stale `team_id` assumptions** in coach/team joins, especially for a
  coach staffing more than one team — see `roster_team`'s multi-team cookie
  desync risk, which is really an access-control failure mode surfacing
  through a different feature's UI.
- **Admin/cron code leaking into client bundles** — service-role usage must
  stay inside `src/lib/supabase/admin.ts`'s boundary; a bundle-analysis or
  grep sweep for `SUPABASE_SERVICE_ROLE_KEY`/service-role imports outside
  that file was not re-run this pass.

## Observability Contract

No feature-specific observability contract (custom metrics, alert
thresholds) is defined in code as of `last_verified_sha` beyond CI's Review
Gate static checks (service-role-in-client-bundle, missing-RLS-on-new-table,
missing-auth-check, bare-table-name, destructive-write-pattern) and
`supabase db lint`.

## Test Contract

- pgTAP RLS tests under `supabase/tests/rls/` that are golf-specific and
  confirmed present: `golf_course_library.sql`,
  `golf_course_library_write_scoping.sql`,
  `golf_coach_insights_cross_tenant_select.sql`, `golf_team_coach_staff.sql`,
  `golf_shot_detail_visibility.sql`, `golf_metrics_attribute_parity.sql`,
  `documents_storage.sql`. The large majority of files in that directory are
  `baseball_*`-prefixed and out of scope for this doc.
- `src/test/lib/auth/**`, `src/test/lib/cron/auth.test.ts` — confirmed
  present.
- `npm run test:rls` and `supabase db lint --schema public` are the required
  checks per `memory/registry.yml`.
- **No pgTAP test exists for `golf_conversations`/`golf_messages`/
  `golf_announcements`/`golf_tasks`/`golf_travel_*` row-level policies** —
  cross-referenced from `team_communications` and `team_operations`, which
  hit the same gap independently. This is a real, repeated coverage hole
  across multiple features that all rely on this one's enforcement layer.

## Known Debt/Unknowns

- **The prior generation of this doc's Core Data list named `memberships`
  as a table.** It does not exist — absent from `src/lib/types/database.ts`
  and has zero query sites anywhere in `src/`. It is also **not** in
  `.doc-schema-baseline.json`, meaning this is newly-found drift this pass,
  not previously-known debt. `organizations` (also listed) is real and
  actively queried from golf onboarding/team code — do not conflate the two;
  only `memberships` is the dead one.
- Admin/audit backup tables created during this week's incident response
  (`backup_class_semester_20260813`, `backup_ci_junk_rounds_20260821`) were
  reported in this week's operational ledger as RLS-hardened (RLS enabled,
  anon/authenticated revoked) directly via MCP rather than through a
  committed migration file — no matching migration file was found for
  either table. Treat this as HINT-tier, not verified: the ledger is a
  same-week operational record, not a durable, independently-checkable
  source. Confirm live via `get_advisors`/`list_tables` before relying on it.
- A full bundle-analysis or repo-wide sweep for service-role key usage
  outside `src/lib/supabase/admin.ts` was not re-run this pass; the
  boundary is asserted from the existing rule and one file's confirmed
  role, not from an exhaustive current-state check.

## Incident History

- **2026-08-21 — `can_read_golf_shot_detail` planner cost regression.**
  Shared with `shot_tracking` and `stats_analytics`; full detail in those
  docs. Summary: a SECURITY DEFINER RLS helper with no `COST` hint caused
  sequential per-row evaluation on a 6-table join under the planner's
  default cost estimate; fixed via migration
  `20260821035329_can_read_golf_shot_detail_planner_cost.sql`
  (`ALTER FUNCTION ... COST 10000`), no policy or semantic change, verified
  live (`procost=10000`, `anon EXECUTE=false`, `authenticated=true`).
- **2026-08-21 — `addSecondTeam` RLS policy review flagged.** This week's
  Bridge/admin-events sweep flagged one `42501` (RLS denial) hit on
  `addSecondTeam` on 2026-08-05, queued for wave-3 analysis. `addSecondTeam`
  (`teams.ts:1718`, impl `addSecondTeamImpl`) and a comment at line 639
  referencing "same RLS shape as addSecondTeam" confirm the function and
  its RLS-sensitive `RETURNING` filtering exist; whether the flagged denial
  represents a bug or correct-and-expected enforcement was not resolved in
  the source ledger as of this doc's verification pass — treat as an open
  question, not a confirmed incident.

## ADR Links

None recorded yet — `memory/decisions/` contains only a README stub as of
`last_verified_sha`.

## Verification Evidence

- `auth.getUser()` call counts confirmed via direct grep of `roster.ts`,
  `messages.ts`, `tasks.ts`, `teams.ts` (all non-zero).
- `search_path` pinning confirmed via `grep -l "SET search_path"` across
  `supabase/migrations/*.sql`, spot-checking the three most recent
  matching files, all from `last_verified_sha`'s week.
- `src/lib/supabase/admin.ts` confirmed as the sole match for service-role
  usage patterns (`SUPABASE_SERVICE_ROLE_KEY`, `service_role`) under
  `src/lib/supabase/`.
- `memberships` confirmed absent from `src/lib/types/database.ts` AND
  absent from `.doc-schema-baseline.json` (checked directly, zero matches)
  — genuinely new drift, not previously-tracked baseline debt.
  `organizations` confirmed present and actively queried (23 files
  repo-wide reference `.from('organizations')`, including 3 under
  `src/app/golf/`).
- RLS test file list confirmed via direct `find supabase/tests/rls -iname
  "*golf*"` and targeted searches for messages/announcements/tasks/travel/
  roster-named files (none found beyond `golf_team_coach_staff.sql` and
  `documents_storage.sql`).
- `addSecondTeam`/`addSecondTeamImpl` confirmed present at
  `teams.ts:1718` via direct grep.
