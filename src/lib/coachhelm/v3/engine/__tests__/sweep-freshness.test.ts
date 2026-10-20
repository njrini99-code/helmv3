import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));

import {
  newestReadDay,
  planFreshnessRefreshes,
  readsBehindNewestRound,
} from '../sweep-freshness';

const newest = { id: 'r9', round_date: '2026-10-18' };

describe('readsBehindNewestRound', () => {
  it('does nothing for a player with no reads (first analysis is the legacy rule)', () => {
    expect(readsBehindNewestRound(newest, [])).toBe(false);
    expect(readsBehindNewestRound(null, [{ window_end: '2026-10-01' }])).toBe(false);
  });

  it('refreshes when the newest round is after the newest read', () => {
    expect(
      readsBehindNewestRound(newest, [{ window_end: '2026-10-01' }, { window_end: '2026-10-12T00:00:00Z' }]),
    ).toBe(true);
  });

  it('compares against the NEWEST read, so one idle family does not re-queue the player', () => {
    expect(
      readsBehindNewestRound(newest, [{ window_end: '2026-09-01' }, { window_end: '2026-10-18' }]),
    ).toBe(false);
  });

  it('a read that already names the round is current', () => {
    expect(
      readsBehindNewestRound(newest, [{ window_end: '2026-10-01', newest_round_id: 'r9' }]),
    ).toBe(false);
  });

  it('refreshes when no read carries a window end (freshness unknowable)', () => {
    expect(readsBehindNewestRound(newest, [{ window_end: '' }, { window_end: null }])).toBe(true);
  });

  it('catches a second round on the same day once reads are stamped', () => {
    expect(
      readsBehindNewestRound(newest, [{ window_end: '2026-10-18', newest_round_id: 'r8' }]),
    ).toBe(true);
    // Unstamped reads on the same day cannot tell the two rounds apart.
    expect(readsBehindNewestRound(newest, [{ window_end: '2026-10-18' }])).toBe(false);
  });
});

describe('planFreshnessRefreshes', () => {
  it('runs the most out-of-date first (unknown first of all) up to the cap', () => {
    const c = [
      { playerId: 'a', newestReadDay: '2026-10-10' },
      { playerId: 'b', newestReadDay: null },
      { playerId: 'c', newestReadDay: '2026-09-01' },
      { playerId: 'd', newestReadDay: '2026-10-01' },
    ];
    const plan = planFreshnessRefreshes(c, 3);
    expect(plan.run.map((p) => p.playerId)).toEqual(['b', 'c', 'd']);
    expect(plan.deferred.map((p) => p.playerId)).toEqual(['a']);
  });

  it('newestReadDay picks the latest parseable window end', () => {
    expect(newestReadDay([{ window_end: '' }, { window_end: '2026-10-02' }, { window_end: '2026-09-30' }])).toBe('2026-10-02');
    expect(newestReadDay([])).toBeNull();
  });
});
