import { describe, it, expect } from 'vitest';
import { computePriority, isStuckRound, isAbandonedRound } from '../TracerRoundInspector';
import type { FlatRound } from '../tracer-types';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeRound(overrides: Partial<FlatRound> = {}): FlatRound {
  const now = Date.now();
  return {
    round_id: 'round-1',
    player_id: 'player-1',
    player_name: 'Test Player',
    status: 'in_progress',
    course_name: 'Test Course',
    round_date: new Date(now).toISOString().slice(0, 10),
    expected_holes: 18,
    total_score: null,
    score_to_par: null,
    current_hole: 5,
    created_at: new Date(now - HOUR).toISOString(),
    updated_at: new Date(now - HOUR).toISOString(),
    actual_holes: 4,
    total_shots: 20,
    putt_details_count: 4,
    approach_details_count: 4,
    stats_cached: true,
    has_strokes_gained: true,
    has_putts: true,
    has_fairways: true,
    has_gir: true,
    errors: [],
    ...overrides,
  };
}

describe('round activity tiers (TracerRoundInspector)', () => {
  it('a round idle under 1h is neither stuck nor abandoned', () => {
    const round = makeRound({
      created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    });
    expect(isStuckRound(round)).toBe(false);
    expect(isAbandonedRound(round)).toBe(false);
  });

  it('a recently-created round idle 1h+ is stuck, not abandoned', () => {
    const round = makeRound({
      created_at: new Date(Date.now() - 2 * DAY).toISOString(),
      updated_at: new Date(Date.now() - 2 * HOUR).toISOString(),
    });
    expect(isStuckRound(round)).toBe(true);
    expect(isAbandonedRound(round)).toBe(false);
  });

  it('a round created months ago and idle 1h+ is abandoned, not stuck', () => {
    const round = makeRound({
      created_at: new Date(Date.now() - 90 * DAY).toISOString(),
      updated_at: new Date(Date.now() - 10 * DAY).toISOString(),
    });
    expect(isStuckRound(round)).toBe(false);
    expect(isAbandonedRound(round)).toBe(true);
  });

  it('a round untouched for 30+ days still classifies as abandoned in the table (not silently dropped)', () => {
    const round = makeRound({
      created_at: new Date(Date.now() - 120 * DAY).toISOString(),
      updated_at: new Date(Date.now() - 100 * DAY).toISOString(),
    });
    expect(isStuckRound(round)).toBe(false);
    expect(isAbandonedRound(round)).toBe(true);
  });

  it('a completed round is neither stuck nor abandoned', () => {
    const round = makeRound({
      status: 'completed',
      total_score: 72,
      updated_at: new Date(Date.now() - 200 * DAY).toISOString(),
    });
    expect(isStuckRound(round)).toBe(false);
    expect(isAbandonedRound(round)).toBe(false);
  });
});

describe('computePriority (TracerRoundInspector)', () => {
  it('ranks a fresh stuck round above an abandoned one with the same other signals', () => {
    // Equal holes/no errors/cached stats isolates the stuck-vs-abandoned
    // weight itself rather than mixing in the other scoring signals.
    const base: Partial<FlatRound> = { actual_holes: 18, expected_holes: 18, stats_cached: true, errors: [] };
    const stuck = makeRound({
      ...base,
      created_at: new Date(Date.now() - 2 * DAY).toISOString(),
      updated_at: new Date(Date.now() - 2 * HOUR).toISOString(),
    });
    const abandoned = makeRound({
      ...base,
      created_at: new Date(Date.now() - 90 * DAY).toISOString(),
      updated_at: new Date(Date.now() - 10 * DAY).toISOString(),
    });

    const stuckPriority = computePriority(stuck);
    const abandonedPriority = computePriority(abandoned);

    expect(stuckPriority.score).toBeGreaterThan(abandonedPriority.score);
    expect(stuckPriority.level).toBe('high');
    expect(abandonedPriority.level).toBe('low');
  });

  it('does not mark an old abandoned round as critical even before other signals stack', () => {
    const abandoned = makeRound({
      created_at: new Date(Date.now() - 90 * DAY).toISOString(),
      updated_at: new Date(Date.now() - 10 * DAY).toISOString(),
      stats_cached: true,
      actual_holes: 18,
      errors: [],
    });
    expect(computePriority(abandoned).level).not.toBe('critical');
  });
});
