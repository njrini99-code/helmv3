import 'server-only';

// =============================================================================
// src/lib/baseball/coachhelm/engine-event-derived.ts
//
// #852 residual — closes the velocity coverage gap engine-stat-rows.ts (#379
// Phase 4b) opened: a box-score-migrated player's legacy GAME rows (the only
// place `exit_velocity` / `pitch_velocity` scalars ever lived) are dropped for
// any date the canonical box-score layer now covers, and the canonical
// box-score tables carry no velocity columns at all. Per #379 design rule 4,
// the canonical velocity source is the elite EVENT layer, never a legacy
// scalar — loaders.ts's `eventDerived` hook (#851) already threads that
// per-field override into `loadPlayerMetrics` / `loadAllPlayerMetrics`, but
// nothing called it, so every migrated player's velocity metrics silently
// went dark. This module is that missing wire: it reads the event-grain
// tables and reduces them to the `EventDerivedVelocityInput` the loaders hook
// expects, reusing `elite-stat-events.ts`'s REAL aggregators (buildHitterMetrics
// / buildPitcherMetrics) so the honesty-gated average here is byte-identical
// to what the Stats Center already shows a coach -- never a second, drifting
// "average exit velocity" implementation.
//
// TWO LAYERS, mirroring loaders.ts's own split:
//   1. loadEngineEventRows (impure) -- team-scoped read of
//      baseball_pitch_events / baseball_batted_ball_events, paginated past the
//      PostgREST 1000-row cap (fetchAllRowsResult) with the #813 superseded-row
//      filter (`superseded_by_run_id IS NULL` -- only the CURRENT value powers
//      the engine, matching engine-run.ts's existing deepened-catalog read and
//      elite-stat-events.ts's own getEliteStatEvents). Also bounded by an
//      OPTIONAL `playerIds` scope (`.in('pitcher_id'|'batter_id', playerIds)`)
//      -- a single "convert to action" click only ever needs ONE player's
//      rows, so action-baseline.ts passes `[playerId]` rather than forcing a
//      team-wide scan; engine-run/outcome-sweep pass their own
//      roster/todo-derived id lists. No date window here -- callers apply
//      their OWN honesty window (e.g. outcome-sweep's after-window) by
//      filtering the returned rows before aggregating, the same way
//      loadEngineStatRows returns the full box-score history (for its own
//      player scope) and lets each caller decide how much of it to use.
//   2. buildEventDerivedByPlayer / eventDerivedVelocityForPlayer (pure) --
//      groups rows by player and calls buildHitterMetrics / buildPitcherMetrics
//      + eventDerivedVelocityFromMetrics to produce the per-player velocity
//      input. Fully unit-testable without a DB (fixed-clock friendly -- none
//      of this depends on the wall clock).
//
// ALL-OR-NOTHING (mirrors loadEngineStatRows's own honesty rule): if EITHER
// event table fails to read, `loadEngineEventRows` returns `data: null` and a
// caller must treat that as "no event-derived data for anyone this run" --
// never apply it to some players and not others depending on which table
// happened to fail. Falling back to `{}` (an empty eventDerivedByPlayer map)
// degrades every player to their legacy scalar for every velocity field,
// exactly the pre-#852-fix behavior -- never a partial event/legacy blend.
// =============================================================================

import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import {
  buildHitterMetrics,
  buildPitcherMetrics,
} from '@/lib/baseball/read-models/elite-stat-events';
import {
  eventDerivedVelocityFromMetrics,
  type EventDerivedVelocityInput,
} from '@/lib/coachhelm/baseball/loaders';
import type {
  BaseballPitchEvent,
  BaseballBattedBallEvent,
  BaseballDataContext,
} from '@/lib/types/baseball-stat-events';

// A minimally-typed client so this runs against the RLS server client or the
// service-role admin client (both expose `.from`) -- the same loose-client
// pattern as loadEngineStatRows / the three engine callers.
export type EngineEventRowsClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

