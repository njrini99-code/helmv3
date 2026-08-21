# Feature: Stats And Analytics

```yaml
feature_id: stats_analytics
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: not_started
```

## Purpose

Turn round and shot data into player, team, and profile-level numbers that
power GolfHelm's stats pages, coach roster views, and CoachHelm pattern
mining. Stats are a derived, cached view over `shot_tracking`'s evidence —
never the source of truth themselves.

## User Contract

- A player or coach viewing stats sees numbers scoped to what they're allowed
  to see (own data for a player; team-scoped for a coach) and never sees a
  metric presented as computed when the underlying data doesn't support it.
- Stats update after a round completes, though not necessarily instantly —
  refresh is lazy, not synchronous with round submission.
- Missing detail (e.g. no shot-level data for older rounds) shows as an
  explicit gap, not a silently zeroed or fabricated number.

## Current Behavior

Stats are cache-backed. `invalidateOnRoundComplete()`
(`src/lib/cache/golf-stats-calculator.ts:359`) marks `golf_player_stats_cache`
stale after a round completes and makes a best-effort, non-critical attempt at
strokes-gained recalculation; the next read of stats refreshes the cache
lazily rather than the invalidation call doing the recompute itself. Reads
that hit a stale/absent cache entry recompute from `golf_rounds`/`golf_holes`/
`golf_shots` on the read path.

## Invariants

- `golf_rounds`/`golf_holes`/`golf_shots` remain the source of truth; cached
  tables (`golf_player_stats_cache`, `golf_round_stats_cache`) are derived and
  may be rebuilt from source at any time.
- A player only ever sees their own stats; a coach only sees stats for
  players on their team(s) — enforced by the same RLS surface as
  `team_access_control`, not by client-side filtering.
- Team analytics must not mix players across teams or organizations.
- A metric with no supporting data (no shot detail, no strokes-gained
  backfill) must be represented as absent, not as zero.

## Primary Journeys

1. **Player stats page**: reads `golf_player_stats_cache`, falls back to
   on-demand aggregation from source rounds/shots when the cache is stale or
   missing, renders scoring/driving/approach/putting/scrambling/strokes-gained
   sections.
2. **Team stats / roster profile**: coach-facing aggregate and per-player
   views, same cache-or-recompute pattern, scoped to the coach's team.
3. **CoachHelm consumption**: `src/lib/coachhelm/v2/stats/**` reads the same
   cache/source data to feed pattern mining; CoachHelm does not own stat
   calculation truth, it consumes it.

## Architecture/Data Flow

```txt
Round completion (shot_tracking)
  -> invalidateOnRoundComplete(playerId, roundId)
  -> mark golf_player_stats_cache stale for that player
  -> best-effort, non-critical strokes-gained recalculation RPC attempt
  -> next stats read finds a stale/missing cache entry
       -> recompute from golf_rounds / golf_holes / golf_shots
       -> write back to golf_player_stats_cache / golf_round_stats_cache
  -> stats page / team stats / roster profile / CoachHelm all read
     cache-or-recompute results
```

## Permissions/Tenancy

Stats reads are gated by the same RLS helper family as shot reads —
`can_read_golf_shot_detail` (SECURITY DEFINER) governs detailed shot-level
data; team/coach scoping runs through `golf_team_coach_staff`. See
`team_access_control` for the shared enforcement layer; this doc does not
duplicate policy definitions.

## Dependencies

- `shot_tracking` (source data; shares the `golf_shots` read-perf surface).
- `coachhelm_ai` (consumes cache/source stats for pattern mining; does not
  write stats).
- `qualifiers` (qualifier-scoped stat views draw from the same source data).

## Failure Modes

- **Stale-cache surprise.** Because refresh is lazy, an agent or user
  expecting stats to update the instant a round submits can be looking at a
  stale cache entry for however long it takes for the next read to trigger
  recompute. This is expected behavior, not a bug, but it reads as one if
  undocumented — which is why it's called out explicitly here.
