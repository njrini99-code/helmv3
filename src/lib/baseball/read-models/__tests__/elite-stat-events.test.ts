// =============================================================================
// Unit tests for the elite stat-EVENT read model's PURE aggregation logic.
//
// These cover the source -> derived-metric math (chase/whiff/CSW/hard-hit/
// barrel), the honest sample/confidence contract (no fake 'high' on a thin
// sample), provenance (weakest trust tier wins), and the count-bucket / zone
// classification. The DB-bound getEliteStatEvents is not exercised here (that is
// integration-tested via RLS); the builders are pure and deterministic.
// =============================================================================

import { describe, it, expect } from 'vitest';

import {
  buildHitterMetrics,
  buildPitcherMetrics,
  countBucketOf,
  zoneBucketOf,
  buildSourceChips,
  toStatVisualsData,
  parseIntendedTarget,
  type EliteStatEventsReadModel,
} from '../elite-stat-events';
import type {
  BaseballPitchEvent,
  BaseballBattedBallEvent,
} from '@/lib/types/baseball-stat-events';

// Minimal pitch-event factory — only the fields the builders read.
function pitch(p: Partial<BaseballPitchEvent>): BaseballPitchEvent {
  return {
    id: Math.random().toString(36).slice(2),
    team_id: 't',
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
    measured_at: null,
    created_at: '2026-01-01',
    ...p,
  };
}

function bbe(b: Partial<BaseballBattedBallEvent>): BaseballBattedBallEvent {
  return {
    id: Math.random().toString(36).slice(2),
    team_id: 't',
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
    measured_at: null,
    created_at: '2026-01-01',
    ...b,
  };
}

function metric(model: { metrics: { metricKey: string }[] }, key: string) {
  return (model.metrics as import('../elite-stat-events').DerivedMetric[]).find(
    (m) => m.metricKey === key,
  );
}

describe('countBucketOf', () => {
  it('maps 0-0 to first_pitch', () => expect(countBucketOf('0-0')).toBe('first_pitch'));
  it('maps any 2-strike count to two_strike', () => {
    expect(countBucketOf('0-2')).toBe('two_strike');
    expect(countBucketOf('3-2')).toBe('two_strike');
  });
  it('maps balls>strikes to hitter_ahead', () => expect(countBucketOf('2-0')).toBe('hitter_ahead'));
  it('maps strikes>balls (non-2K) to pitcher_ahead', () => expect(countBucketOf('0-1')).toBe('pitcher_ahead'));
  it('maps even to even', () => expect(countBucketOf('1-1')).toBe('even'));
  it('returns null on garbage', () => expect(countBucketOf('foo')).toBeNull());
});

describe('zoneBucketOf', () => {
  it('passes through 1-9 in-zone ids', () => {
    expect(zoneBucketOf({ zone: 5, is_in_zone: true, plate_side: null, plate_height: null })).toBe('5');
  });
  it('classifies OOZ by side/height sign', () => {
    expect(zoneBucketOf({ zone: null, is_in_zone: false, plate_side: -1, plate_height: 1 })).toBe('chase_tl');
    expect(zoneBucketOf({ zone: null, is_in_zone: false, plate_side: 1, plate_height: -1 })).toBe('chase_br');
  });
});

describe('buildHitterMetrics — plate discipline math', () => {
  // 10 OOZ pitches, batter swings at 3 of them -> chase rate 0.30.
  // 10 in-zone pitches, swings at 8, whiffs on 2 of those -> zone-contact 6/8.
  const pitches = [
    ...Array.from({ length: 7 }, () => pitch({ is_in_zone: false, is_swing: false })),
    ...Array.from({ length: 3 }, () => pitch({ is_in_zone: false, is_swing: true, is_whiff: true })),
    ...Array.from({ length: 2 }, () => pitch({ is_in_zone: true, is_swing: false })),
    ...Array.from({ length: 6 }, () => pitch({ is_in_zone: true, is_swing: true })),
    ...Array.from({ length: 2 }, () => pitch({ is_in_zone: true, is_swing: true, is_whiff: true })),
  ];
  const model = buildHitterMetrics('p1', pitches, [], 'official_game');

  it('computes chase rate from OOZ swings', () => {
    const m = metric(model, 'chase_rate')!;
    expect(m.value).toBeCloseTo(3 / 10);
    expect(m.sampleSize).toBe(10); // out-of-zone denominator
    expect(m.higherIsBetter).toBe(false);
  });

  it('computes zone-contact rate from in-zone swings that were not whiffs', () => {
    const m = metric(model, 'zone_contact_rate')!;
    // in-zone swings = 6 + 2 = 8; contact = 6
    expect(m.value).toBeCloseTo(6 / 8);
    expect(m.sampleSize).toBe(8);
  });

  it('computes whiff rate from all swings', () => {
    const m = metric(model, 'whiff_rate')!;
    // swings: 3 (ooz) + 6 + 2 = 11; whiffs: 3 + 2 = 5
    expect(m.value).toBeCloseTo(5 / 11);
  });

  it('returns null value (not 0) when the denominator is empty', () => {
    const empty = buildHitterMetrics('p1', [], [], 'official_game');
    const m = metric(empty, 'chase_rate')!;
    expect(m.value).toBeNull();
    expect(m.sampleSize).toBe(0);
    expect(m.confidence).toBe('insufficient');
  });
});