// The event layer doesn't carry a "this is the competitive record" default the
// way elite-stat-events.ts's team/player Stats Center reads do; the engine
// wants every context's velocity signal (a bullpen session's pitch velocity is
// still an honest measurement), so this is only ever used as the metric
// factory's provenance fallback when a row's own `data_context` is missing.
const FALLBACK_CONTEXT: BaseballDataContext = 'official_game';

export interface EngineEventRows {
  pitches: BaseballPitchEvent[];
  battedBalls: BaseballBattedBallEvent[];
}

/**
 * Load the team's pitch + batted-ball event rows for velocity aggregation.
 *
 * Paginated past the PostgREST 1000-row cap (fetchAllRowsResult) with a stable
 * `id` order, and scoped to the #813 CURRENT rows only
 * (`superseded_by_run_id IS NULL`) -- a corrected import must never let a
 * stale, superseded pitch/batted-ball row into the engine's velocity average.
 *
 * `playerIds`, when passed, bounds the read to exactly the players the caller
 * needs -- mirrors loadEngineStatRows's own `.in('player_id', playerIds)`
 * scoping (this read's box-score sibling). `eventDerivedVelocityForPlayer` /
 * `buildEventDerivedByPlayer` only ever read a pitch row via its
 * `pitcher_id` and a batted-ball row via its `batter_id`, so that is exactly
 * what each table is filtered on -- a single coach "convert to action" click
 * (ONE player) must never fire a team-wide, unbounded scan of the entire
 * pitch/batted-ball history just to resolve that one player's velocity
 * scalar. Omit `playerIds` (or pass `undefined`) for a genuinely team-wide
 * read (engine-run / outcome-sweep already compute their own roster/todo
 * player-id list and now pass it through here too).
 *
 * ALL-OR-NOTHING: a failure on EITHER table returns `data: null` so a caller
 * degrades every player to their legacy scalar this run, never a partial
 * blend (see module docblock).
 */
export async function loadEngineEventRows(
  db: EngineEventRowsClient,
  teamId: string,
  playerIds?: string[],
): Promise<{ data: EngineEventRows | null; error: { message: string; code?: string | null } | null }> {
  if (!teamId) return { data: { pitches: [], battedBalls: [] }, error: null };
  // An explicitly empty scope list means "no players to resolve" -- honestly
  // return nothing rather than querying (mirrors loadEngineStatRows's own
  // `playerIds.length === 0` short-circuit).
  if (playerIds && playerIds.length === 0) {
    return { data: { pitches: [], battedBalls: [] }, error: null };
  }

  const [pitchRes, bbRes] = await Promise.all([
    fetchAllRowsResult<BaseballPitchEvent>((from, to) => {
      let q = db
        .from('baseball_pitch_events')
        .select('*')
        .eq('team_id', teamId)
        .is('superseded_by_run_id', null);
      if (playerIds) q = q.in('pitcher_id', playerIds);
      return q.order('id', { ascending: true }).range(from, to);
    }),
    fetchAllRowsResult<BaseballBattedBallEvent>((from, to) => {
      let q = db
        .from('baseball_batted_ball_events')
        .select('*')
        .eq('team_id', teamId)
        .is('superseded_by_run_id', null);
      if (playerIds) q = q.in('batter_id', playerIds);
      return q.order('id', { ascending: true }).range(from, to);
    }),
  ]);

  if (pitchRes.error || bbRes.error) {
    return { data: null, error: pitchRes.error ?? bbRes.error };
  }

  return {
    data: {
      pitches: (pitchRes.data ?? []) as BaseballPitchEvent[],
      battedBalls: (bbRes.data ?? []) as BaseballBattedBallEvent[],
    },
    error: null,
  };
}

const EMPTY_VELOCITY: EventDerivedVelocityInput = {
  avgExitVelocity: null,
  maxExitVelocity: null,
  avgPitchVelocity: null,
  maxPitchVelocity: null,
};

