# Feature: BaseballHelm (recruiting + team management + Lift Lab)

```
feature_id: baseball_core
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: not_started
```

> **This is a new canonical doc.** `memory/registry.yml`'s own `feature` doc
> pointer for `baseball_core` is `memory/context/baseballhelm-features.md`, a
> whole-product route/feature inventory (202 lines) rather than a
> per-feature file — there was no `memory/features/baseball-core.md` before
> this pass. This doc summarizes that source and adds this week's git
> history; it does **not** re-verify the source's ~90 individual route/table
> claims line by line (see Known Debt/Unknowns) — that source document
> states its own trace date as 2026-06-30, with one identifier correction
> dated 2026-08-19, and explicitly warns "BaseballHelm is under active
> rework — trust DB enums/RLS as ground truth; treat route/behavior detail
> as current-state, not a frozen contract."

## Purpose

BaseballHelm is the college/JUCO/HS/showcase baseball product: recruiting
(coaches ↔ prospects), team/player operations, stats, and the Helm Lifting
Lab (strength & conditioning). It shares GolfHelm's Supabase project;
changes must be additive only — `baseball_*`/`helm_lifting_*` prefixed
tables, never touching `golf_*`.

## User Contract

A coach gets a 20-second command-center view of roster risk, today's events,
and daily contracts, plus dedicated hubs for stats, recruiting, and
development; a player gets a mobile-first "Today" home plus their own stats,
passport, dev plan, and lifting.

## Current Behavior

- Framework: Next.js 16 App Router, TypeScript strict, on the same Supabase
  project as GolfHelm.
- Auth/session: `getSessionProfile()` (`src/lib/auth/session.ts`) server-side;
  `useBaseballAuth()` client-side (Zustand persisted-profile fast path).
- Active team context: `getActiveBaseballContext()`
  (`src/lib/baseball/active-context.ts`) resolves role/team/player/coach ids
  from a server-validated cookie; `resolve-team.ts` handles multi-team orgs
  and never calls `.single()` on a multi-row result.
- Canonical server-action guard: `withBaseballAction(fn, { featureArea,
  requiredCapability?, requiredPlayerAccess? })`
  (`src/lib/baseball/with-baseball-action.ts`) — resolves user → coach/player
  profile → active team → membership → capability before running. Not every
  action uses it yet (a legacy split remains).
- Navigation: grouped "hubs" per role (`hub-definitions.ts`, `nav-registry.ts`,
  `nav-manifest.ts`, `nav-context.ts`). Three shell layouts exist in parallel
  (`(dashboard)/layout.tsx`, `(coach-dashboard)/coach/layout.tsx`,
  `(player-dashboard)/player/layout.tsx`) — flagged as drift in the source
  doc, unresolved.
- Stats is a three-layer model (`docs/operations/
  BASEBALL_STATS_SOURCE_OF_TRUTH.md`): Layer 1 legacy (deprecated,
  grandfathered reads), Layer 2 canonical box scores via the atomic RPC
  `save_baseball_full_box_score`, Layer 3 canonical elite pitch/batted-ball/
  swing event tables.
- Recruiting pipeline stage vocabulary now matches the live DB enum
  (`baseball_pipeline_stage`, 5 values) after a 2026-07-15 fix; a
  `profile_visibility='private'` leak in `getDiscoverPlayers`/
  `getStateCounts` was closed the same day and is regression-tested
  (`discover-privacy.test.ts`).
- Decision Room tables (`baseball_meeting_items`, `baseball_decision_log`)
  are confirmed applied to production (2026-07-09) — a stale "unapplied
  migration" comment in the codebase does not reflect current DB state.

## Invariants

- Every baseball migration is additive relative to `golf_*` — the products
  share one database.
- `assertCoachCanRecruitPlayer(supabase, coachId, coachType, playerId)`
  (`src/lib/baseball/recruitability.ts`) is the write-time gate for
  "can this coach act on this player," but **three parallel
  implementations** of the read-time question still exist
  (`recruitability.ts`, `discover.ts` inline, `public-profile-access.ts`) —
  real drift risk even though the worst known instance (the
  `profile_visibility` leak) is fixed.
- `updateMyPlayerProfile` writes only against the server-resolved
  `ctx.activePlayerId`; `EDITABLE_PROFILE_FIELDS` whitelists out
  `team_id`/`recruiting_activated`/`id` from player self-edit.
- The Kanban drag path for `pipeline_stage` writes directly from the client
  and is RLS-only — it bypasses `assertCoachCanRecruitPlayer` — while the
  table-dropdown path goes through the gated `updateWatchlistStatus()`. Two
  write paths for the same field.

## Primary Journeys

1. Coach onboarding → program creation wizard → roster.
2. Recruiting coach → discover/watchlist/pipeline → scout-packet share link.
3. Player → Today home → stats/dev-plan/lift/passport, and (non-college
   players) recruiting opt-in.

## Architecture/Data Flow

```txt
Coach/player request
  -> getSessionProfile() / useBaseballAuth()
  -> getActiveBaseballContext() [team/role/player/coach ids from cookie]
  -> withBaseballAction(fn, {featureArea, requiredCapability}) guard
  -> capability check (baseball_team_coach_staff boolean matrix)
  -> RLS-scoped read/write
```

## Permissions/Tenancy