describe('buildHitterMetrics — batted-ball quality', () => {
  const battedBalls = [
    bbe({ is_hard_hit: true, is_barrel: true, batted_ball_type: 'line_drive' }),
    bbe({ is_hard_hit: true, is_barrel: false, batted_ball_type: 'fly_ball' }),
    bbe({ is_hard_hit: false, is_barrel: false, batted_ball_type: 'ground_ball' }),
    bbe({ is_hard_hit: false, is_barrel: false, batted_ball_type: 'ground_ball' }),
  ];
  const model = buildHitterMetrics('p1', [], battedBalls, 'official_game');

  it('hard-hit rate is hard/total', () => {
    expect(metric(model, 'hard_hit_rate')!.value).toBeCloseTo(2 / 4);
  });
  it('barrel rate is barrels/total', () => {
    expect(metric(model, 'barrel_rate')!.value).toBeCloseTo(1 / 4);
  });
  it('GB rate counts ground balls', () => {
    expect(metric(model, 'gb_rate')!.value).toBeCloseTo(2 / 4);
  });
  it('emits one EV/LA + spray point per batted ball', () => {
    expect(model.visuals.evLaPoints).toHaveLength(4);
    expect(model.visuals.sprayPoints).toHaveLength(4);
  });
});

describe('honest confidence + provenance', () => {
  it('never returns high on a thin sample', () => {
    const thin = buildHitterMetrics('p1', Array.from({ length: 5 }, () => pitch({ is_in_zone: false, is_swing: true })), [], 'official_game');
    const m = metric(thin, 'chase_rate')!;
    expect(m.confidence).not.toBe('high');
  });

  it('surfaces the WEAKEST trust tier present (never over-claims official)', () => {
    const mixed = [
      pitch({ is_in_zone: false, is_swing: true, trust_tier: 'official' }),
      ...Array.from({ length: 30 }, () => pitch({ is_in_zone: false, is_swing: false, trust_tier: 'unverified' })),
    ];
    const model = buildHitterMetrics('p1', mixed, [], 'official_game');
    expect(metric(model, 'chase_rate')!.trustTier).toBe('unverified');
  });

  it('buildSourceChips returns one chip per distinct tier, weakest-first', () => {
    const chips = buildSourceChips([
      { trust_tier: 'official' },
      { trust_tier: 'unverified' },
      { trust_tier: 'official' },
    ]);
    expect(chips).toHaveLength(2);
    expect(chips[0]!.trust.trustLevel).toBe('unreviewed'); // weakest first
  });
});

describe('buildPitcherMetrics — CSW + putaway', () => {
  const pitches = [
    ...Array.from({ length: 10 }, () => pitch({ is_called_strike: true })),
    ...Array.from({ length: 10 }, () => pitch({ is_swing: true, is_whiff: true })),
    ...Array.from({ length: 30 }, () => pitch({ is_swing: true })),
  ];
  const model = buildPitcherMetrics('p1', pitches, [], 'official_game');

  it('CSW% = (called strikes + whiffs) / pitches', () => {
    expect(metric(model, 'csw_rate')!.value).toBeCloseTo(20 / 50);
    expect(metric(model, 'csw_rate')!.higherIsBetter).toBe(true);
  });
});

