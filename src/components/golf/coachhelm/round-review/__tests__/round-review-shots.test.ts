import { describe, it, expect, vi } from 'vitest';
import {
  buildReviewShotsByHole,
  mapShotRowToReviewShot,
  bandForPuttFeet,
  puttMakePctBandLabel,
  fetchPlayerPuttMakePct,
  type RawGolfShotRow,
} from '../round-review-shots';

function row(overrides: Partial<RawGolfShotRow> = {}): RawGolfShotRow {
  return {
    id: 'shot-1',
    hole_number: 6,
    shot_number: 1,
    shot_type: 'tee',
    lie_before: 'tee',
    lie_after: 'fairway',
    distance_to_hole_before: 400,
    distance_to_hole_after: 150,
    distance_unit_before: 'yards',
    distance_unit_after: 'yards',
    shot_distance: 250,
    putt_distance_feet: null,
    putt_made: null,
    result: 'fairway',
    miss_direction: null,
    is_penalty: false,
    club_type: 'driver',
    penalty_type: null,
    putt_break: null,
    putt_slope: null,
    notes: null,
    putt_details: null,
    approach_miss_details: null,
    ...overrides,
  };
}

describe('mapShotRowToReviewShot', () => {
  it('carries every base ShotInput field through verbatim', () => {
    const shot = mapShotRowToReviewShot(row());
    expect(shot.shot_number).toBe(1);
    expect(shot.lie_after).toBe('fairway');
    expect(shot.lie_before).toBe('tee');
    expect(shot.distance_to_hole_after).toBe(150);
    expect(shot.distance_to_hole_before).toBe(400);
    expect(shot.distance_unit_before).toBe('yards');
    expect(shot.distance_unit_after).toBe('yards');
    expect(shot.shot_distance).toBe(250);
    expect(shot.club_type).toBe('driver');
    expect(shot.is_penalty).toBe(false);
  });

  it('surfaces shot_type verbatim — needed by ReviewHero\'s per-hole SG category attribution', () => {
    expect(mapShotRowToReviewShot(row({ shot_type: 'putting' })).shot_type).toBe('putting');
    expect(mapShotRowToReviewShot(row({ shot_type: null })).shot_type).toBeNull();
  });

  it('attaches a non-null sg for a fully-logged shot', () => {
    const shot = mapShotRowToReviewShot(row());
    expect(shot.sg).not.toBeNull();
    expect(typeof shot.sg).toBe('number');
  });

  it('is null-honest: sg stays null when lie_before is unlogged', () => {
    const shot = mapShotRowToReviewShot(row({ lie_before: null }));
    expect(shot.sg).toBeNull();
  });

  it('surfaces putt_details.miss_tags (populated column) onto miss_tags', () => {
    const shot = mapShotRowToReviewShot(
      row({
        shot_type: 'putting',
        lie_before: 'green',
        lie_after: 'green',
        putt_details: { miss_tags: ['low', 'short'], made: false },
      }),
    );
    expect(shot.miss_tags).toEqual(['low', 'short']);
  });

  it('accepts a 1-element-array embed shape (Supabase FK cardinality variance)', () => {
    const shot = mapShotRowToReviewShot(
      row({ putt_details: [{ miss_tags: ['high'], made: false }] }),
    );
    expect(shot.miss_tags).toEqual(['high']);
  });

  it('falls back putt_made to putt_details.made only when the base column is null', () => {
    const fallback = mapShotRowToReviewShot(
      row({ putt_made: null, putt_details: { miss_tags: null, made: true } }),
    );
    expect(fallback.putt_made).toBe(true);

    const baseWins = mapShotRowToReviewShot(
      row({ putt_made: false, putt_details: { miss_tags: null, made: true } }),
    );
    expect(baseWins.putt_made).toBe(false);
  });

  it('never surfaces estimated_break_inches — the column is confirmed 0% populated in prod', () => {
    const shot = mapShotRowToReviewShot(row());
    expect(shot.estimated_break_inches).toBeUndefined();
  });

  it('surfaces approach_miss_details.lie_type / distance_from_green_yards as dark-detail fields', () => {
    const shot = mapShotRowToReviewShot(
      row({
        shot_type: 'approach',
        approach_miss_details: { lie_type: 'bunker', distance_from_green_yards: 8 },
      }),
    );
    expect(shot.approach_miss_lie_type).toBe('bunker');
    expect(shot.approach_miss_distance_from_green_yards).toBe(8);
  });

  it('does not fabricate approach dark-detail fields when no detail row exists', () => {
    const shot = mapShotRowToReviewShot(row({ approach_miss_details: null }));
    expect(shot.approach_miss_lie_type).toBeNull();
    expect(shot.approach_miss_distance_from_green_yards).toBeNull();
  });

  it('matches the real prod hole-6 penalty shot shape: before === after, shot_distance 0, sg < 0', () => {
    const shot = mapShotRowToReviewShot(
      row({
        shot_number: 1,
        shot_type: 'penalty',
        club_type: 'non_driver',
        lie_before: 'tee',
        lie_after: 'penalty',
        distance_to_hole_before: 564,
        distance_to_hole_after: 564,
        distance_unit_before: 'yards',
        distance_unit_after: 'yards',
        shot_distance: 0,
        result: 'penalty',
        is_penalty: true,
        penalty_type: 'ob',
      }),
    );
    expect(shot.sg).not.toBeNull();
    expect(shot.sg as number).toBeLessThan(0);
    // shot_distance is passed through verbatim from the DB (geometry.ts's
    // own Wave-A fix nulls it for penalties downstream in PlottedShot — this
    // view-model layer must not pre-empt that, only report what's logged).
    expect(shot.shot_distance).toBe(0);
  });
});

