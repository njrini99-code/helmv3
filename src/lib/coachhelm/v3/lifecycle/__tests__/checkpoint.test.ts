import { describe, expect, it } from 'vitest';
import {
  anyCheckpoint,
  checkpointCovers,
  countAttempts,
  evaluateCheckpoint,
  familyForMetric,
  familyForShot,
  parseAttempts,
  type CheckpointRound,
  type CheckpointShot,
  type PlayerCheckpointState,
} from '../checkpoint';

const NOW = '2026-10-20T03:00:00.000Z';

function rounds(n: number): CheckpointRound[] {
  // r0 is the newest.
  return Array.from({ length: n }, (_, i) => ({
    id: `r${i}`,
    round_date: new Date(Date.UTC(2026, 9, 19) - i * 86400_000).toISOString().slice(0, 10),
    created_at: null,
  }));
}

function shot(round: string, type: string, extra: Partial<CheckpointShot> = {}): CheckpointShot {
  return {
    round_id: round,
    shot_type: type,
    lie_before: null,
    distance_to_hole_before: null,
    distance_unit_before: null,
    result: null,
    putt_made: null,
    ...extra,
  };
}

function state(partial: Partial<PlayerCheckpointState> = {}): PlayerCheckpointState {
  return {
    last_checkpoint_round_id: 'r2',
    last_checkpoint_at: '2026-10-10T03:00:00.000Z',
    checkpoint_count: 4,
    rounds_since: 0,
    attempts_since: {},
    ...partial,
  };
}

describe('families', () => {
  it('maps read metrics to their shot family; round-only metrics to null', () => {
    expect(familyForMetric('putts_made_3_5ft_pct')).toBe('putt_3_5ft');
    expect(familyForMetric('putts_made_25_plus_ft_pct')).toBe('putt_25_plus_ft');
    expect(familyForMetric('approach_proximity_125_175ft')).toBe('approach_125_175');
    expect(familyForMetric('sg_ott')).toBe('tee_shot');
    expect(familyForMetric('scrambling_pct_sand')).toBe('sand');
    expect(familyForMetric('scoring_par_4')).toBeNull();
    expect(familyForMetric('penalty_rate_per_round')).toBeNull();
    expect(familyForMetric(null)).toBeNull();
  });

  it('classifies shots: putt bands (lo, hi], approach bands in yards, tee, bunker', () => {
    expect(familyForShot(shot('r', 'putting', { distance_to_hole_before: 4 }))).toBe('putt_3_5ft');
    expect(familyForShot(shot('r', 'putting', { distance_to_hole_before: 5 }))).toBe('putt_3_5ft');
    expect(familyForShot(shot('r', 'putting', { distance_to_hole_before: 3 }))).toBeNull();
    expect(familyForShot(shot('r', 'Putting', { distance_to_hole_before: 30 }))).toBe('putt_25_plus_ft');
    expect(familyForShot(shot('r', 'approach', { distance_to_hole_before: 100, distance_unit_before: 'yards' }))).toBe('approach_50_125');
    expect(familyForShot(shot('r', 'approach', { distance_to_hole_before: 450, distance_unit_before: 'feet' }))).toBe('approach_125_175');
    expect(familyForShot(shot('r', 'approach', { distance_to_hole_before: 30, distance_unit_before: 'yards' }))).toBeNull();
    expect(familyForShot(shot('r', 'tee'))).toBe('tee_shot');
    expect(familyForShot(shot('r', 'around_green', { lie_before: 'sand' }))).toBe('sand');
    expect(familyForShot(shot('r', 'around_green', { lie_before: 'rough' }))).toBeNull();
  });

  it('counts attempts only on the given rounds', () => {
    const shots = [shot('r0', 'tee'), shot('r0', 'tee'), shot('r9', 'tee')];
    expect(countAttempts(shots, new Set(['r0']))).toEqual({ tee_shot: 2 });
  });

  it('parses stored attempts defensively', () => {
    expect(parseAttempts({ tee_shot: 3, bogus: 9, sand: -1, putt_3_5ft: 'x' })).toEqual({ tee_shot: 3 });
    expect(parseAttempts(null)).toEqual({});
    expect(parseAttempts([1])).toEqual({});
  });
});

describe('evaluateCheckpoint', () => {
  it('first pass sets the baseline on the newest countable round and fires nothing', () => {
    const d = evaluateCheckpoint(null, rounds(5), [], NOW);
    expect(d.kind).toBe('baseline');
    expect(d.next).toMatchObject({ last_checkpoint_round_id: 'r0', checkpoint_count: 0, rounds_since: 0 });
    expect(anyCheckpoint(d)).toBe(false);
    expect(checkpointCovers(d, null)).toBe(false);
  });

  it('a deleted anchor resets the baseline without losing the count', () => {
    const d = evaluateCheckpoint(state({ last_checkpoint_round_id: 'gone' }), rounds(5), [], NOW);
    expect(d.kind).toBe('baseline');
    expect(d.next.checkpoint_count).toBe(4);
  });

  it('no countable round: the anchor stays null', () => {
    expect(evaluateCheckpoint(null, [], [], NOW).next.last_checkpoint_round_id).toBeNull();
  });

  it('3 countable rounds since the anchor fire a player checkpoint covering every family', () => {
    const d = evaluateCheckpoint(state({ last_checkpoint_round_id: 'r3' }), rounds(6), [], NOW);
    expect(d.kind).toBe('player');
    expect(d.next).toMatchObject({ last_checkpoint_round_id: 'r0', checkpoint_count: 5, rounds_since: 0, attempts_since: {}, last_checkpoint_at: NOW });
    expect(checkpointCovers(d, null)).toBe(true);
    expect(checkpointCovers(d, 'putt_3_5ft')).toBe(true);
  });

  it('2 rounds and fewer than 20 attempts anywhere: nothing fires, counts are kept', () => {
    const shots = Array.from({ length: 19 }, () => shot('r0', 'tee'));
    const d = evaluateCheckpoint(state(), rounds(5), shots, NOW);
    expect(d.kind).toBe('families');
    expect(anyCheckpoint(d)).toBe(false);
    expect(d.next).toMatchObject({ rounds_since: 2, attempts_since: { tee_shot: 19 }, checkpoint_count: 4, last_checkpoint_round_id: 'r2' });
  });

  it('20 attempts in one family fire a family checkpoint for that family only', () => {
    const shots = [...Array.from({ length: 12 }, () => shot('r0', 'tee')), ...Array.from({ length: 9 }, () => shot('r1', 'tee'))];
    const d = evaluateCheckpoint(state({ attempts_since: { tee_shot: 14 } }), rounds(5), shots, NOW);
    expect(d.kind).toBe('families');
    if (d.kind !== 'families') throw new Error('unreachable');
    expect(d.families).toEqual(['tee_shot']);
    expect(checkpointCovers(d, 'tee_shot')).toBe(true);
    expect(checkpointCovers(d, 'putt_3_5ft')).toBe(false);
    expect(checkpointCovers(d, null)).toBe(false);
    expect(d.next.last_checkpoint_at).toBe(NOW);
    // The same 21 attempts tomorrow do not fire again.
    const again = evaluateCheckpoint(d.next, rounds(5), shots, NOW);
    expect(anyCheckpoint(again)).toBe(false);
  });

  it('shots on rounds at or before the anchor never count', () => {
    const shots = Array.from({ length: 30 }, () => shot('r2', 'tee'));
    expect(anyCheckpoint(evaluateCheckpoint(state(), rounds(5), shots, NOW))).toBe(false);
  });
});