`capabilities.ts` + `capability-groups.ts` define a `baseball_team_coach_staff`
boolean matrix (`can_manage_lifting`, `can_view_readiness`,
`can_manage_practice`, `can_manage_stats`, `can_manage_imports`,
`can_view_private_notes`, `can_view_academics`, `can_manage_roster`,
`can_invite_staff`, `can_export_reports`, `can_message_players`,
`can_manage_settings`). The `(dashboard)/layout.tsx` guard is UX-only
(team-presence check); real protection is server-side per page via
`withBaseballAction` + capability + RLS. Staff active-status and
`scope_player_ids` isolation are hardened at the RLS layer
(`is_baseball_team_staff()`, `can_view_baseball_player()`), with a pgTAP
isolation test at `supabase/tests/rls/
baseball_scope_player_ids_isolation.sql` — note this is a **test file
name**, not a database object (see Known Debt/Unknowns).

## Dependencies

supabase, sentry.

## Failure Modes

- The dual write-path for `pipeline_stage` (client-side Kanban drag vs.
  gated dropdown action) can diverge from the capability/ownership checks
  the gated path enforces.
- Layer-1 legacy box-score savers (`saveBoxScoreBatting`/`Pitching`) do
  unwrapped DELETE-then-INSERT — data-loss on partial failure — but are
  UI-dead; the live write path is the atomic `save_baseball_full_box_score`
  RPC.
- Three parallel "can this coach see this player" implementations (see
  Invariants) remain a standing drift risk for any new recruiting surface.

## Observability Contract

`src/lib/coachhelm/baseball/` is the baseball CoachHelm engine; its harness
`engine-run.ts`'s `runBaseballEngineCore` short-circuits before any DB read
when the master AI switch is off. Promotion to a `baseball_signals` triage
row requires `medium`/`high`/`urgent` severity (never `low`); `sample_n < 6`
yields `disposition: 'sample_too_small'`. `baseball_ai_audit` records engine
activity (confirmed real table).

## Test Contract

- `supabase/tests/rls/baseball_*.sql`
- `e2e/baseball-*.spec.ts`
- `discover-privacy.test.ts`, `documents-write-capability.test.ts` (24
  direct capability/signed-URL assertions), `stat-layer-contract.test.ts`

## Known Debt/Unknowns

- This pass did **not** independently re-verify the ~90 route/table claims
  in `memory/context/baseballhelm-features.md` against `database.ts` or the
  live file tree — that source document's own 2026-06-30 trace date and
  "active rework" caveat, combined with 284 distinct `baseball_*`
  identifiers present in `database.ts` alone, put a full re-verification out
  of scope for this doc pass. Flagged as the largest unverified surface
  across all 7 features in this batch.
- The source doc's schema-drift banner names `baseball_scope_
  player_ids_isolation` as a non-existent identifier. Confirmed: it is a
  **test file** (`supabase/tests/rls/
  baseball_scope_player_ids_isolation.sql`), not a table/view/function — the
  schema-drift checker's naming-pattern match caught a file name, not an
  actual drift. Worth noting as an example doc-hygiene trap in its own
  right.
- `src/lib/admin/feature-registry.ts` (the separate runtime observability
  registry) has ~9+ granular `baseball_*` sub-feature ids (`baseball_
  academics`, `baseball_announcements`, `baseball_auth`, `baseball_calendar`,
  `baseball_camps`, `baseball_classes`, `baseball_coach_command_center`,
  `baseball_coachhelm`, `baseball_command_center`, ...) where
  `memory/registry.yml` has exactly one (`baseball_core`). No cross-check
  exists yet; not evaluated for correctness in this pass.
- `baseball_lift_*` legacy tables are kept read-only in parallel with the
  unified `helm_lifting_*` model (source doc's own "dual-schema" note) — not
  independently re-verified here.
- No baseball-specific items appeared in tonight's `/tmp/claude/night/
  ledger.md` triage (that pass was golf-only) — Incident History below is
  git-log-only, not ledger-sourced.

## Incident History

No `memory/incidents/baseball_core/` directory exists yet. From `git log
--since=2026-08-18` on `src/app/baseball/**`, `src/lib/baseball/**`,
`src/app/api/baseball/**`:

- `295afb103` — "bind player ids to their team across the last 13 write
  paths" (auth/security hardening).
- `f30f1fdd1` — "add the roster-containment gate the 29 open findings all
  need."
- `6f6217835` — "close the 10 Semgrep findings that are real regardless of
  RLS."
- `f55c74eae` — "run the invitation-release RPC as service role, not as the
  caller."
- `e8c826b8f` — "log settings read failures in requireAcademicsCoachRoute."

## ADR Links

None yet.

## Verification Evidence

- Read in full: `memory/context/baseballhelm-features.md` (202 lines).
- `git log --since=2026-08-18` for the three baseball code roots above: 5
  matching commits (plus 2 cross-cutting security/perf commits touching
  shared files, listed for completeness but not baseball-specific).
- Confirmed `baseball_*` table-name density in `database.ts`: 284 distinct
  identifiers matching `"baseball_[a-z_]+"` (a mix of tables and FK
  constraint names — not independently split by type in this pass).
- Confirmed `baseball_scope_player_ids_isolation` is absent from
  `database.ts` (0 matches) and present as a real file at
  `supabase/tests/rls/baseball_scope_player_ids_isolation.sql`.
- Confirmed `src/lib/admin/feature-registry.ts` defines a `baseball_*`
  sub-feature vocabulary distinct from and finer-grained than
  `memory/registry.yml`'s single `baseball_core` entry.
- Did not read `docs/audits/BASEBALLHELM_CANONICAL_SPEC.md` (691 lines) in
  full this pass; confirmed only that it exists and is cross-referenced by
  the source doc.