- **Shared read-perf surface with shot_tracking.** `can_read_golf_shot_detail`
  gates detailed shot reads used by both stats aggregation and shot review;
  it had no `COST` hint until 2026-08-21, causing the planner to sequentially
  evaluate it per-row on multi-table joins (877ms → 105ms after the fix). See
  Incident History — the same fix applies here since stats computation reads
  through the same function.
- **Rounds without shot detail.** Older or lower-fidelity rounds may have
  score-only data with no shot-level breakdown; stat sections that depend on
  shot detail need an explicit fallback/absent state rather than assuming
  every round has full detail.

## Observability Contract

No feature-specific observability contract (custom metrics, alert
thresholds) is defined in code as of `last_verified_sha` beyond the general
error-logging conventions shared across golf server actions
(`logServerError`). Treat this as an open gap, not a verified "none needed."

## Test Contract

- `src/app/golf/actions/__tests__/stats-data.test.ts`
- `src/test/coachhelm/v2/stats/**` — confirmed present on disk
  (`src/test/coachhelm/v2/stats/`), contrary to the registry's cited path,
  which is otherwise fine (same directory, no drift found here).
- `src/test/coachhelm/v2/shot-analysis/**`
- No dedicated pgTAP RLS test exists for the stats cache tables under
  `supabase/tests/rls/`; the closest coverage is `golf_shot_detail_visibility.sql`
  and `golf_metrics_attribute_parity.sql`, both of which test upstream shot
  data, not the cache tables themselves.

## Known Debt/Unknowns

- **`golf_putting_tendencies` does not exist in production.** It was named in
  the prior generation of this doc (and still carried a schema-drift banner
  there) as if it had schema/RLS but no write path. Re-verified this pass:
  the table is absent from `src/lib/types/database.ts`'s generated table list
  AND there are now zero references to it anywhere in `src/` — the earlier
  claim that app code at least referenced it appears to have been cleaned up
  since the banner was written. Do not build on this table; if putting
  tendency tracking is wanted, it needs a new table + migration.
- Strokes-gained columns on `golf_rounds` exist but are generally null in
  practice — the "best-effort, non-critical" recalculation on round
  completion does not guarantee a populated value. Confirm actual population
  rate before presenting strokes-gained as a reliable metric in any new
  surface.
- No documented cache-consistency test (e.g., "cache matches recompute from
  source") exists; correctness of the lazy-refresh path rests on code review,
  not an automated invariant check.

## Incident History

- **2026-08-21 — `can_read_golf_shot_detail` planner cost.** Shared incident
  with `shot_tracking`; see that doc's Incident History for full detail.
  Fixed via migration `20260821035329_can_read_golf_shot_detail_planner_cost.sql`.
  Relevant here because stats computation that touches shot-level detail
  reads through the same gate.

## ADR Links

None recorded yet — `memory/decisions/` contains only a README stub as of
`last_verified_sha`.

## Verification Evidence

- `golf_player_stats_cache`, `golf_round_stats_cache` confirmed present in
  `src/lib/types/database.ts`'s generated table list; `golf_putting_tendencies`
  confirmed absent (both from the type file and from a repo-wide `grep -rl`).
- `invalidateOnRoundComplete` confirmed at `src/lib/cache/golf-stats-calculator.ts:359`,
  including the "mark stale" and "best-effort SG recalculation" behavior read
  directly from the function body.
- Action files (`stats.ts`, `stats-data.ts`, `stats-data-types.ts`,
  `stats-intelligence.ts`, `player-profile-stats.ts`) and
  `src/lib/coachhelm/v2/stats/**` confirmed present on disk.
- `src/app/api/stats/**`, named in `memory/registry.yml`'s `code.api` list for
  this feature, does not exist — `src/app/api/` has no `stats` subdirectory.
  This feature has no dedicated API route; it is server-action only. Flagging
  as registry drift, not reproducing the dead path in this doc's own entry
  points.