/**
 * Pure aggregation: given ALREADY-SCOPED pitch/batted-ball rows (the caller
 * decides the window -- full history, or an after-window subset), build the
 * EventDerivedVelocityInput for ONE player.
 *
 * Reuses elite-stat-events.ts's real aggregators:
 *   - a player's batted balls AS A BATTER -> buildHitterMetrics's
 *     'avg_exit_velocity' metric (pitches array is irrelevant to that metric,
 *     so an empty array is passed -- we only read this one metricKey out).
 *   - a player's pitches AS A PITCHER -> buildPitcherMetrics's 'avg_velocity'
 *     metric (battedBalls array is likewise irrelevant to that metric).
 * The two metric arrays are concatenated and handed to
 * `eventDerivedVelocityFromMetrics`, which independently resolves each of the
 * four velocity fields (max_* stay null -- there is no max-velocity event
 * metric yet, matching loaders.ts's own honest gap).
 */
export function eventDerivedVelocityForPlayer(
  playerId: string,
  pitches: BaseballPitchEvent[],
  battedBalls: BaseballBattedBallEvent[],
): EventDerivedVelocityInput {
  const battedBallsAsBatter = battedBalls.filter((b) => b.batter_id === playerId);
  const pitchesAsPitcher = pitches.filter((p) => p.pitcher_id === playerId);
  if (battedBallsAsBatter.length === 0 && pitchesAsPitcher.length === 0) {
    return EMPTY_VELOCITY;
  }
  const hitter = buildHitterMetrics(playerId, [], battedBallsAsBatter, FALLBACK_CONTEXT);
  const pitcher = buildPitcherMetrics(playerId, pitchesAsPitcher, [], FALLBACK_CONTEXT);
  return eventDerivedVelocityFromMetrics([...hitter.metrics, ...pitcher.metrics]);
}

/**
 * Build the `eventDerivedByPlayer` map `loadAllPlayerMetrics` consumes, for
 * every id in `playerIds` that has at least one pitch/batted-ball row in the
 * (already-scoped) pool. A player with zero event rows is simply absent from
 * the map -- `loadPlayerMetrics` falls back to their legacy scalar for every
 * velocity field, unchanged (honest absence, never a fabricated zero).
 */
export function buildEventDerivedByPlayer(
  playerIds: string[],
  pitches: BaseballPitchEvent[],
  battedBalls: BaseballBattedBallEvent[],
): Record<string, EventDerivedVelocityInput> {
  const battedByBatter = new Map<string, BaseballBattedBallEvent[]>();
  for (const bb of battedBalls) {
    if (!bb.batter_id) continue;
    const list = battedByBatter.get(bb.batter_id);
    if (list) list.push(bb);
    else battedByBatter.set(bb.batter_id, [bb]);
  }
  const pitchesByPitcher = new Map<string, BaseballPitchEvent[]>();
  for (const p of pitches) {
    if (!p.pitcher_id) continue;
    const list = pitchesByPitcher.get(p.pitcher_id);
    if (list) list.push(p);
    else pitchesByPitcher.set(p.pitcher_id, [p]);
  }

  const out: Record<string, EventDerivedVelocityInput> = {};
  for (const pid of playerIds) {
    const bbRows = battedByBatter.get(pid) ?? [];
    const pRows = pitchesByPitcher.get(pid) ?? [];
    if (bbRows.length === 0 && pRows.length === 0) continue;
    const hitter = buildHitterMetrics(pid, [], bbRows, FALLBACK_CONTEXT);
    const pitcher = buildPitcherMetrics(pid, pRows, [], FALLBACK_CONTEXT);
    const v = eventDerivedVelocityFromMetrics([...hitter.metrics, ...pitcher.metrics]);
    if (v.avgExitVelocity || v.avgPitchVelocity || v.maxExitVelocity || v.maxPitchVelocity) {
      out[pid] = v;
    }
  }
  return out;
}
