// =============================================================================
// Unit tests for the #852 residual velocity-coverage fix.
//
// loaders.ts's `eventDerived` hook (#851) already threaded exit/pitch velocity
// overrides into loadPlayerMetrics/loadAllPlayerMetrics, but nothing called it
// -- box-score-migrated players (whose legacy exit_velocity/pitch_velocity
// scalar is dropped alongside their superseded legacy GAME rows) had NO
// velocity metric at all. engine-event-derived.ts is the missing wire. These
// pin:
//   1. eventDerivedVelocityForPlayer resolves a hitter's avg exit velocity from
//      their OWN batted-ball events and a pitcher's avg pitch velocity from
//      their OWN pitch events (independently -- a two-way player gets both).
//   2. buildEventDerivedByPlayer only populates players with at least one
//      event row (honest absence for a zero-event player, never a fabricated
//      zero) -- the caller's per-player legacy fallback is what serves them.
//   3. loadEngineEventRows respects the #813 superseded-row filter and
//      degrades ALL-OR-NOTHING (data: null) when either table's read fails.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  loadEngineEventRows,
  eventDerivedVelocityForPlayer,
  buildEventDerivedByPlayer,
} from '@/lib/baseball/coachhelm/engine-event-derived';
import type {
  BaseballPitchEvent,
  BaseballBattedBallEvent,
} from '@/lib/types/baseball-stat-events';

const TEAM = 'team-1';