describe('toStatVisualsData adapter', () => {
  const hitter = buildHitterMetrics('p1', [pitch({ is_in_zone: false, is_swing: true })], [bbe({ exit_velocity: 95, launch_angle: 12 })], 'official_game');
  const pitcher = buildPitcherMetrics('p2', [pitch({ pitch_type: 'FF', velocity: 92, pitch_number: 3 })], [], 'official_game');
  const model: EliteStatEventsReadModel = {
    teamId: 't',
    authorized: true,
    contexts: ['official_game'],
    hitters: [hitter],
    pitchers: [pitcher],
    summary: { pitchEvents: 2, battedBallEvents: 1, swingEvents: 0, plateAppearances: 0, playersWithEventData: 2 },
    error: null,
  };

  it('player scope passes that player payloads through', () => {
    const data = toStatVisualsData(model, { playerId: 'p1' });
    expect(data.evLa).toHaveLength(1);
    expect(data.zoneMetric).toBe('chase');
  });

  it('team scope concatenates point payloads across players', () => {
    const data = toStatVisualsData(model);
    expect(data.evLa).toHaveLength(1); // one batted ball total
    expect(data.zoneTotalPitches).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// Command miss-vectors + release cloud (pitcher) — added with the stat-visuals
// depth build-out. Verify the located-pitch payloads + the intended-location
// parser stay honest (null target when intent is unknown; null release when the
// release point isn't captured).
// =============================================================================

describe('parseIntendedTarget', () => {
  it('returns null for unknown / empty intent (never a fabricated center)', () => {
    expect(parseIntendedTarget(null)).toBeNull();
    expect(parseIntendedTarget('')).toBeNull();
    expect(parseIntendedTarget('whatever-nonsense')).toBeNull();
  });

  it('maps a numeric zone id to that grid cell center', () => {
    expect(parseIntendedTarget('1')).toEqual({ x: -0.6, y: 0.6 }); // top-left
    expect(parseIntendedTarget('5')).toEqual({ x: 0, y: 0 }); // middle
    expect(parseIntendedTarget('9')).toEqual({ x: 0.6, y: -0.6 }); // bottom-right
  });

  it('maps directional language to a normalized target', () => {
    expect(parseIntendedTarget('up and in')).toEqual({ x: -0.6, y: 0.6 });
    expect(parseIntendedTarget('low away')).toEqual({ x: 0.6, y: -0.6 });
    expect(parseIntendedTarget('glove-side')).toEqual({ x: 0.6, y: 0 });
  });
});

describe('buildPitcherMetrics — command vectors + release cloud', () => {
  it('emits a located miss-vector with actual coords + parsed target', () => {
    const p = buildPitcherMetrics(
      'pit1',
      [
        pitch({
          pitcher_id: 'pit1',
          plate_side: 0.4,
          plate_height: 3.0,
          intended_location: 'low away',
          pitch_type_classified: 'FB',
        }),
      ],
      [],
      'official_game',
    );
    expect(p.visuals.commandVectors).toHaveLength(1);
    expect(p.visuals.commandTotalPitches).toBe(1);
    const v = p.visuals.commandVectors[0]!;
    expect(v.actualX).toBeCloseTo(0.42, 1);
    expect(v.targetX).toBe(0.6); // parsed from "away"
    expect(v.targetY).toBe(-0.6); // parsed from "low"
  });

  it('does not emit a command vector when the plate location is missing', () => {
    const p = buildPitcherMetrics(
      'pit1',
      [pitch({ pitcher_id: 'pit1', plate_side: null, plate_height: null })],
      [],
      'official_game',
    );
    expect(p.visuals.commandVectors).toHaveLength(0);
    expect(p.visuals.commandTotalPitches).toBe(0);
  });

  it('emits a release point only when release side+height are captured', () => {
    const p = buildPitcherMetrics(
      'pit1',
      [
        pitch({ pitcher_id: 'pit1', release_side: -1.8, release_height: 5.9, extension: 6.2, pitch_type_classified: 'SL' }),
        pitch({ pitcher_id: 'pit1', release_side: null, release_height: null }),
      ],
      [],
      'official_game',
    );
    expect(p.visuals.release).toHaveLength(1);
    expect(p.visuals.release[0]!.releaseHeight).toBe(5.9);
    expect(p.visuals.release[0]!.pitchType).toBe('SL');
  });

  it('toStatVisualsData threads command + release through (player scope)', () => {
    const pitcher = buildPitcherMetrics(
      'p1',
      [pitch({ pitcher_id: 'p1', plate_side: 0.1, plate_height: 2.5, release_side: -1.5, release_height: 6.0 })],
      [],
      'official_game',
    );
    const model: EliteStatEventsReadModel = {
      teamId: 't',
      authorized: true,
      contexts: ['official_game'],
      hitters: [],
      pitchers: [pitcher],
      summary: { pitchEvents: 1, battedBallEvents: 0, swingEvents: 0, plateAppearances: 0, playersWithEventData: 1 },
      error: null,
    };
    const data = toStatVisualsData(model, { playerId: 'p1' });
    expect(data.command).toHaveLength(1);
    expect(data.commandTotalPitches).toBe(1);
    expect(data.release).toHaveLength(1);
  });
});
