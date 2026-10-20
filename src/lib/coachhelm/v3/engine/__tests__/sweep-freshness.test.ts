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
      readsBehindNewestRound(newest, [{ window_end: '2026-10-18', newest_round_id: 'r8', scanned_through_round_id: 'r8' }]),
    ).toBe(true);
    // Unstamped reads on the same day cannot tell the two rounds apart.
    expect(readsBehindNewestRound(newest, [{ window_end: '2026-10-18' }])).toBe(false);
  });

  it('a read that scanned the round is current even when the round added nothing to it', () => {
    // A sand read: its newest bunker round is r5, but it scanned through r9.
    expect(
      readsBehindNewestRound(newest, [{ window_end: '2026-10-18', newest_round_id: 'r5', scanned_through_round_id: 'r9' }]),
    ).toBe(false);
  });
});

describe('planFreshnessRefreshes', () => {
  const c = Array.from({ length: 60 }, (_, i) => ({ playerId: `p${i}` }));

  it('splits at the cap, and runs everyone when under it', () => {
    const plan = planFreshnessRefreshes(c, 20381, 25);
    expect(plan.run).toHaveLength(25);
    expect(plan.deferred).toHaveLength(35);
    expect(planFreshnessRefreshes(c.slice(0, 5), 20381, 25).run).toHaveLength(5);
  });

  it('is stable within a night and rotates between nights', () => {
    const a = planFreshnessRefreshes(c, 20381, 25).run.map((p) => p.playerId);
    expect(planFreshnessRefreshes([...c].reverse(), 20381, 25).run.map((p) => p.playerId)).toEqual(a);
    const b = planFreshnessRefreshes(c, 20382, 25).run.map((p) => p.playerId);
    expect(b.filter((id) => a.includes(id))).toHaveLength(0);
  });

  it('every candidate gets a turn within ceil(N / cap) nights (no pinned slots)', () => {
    const seen = new Set<string>();
    for (let night = 20381; night < 20381 + Math.ceil(60 / 25); night++) {
      planFreshnessRefreshes(c, night, 25).run.forEach((p) => seen.add(p.playerId));
    }
    expect(seen.size).toBe(60);
  });

  it('newestReadDay picks the latest parseable window end', () => {
    expect(newestReadDay([{ window_end: '' }, { window_end: '2026-10-02' }, { window_end: '2026-09-30' }])).toBe('2026-10-02');
    expect(newestReadDay([])).toBeNull();
  });
});