describe('buildReviewShotsByHole', () => {
  it('groups rows by hole_number, preserving given order', () => {
    const rows = [
      row({ id: 'h6-1', hole_number: 6, shot_number: 1 }),
      row({ id: 'h6-2', hole_number: 6, shot_number: 2 }),
      row({ id: 'h7-1', hole_number: 7, shot_number: 1 }),
    ];
    const map = buildReviewShotsByHole(rows);
    expect([...map.keys()]).toEqual([6, 7]);
    expect(map.get(6)).toHaveLength(2);
    expect(map.get(7)).toHaveLength(1);
  });

  it('threads a resolved sgScale into every shot in the hole', () => {
    const rows = [row({ hole_number: 6, shot_number: 1 })];
    const unscaled = buildReviewShotsByHole(rows, 1).get(6)![0]!.sg;
    const scaled = buildReviewShotsByHole(rows, 1.083).get(6)![0]!.sg;
    expect(unscaled).not.toBeNull();
    expect(scaled).not.toBeNull();
    expect(scaled).not.toBe(unscaled);
  });

  it('reproduces the real prod hole 6 (7 shots: penalty, 2 approach, 1 green approach, 3 putts)', () => {
    // Verbatim from the b126b8f6-cd60-4086-b5ca-744c45d4fa78 round, pulled
    // live via the Supabase MCP during STEP 1 verification. Neither
    // putt_details nor approach_miss_details has rows for this particular
    // (older) round — the dark-detail fields must stay null, not fabricated.
    const rows: RawGolfShotRow[] = [
      row({
        id: '7d3ae506', shot_number: 1, shot_type: 'penalty', club_type: 'non_driver',
        lie_before: 'tee', lie_after: 'penalty', distance_to_hole_before: 564,
        distance_to_hole_after: 564, shot_distance: 0, result: 'penalty',
        is_penalty: true, penalty_type: 'ob',
      }),
      row({
        id: 'd9c16351', shot_number: 2, shot_type: 'approach', lie_before: 'tee',
        lie_after: 'rough', distance_to_hole_before: 564, distance_to_hole_after: 260,
        shot_distance: 304, result: 'rough', miss_direction: 'left',
      }),
      row({
        id: 'fbf9184a', shot_number: 3, shot_type: 'approach', lie_before: 'rough',
        lie_after: 'fairway', distance_to_hole_before: 260, distance_to_hole_after: 55,
        shot_distance: 205, result: 'fairway', miss_direction: 'short',
      }),
      row({
        id: '73f38cae', shot_number: 4, shot_type: 'approach', lie_before: 'fairway',
        lie_after: 'green', distance_to_hole_before: 55, distance_to_hole_after: 10,
        distance_unit_after: 'feet', shot_distance: 52, result: 'green',
      }),
      row({
        id: '513eb407', shot_number: 5, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', lie_after: 'green', distance_to_hole_before: 10,
        distance_to_hole_after: 1, distance_unit_before: 'feet', distance_unit_after: 'feet',
        shot_distance: 3, result: 'green', putt_break: 'left_to_right', putt_slope: 'downhill',
        putt_distance_feet: 10, putt_made: false,
      }),
      row({
        id: 'c1f92a60', shot_number: 6, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', lie_after: 'green', distance_to_hole_before: 1,
        distance_to_hole_after: 3, distance_unit_before: 'feet', distance_unit_after: 'feet',
        shot_distance: 0, result: 'green', putt_break: 'straight', putt_slope: 'level',
        putt_distance_feet: 1, putt_made: false,
      }),
      row({
        id: '4d12b692', shot_number: 7, shot_type: 'putting', club_type: 'putter',
        lie_before: 'green', lie_after: 'green', distance_to_hole_before: 3,
        distance_to_hole_after: 0, distance_unit_before: 'feet', distance_unit_after: 'feet',
        shot_distance: 1, result: 'hole', putt_break: 'straight', putt_slope: 'level',
        putt_distance_feet: 3, putt_made: true,
      }),
    ].map((r) => ({ ...r, hole_number: 6 }));

    const hole6 = buildReviewShotsByHole(rows, 1).get(6)!;
    expect(hole6).toHaveLength(7);
    // Every shot has lie_before + distance_to_hole_before logged -> every
    // shot on this (worst-case) hole should score.
    for (const shot of hole6) {
      expect(shot.sg).not.toBeNull();
    }
    // The penalty stroke (shot 1) must read as a loss, never a gain.
    expect(hole6[0]!.sg as number).toBeLessThan(0);
    // The holed final putt (shot 7) must read as a gain.
    expect(hole6[6]!.sg as number).toBeGreaterThan(0);
    // Dark-detail fields stay honestly null — this round predates
    // putt_details/approach_miss_details population.
    for (const shot of hole6) {
      expect(shot.miss_tags).toBeNull();
      expect(shot.approach_miss_lie_type).toBeNull();
    }
  });
});