function pitchEvent(overrides: Partial<BaseballPitchEvent> & { id: string }): BaseballPitchEvent {
  return {
    team_id: TEAM,
    game_id: null,
    practice_id: null,
    plate_appearance_id: null,
    pitcher_id: null,
    batter_id: null,
    catcher_id: null,
    data_context: 'official_game',
    pitch_number: null,
    pitch_type: null,
    pitch_type_classified: null,
    pitch_call: null,
    pitch_result: null,
    velocity: null,
    spin_rate: null,
    spin_axis: null,
    spin_efficiency: null,
    seam_orientation: null,
    induced_vertical_break: null,
    horizontal_break: null,
    release_height: null,
    release_side: null,
    extension: null,
    plate_height: null,
    plate_side: null,
    zone: null,
    intended_location: null,
    miss_distance: null,
    is_swing: null,
    is_whiff: null,
    is_chase: null,
    is_called_strike: null,
    is_in_zone: null,
    count_state: null,
    batter_handedness: null,
    video_id: null,
    external_pitch_id: null,
    import_run_id: null,
    source_id: null,
    trust_tier: 'official',
    visibility: 'staff_only',
    measured_at: '2026-04-01T00:00:00.000Z',
    created_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function battedBall(
  overrides: Partial<BaseballBattedBallEvent> & { id: string },
): BaseballBattedBallEvent {
  return {
    team_id: TEAM,
    game_id: null,
    practice_id: null,
    plate_appearance_id: null,
    pitch_event_id: null,
    batter_id: null,
    pitcher_id: null,
    data_context: 'official_game',
    exit_velocity: null,
    launch_angle: null,
    spray_angle: null,
    distance: null,
    hang_time: null,
    batted_ball_type: null,
    field_zone: null,
    is_hard_hit: null,
    is_barrel: null,
    is_sweet_spot: null,
    result: null,
    pitch_type: null,
    video_id: null,
    external_event_id: null,
    import_run_id: null,
    source_id: null,
    trust_tier: 'official',
    visibility: 'staff_only',
    measured_at: '2026-04-01T00:00:00.000Z',
    created_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('eventDerivedVelocityForPlayer — per-player hitter/pitcher aggregation', () => {
  it("resolves a hitter's avg exit velocity from their OWN batted-ball events only", () => {
    const battedBalls = [
      battedBall({ id: 'bb1', batter_id: 'p1', exit_velocity: 90 }),
      battedBall({ id: 'bb2', batter_id: 'p1', exit_velocity: 94 }),
      // A different player's batted ball must not leak into p1's average.
      battedBall({ id: 'bb3', batter_id: 'p2', exit_velocity: 60 }),
    ];
    const out = eventDerivedVelocityForPlayer('p1', [], battedBalls);
    expect(out.avgExitVelocity).toEqual({ value: 92, sampleSize: 2 });
    // No max-velocity event metric exists yet (honest gap, matches loaders.ts).
    expect(out.maxExitVelocity).toBeNull();
    expect(out.avgPitchVelocity).toBeNull();
    expect(out.maxPitchVelocity).toBeNull();
  });

  it("resolves a pitcher's avg pitch velocity from their OWN pitches only", () => {
    const pitches = [
      pitchEvent({ id: 'p1a', pitcher_id: 'p9', velocity: 88 }),
      pitchEvent({ id: 'p1b', pitcher_id: 'p9', velocity: 92 }),
      // A different pitcher's pitch must not leak into p9's average.
      pitchEvent({ id: 'p2a', pitcher_id: 'p8', velocity: 70 }),
    ];
    const out = eventDerivedVelocityForPlayer('p9', pitches, []);
    expect(out.avgPitchVelocity).toEqual({ value: 90, sampleSize: 2 });
    expect(out.maxPitchVelocity).toBeNull();
    expect(out.avgExitVelocity).toBeNull();
  });

  it('a two-way player gets BOTH sides independently from their own rows on each side', () => {
    const pitches = [pitchEvent({ id: 'pt1', pitcher_id: 'p1', velocity: 91 })];
    const battedBalls = [battedBall({ id: 'bb1', batter_id: 'p1', exit_velocity: 95 })];
    const out = eventDerivedVelocityForPlayer('p1', pitches, battedBalls);
    expect(out.avgExitVelocity).toEqual({ value: 95, sampleSize: 1 });
    expect(out.avgPitchVelocity).toEqual({ value: 91, sampleSize: 1 });
  });

  it('a player with zero matching rows on either side returns all-null (honest absence)', () => {
    const out = eventDerivedVelocityForPlayer('ghost', [], []);
    expect(out).toEqual({
      avgExitVelocity: null,
      maxExitVelocity: null,
      avgPitchVelocity: null,
      maxPitchVelocity: null,
    });
  });
});

describe('buildEventDerivedByPlayer — team-wide map', () => {
  it('populates only players with at least one event row; a zero-event player is absent (legacy fallback keeps serving them)', () => {
    const pitches = [pitchEvent({ id: 'pt1', pitcher_id: 'p2', velocity: 89 })];
    const battedBalls = [battedBall({ id: 'bb1', batter_id: 'p1', exit_velocity: 93 })];

    const map = buildEventDerivedByPlayer(['p1', 'p2', 'p3'], pitches, battedBalls);

    expect(map.p1?.avgExitVelocity).toEqual({ value: 93, sampleSize: 1 });
    expect(map.p2?.avgPitchVelocity).toEqual({ value: 89, sampleSize: 1 });
    // p3 has no event rows at all -- absent from the map entirely.
    expect(map.p3).toBeUndefined();
  });

  it('returns an empty map when no player has any event rows', () => {
    const map = buildEventDerivedByPlayer(['p1', 'p2'], [], []);
    expect(map).toEqual({});
  });
});

// -----------------------------------------------------------------------------
// loadEngineEventRows — the DB-fetch layer (pagination + #813 supersede filter
// + all-or-nothing degrade).
// -----------------------------------------------------------------------------

type Row = Record<string, unknown>;

/**
 * Same minimal chainable fake shape as engine-stat-rows.test.ts's, plus a REAL
 * (not no-op) `.is()` so the #813 supersede-filter test below is an honest
 * assertion rather than a smoke test, and a REAL `.in()` so the player-id
 * scoping test below actually exercises the DB-side filter, not just the
 * pure aggregation layer.
 */
function makeClient(tables: Record<string, Row[]>, errorTables: Set<string> = new Set()) {
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      const fail = errorTables.has(table);
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        is: (col: string, val: unknown) => {
          rows = rows.filter((r) => r[col] === val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          rows = rows.filter((r) => vals.includes(r[col]));
          return builder;
        },
        order: () => builder,
        range: () =>
          Promise.resolve(
            fail ? { data: null, error: { message: `${table} read failed` } } : { data: rows, error: null },
          ),
      };
      return builder;
    },
  };
}

describe('loadEngineEventRows', () => {
  it('respects the #813 superseded-row filter (only the current row powers the engine)', async () => {
    // Plain rows (not the strict BaseballPitchEvent factory) -- the fake
    // client's tables are untyped Row[], and `superseded_by_run_id` isn't on
    // the hand-written type (a real DB column the query filters on but the
    // engine never reads back), so a loose row literal is the honest fixture
    // shape here.
    const client = makeClient({
      baseball_pitch_events: [
        { id: 'pt-old', team_id: TEAM, pitcher_id: 'p1', velocity: 70, superseded_by_run_id: 'run-1' },
        { id: 'pt-current', team_id: TEAM, pitcher_id: 'p1', velocity: 92, superseded_by_run_id: null },
      ],
      baseball_batted_ball_events: [],
    });

    const { data, error } = await loadEngineEventRows(client, TEAM);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.pitches.map((p) => p.id)).toEqual(['pt-current']);
  });

  it('degrades ALL-OR-NOTHING (data: null) when either table read fails', async () => {
    const client = makeClient(
      {
        baseball_pitch_events: [{ id: 'pt1', team_id: TEAM, superseded_by_run_id: null }],
        baseball_batted_ball_events: [],
      },
      new Set(['baseball_batted_ball_events']),
    );

    const { data, error } = await loadEngineEventRows(client, TEAM);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it('returns an empty pool without querying when no team id is given', async () => {
    let queried = false;
    const client = {
      from() {
        queried = true;
        throw new Error('should not query');
      },
    };
    const { data, error } = await loadEngineEventRows(client, '');
    expect(data).toEqual({ pitches: [], battedBalls: [] });
    expect(error).toBeNull();
    expect(queried).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// loadEngineEventRows — player-id scoping (unbounded-read fix).
//
// buildActionOutcomeSeed (action-baseline.ts) resolves ONE player's velocity
// scalar on every coach "convert to action" click; it must never fire a
// team-wide, unbounded scan of the whole pitch/batted-ball history to do so.
// These pin that the optional `playerIds` param actually bounds the DB read
// (not just the pure aggregation downstream), mirroring loadEngineStatRows's
// own `.in('player_id', playerIds)` scoping.
// -----------------------------------------------------------------------------
describe('loadEngineEventRows — player-id scoping (unbounded-read fix)', () => {
  it('scopes the pitch read to pitcher_id IN playerIds and the batted-ball read to batter_id IN playerIds — other players never enter the pool', async () => {
    const client = makeClient({
      baseball_pitch_events: [
        { id: 'pt-p1', team_id: TEAM, pitcher_id: 'p1', velocity: 90, superseded_by_run_id: null },
        { id: 'pt-p2', team_id: TEAM, pitcher_id: 'p2', velocity: 70, superseded_by_run_id: null },
      ],
      baseball_batted_ball_events: [
        { id: 'bb-p1', team_id: TEAM, batter_id: 'p1', exit_velocity: 100, superseded_by_run_id: null },
        { id: 'bb-p2', team_id: TEAM, batter_id: 'p2', exit_velocity: 60, superseded_by_run_id: null },
      ],
    });

    const { data, error } = await loadEngineEventRows(client, TEAM, ['p1']);
    expect(error).toBeNull();
    expect(data!.pitches.map((p) => p.id)).toEqual(['pt-p1']);
    expect(data!.battedBalls.map((b) => b.id)).toEqual(['bb-p1']);
  });

  it('returns an empty pool WITHOUT querying when playerIds is an explicit empty array', async () => {
    let queried = false;
    const client = {
      from() {
        queried = true;
        throw new Error('should not query');
      },
    };
    const { data, error } = await loadEngineEventRows(client, TEAM, []);
    expect(data).toEqual({ pitches: [], battedBalls: [] });
    expect(error).toBeNull();
    expect(queried).toBe(false);
  });

  it('omitting playerIds keeps the team-wide read (explicit opt-in only — no behavior change for a caller that truly needs every player)', async () => {
    const client = makeClient({
      baseball_pitch_events: [
        { id: 'pt-p1', team_id: TEAM, pitcher_id: 'p1', velocity: 90, superseded_by_run_id: null },
        { id: 'pt-p2', team_id: TEAM, pitcher_id: 'p2', velocity: 70, superseded_by_run_id: null },
      ],
      baseball_batted_ball_events: [],
    });
    const { data } = await loadEngineEventRows(client, TEAM);
    expect(data!.pitches.map((p) => p.id).sort()).toEqual(['pt-p1', 'pt-p2']);
  });
});