describe('bandForPuttFeet', () => {
  // Verbatim boundaries from `update_player_putt_make_pct()`'s SQL
  // (migration 20260606160000): left-inclusive / right-exclusive.
  it('buckets left-inclusive/right-exclusive, matching the DB writer\'s own boundaries', () => {
    expect(bandForPuttFeet(0)).toBe('0_3');
    expect(bandForPuttFeet(2.9)).toBe('0_3');
    expect(bandForPuttFeet(3)).toBe('3_5');
    expect(bandForPuttFeet(4.9)).toBe('3_5');
    expect(bandForPuttFeet(5)).toBe('5_10');
    expect(bandForPuttFeet(9.9)).toBe('5_10');
    expect(bandForPuttFeet(10)).toBe('10_15');
    expect(bandForPuttFeet(14.9)).toBe('10_15');
    expect(bandForPuttFeet(15)).toBe('15_20');
    expect(bandForPuttFeet(19.9)).toBe('15_20');
    expect(bandForPuttFeet(20)).toBe('20_plus');
    expect(bandForPuttFeet(60)).toBe('20_plus');
  });
});

describe('puttMakePctBandLabel', () => {
  it('names every band with its human-readable feet range', () => {
    expect(puttMakePctBandLabel('0_3')).toBe('0-3 ft');
    expect(puttMakePctBandLabel('3_5')).toBe('3-5 ft');
    expect(puttMakePctBandLabel('5_10')).toBe('5-10 ft');
    expect(puttMakePctBandLabel('10_15')).toBe('10-15 ft');
    expect(puttMakePctBandLabel('15_20')).toBe('15-20 ft');
    expect(puttMakePctBandLabel('20_plus')).toBe('20+ ft');
  });
});

describe('fetchPlayerPuttMakePct', () => {
  function fakeSupabase(result: { data: unknown; error: unknown }) {
    const maybeSingle = vi.fn().mockResolvedValue(result);
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    const client = { from } as unknown as Parameters<typeof fetchPlayerPuttMakePct>[0];
    return { client, from };
  }

  it('returns null without querying when playerId is empty', async () => {
    const { client, from } = fakeSupabase({ data: null, error: null });
    const result = await fetchPlayerPuttMakePct(client, '');
    expect(result).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it('returns null (never throws) on a query error', async () => {
    const { client } = fakeSupabase({ data: null, error: { message: 'boom' } });
    const result = await fetchPlayerPuttMakePct(client, 'player-1');
    expect(result).toBeNull();
  });

  it('returns null when no cache row exists for this player yet', async () => {
    const { client } = fakeSupabase({ data: null, error: null });
    const result = await fetchPlayerPuttMakePct(client, 'player-1');
    expect(result).toBeNull();
  });

  it('maps every band verbatim, 0-100 percent — never re-scaled', async () => {
    const { client } = fakeSupabase({
      data: {
        putt_make_pct_0_3ft: 96.5,
        putt_make_pct_3_5ft: 62,
        putt_make_pct_5_10ft: null,
        putt_make_pct_10_15ft: 30,
        putt_make_pct_15_20ft: null,
        putt_make_pct_20_plus_ft: 8,
      },
      error: null,
    });
    const result = await fetchPlayerPuttMakePct(client, 'player-1');
    expect(result).toEqual({
      '0_3': 96.5,
      '3_5': 62,
      '5_10': null,
      '10_15': 30,
      '15_20': null,
      '20_plus': 8,
    });
  });
});
