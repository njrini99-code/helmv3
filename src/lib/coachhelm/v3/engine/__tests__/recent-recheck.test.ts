/**
 * Recent-window recheck, ported from PR #2073
 * (`src/test/coachhelm/v3/recent-recheck.test.ts` on `agent/coachhelm-surfaces`)
 * with the modified rule (02-accuracy-standard §7; 04 Example 5):
 *   cleared  recent point at/past the benchmark AND recent L90 better than the old point
 *   holds    recent U90 still worse than the benchmark
 *   else     inconclusive; thin below the floor.
 * The PR's BaseGenerator.run() integration cases are not ported: the design
 * runs the recheck at checkpoints from the nightly lifecycle step, which is
 * covered in `lifecycle/__tests__/plan.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  isRecheckRetired,
  meanLowerBound,
  meanUpperBound,
  parScoringRecheck,
  puttBandRecheck,
  recheckOnBestWindow,
  recheckWindows,
  RECHECK_RESOLVED_BY,
  RECHECK_RETIRED_REASON,
  wilsonLowerBound,
  wilsonUpperBound,
  type RecentPutt,
} from '../recent-recheck';

const NOW = '2026-10-20T03:00:00.000Z';
const W15 = { window: 'newest_15_rounds' as const, rounds_n: 15 };

function putt(d: number | null, made: boolean, round = 'r'): RecentPutt {
  return { round_id: round, distance_to_hole_before: d, result: made ? 'hole' : 'green', putt_made: made };
}
function putts(n: number, made: number, d = 4, round = 'r'): RecentPutt[] {
  return Array.from({ length: n }, (_, i) => putt(d, i < made, round));
}

describe('bounds', () => {
  it('Wilson bounds bracket the point estimate and tighten with n', () => {
    expect(wilsonLowerBound(9, 10)).toBeLessThan(0.9);
    expect(wilsonUpperBound(9, 10)).toBeGreaterThan(0.9);
    expect(wilsonLowerBound(90, 100)).toBeGreaterThan(wilsonLowerBound(9, 10));
    expect(wilsonUpperBound(90, 100)).toBeLessThan(wilsonUpperBound(9, 10));
    expect(wilsonLowerBound(0, 0)).toBe(0);
    expect(wilsonUpperBound(0, 0)).toBe(1);
  });

  it('mean bounds bracket the mean; null under 2 values', () => {
    expect(meanUpperBound([4, 5, 4, 5])!).toBeGreaterThan(4.5);
    expect(meanLowerBound([4, 5, 4, 5])!).toBeLessThan(4.5);
    expect(meanUpperBound([4])).toBeNull();
    expect(meanLowerBound([4])).toBeNull();
  });
});

describe('puttBandRecheck (modified rule)', () => {
  it('uses the cache band rule (lo, hi]: 3 ft is out of the 3–5 band, 5 ft is in', () => {
    const r = puttBandRecheck([putt(3, true), putt(3, true), putt(5, false), putt(4, true)], { lo: 3, hi: 5 }, { benchmark: 90.5, oldValue: 80, oldN: 50 }, W15, NOW, 1);
    expect(r.recent_n).toBe(2);
    expect(r.recent_value).toBe(50);
  });

  it('counts putt_made=true as made without result=hole, and clamps distance to 120', () => {
    const ps: RecentPutt[] = [
      { round_id: 'r', distance_to_hole_before: 4, result: null, putt_made: true },
      { round_id: 'r', distance_to_hole_before: 400, result: 'green', putt_made: false },
    ];
    expect(puttBandRecheck(ps, { lo: 3, hi: 5 }, { benchmark: 90.5, oldValue: 80, oldN: 50 }, W15, NOW, 1).recent_value).toBe(100);
    expect(puttBandRecheck(ps, { lo: 25, hi: null }, { benchmark: 5.5, oldValue: 3, oldN: 50 }, W15, NOW, 1).recent_n).toBe(1);
  });

  it('04 Example 5: 22 of 29 (76%) against a 72% benchmark, was 62% of 95 → cleared', () => {
    const r = puttBandRecheck(putts(29, 22), { lo: 3, hi: 5 }, { benchmark: 72, oldValue: 62, oldN: 95 }, W15, NOW);
    expect(r.recent_value).toBe(75.9);
    expect(r.recent_lower_90!).toBeGreaterThan(62);
    expect(r.outcome).toBe('cleared');
    expect(r).toMatchObject({ window: 'newest_15_rounds', old_value: 62, old_n: 95, benchmark: 72, polarity: 'higher_better', min_n: 20 });
  });

  it('past the benchmark but not clearly better than the old point → inconclusive', () => {
    // 15/20 = 75% ≥ 72, but L90 ≈ 61% is not above the old 66%.
    const r = puttBandRecheck(putts(20, 15), { lo: 3, hi: 5 }, { benchmark: 72, oldValue: 66, oldN: 90 }, W15, NOW);
    expect(r.outcome).toBe('inconclusive');
  });

  it('holds only while the upper bound is still under the benchmark', () => {
    // The PR's 0c82eefb shape: 56/68 = 82.4% against 90.5 → U90 ≈ 87.6 < 90.5.
    const r = puttBandRecheck(putts(68, 56, 4.5), { lo: 3, hi: 5 }, { benchmark: 90.5, oldValue: 79.6, oldN: 98 }, W15, NOW);
    expect(r.recent_value).toBe(82.4);
    expect(r.recent_upper_90!).toBeLessThan(90.5);
    expect(r.outcome).toBe('holds');
    // Below the benchmark on the point but inside the margin → inconclusive, not holds.
    const close = puttBandRecheck(putts(20, 17), { lo: 3, hi: 5 }, { benchmark: 90.5, oldValue: 79.6, oldN: 98 }, W15, NOW);
    expect(close.outcome).toBe('inconclusive');
  });

  it('thin below 20 putts — even at 100%', () => {
    const r = puttBandRecheck(putts(19, 19, 30), { lo: 25, hi: null }, { benchmark: 5.5, oldValue: 2, oldN: 40 }, W15, NOW);
    expect(r.outcome).toBe('thin');
    expect(r.min_n).toBe(20);
  });
});

describe('parScoringRecheck (modified rule, lower is better)', () => {
  const hole = (round: string, par: number, score: number | null) => ({ round_id: round, par, score });
  const rounds = ['a', 'b', 'c', 'd', 'e'];

  it('averages only this par type and gates on distinct rounds', () => {
    const holes = [hole('a', 4, 4), hole('a', 3, 5), hole('b', 4, 5), hole('c', 4, null)];
    const r = parScoringRecheck(holes, 4, { benchmark: 4, oldValue: 4.6, oldN: 40 }, W15, NOW, 2);
    expect(r.recent_value).toBe(4.5);
    expect(r.recent_n).toBe(2);
    expect(r.polarity).toBe('lower_better');
  });

  it('cleared when the mean is at or under the benchmark and U90 is under the old point', () => {
    const under = rounds.flatMap((r) => [hole(r, 3, 2), hole(r, 3, 3), hole(r, 3, 3), hole(r, 3, 3)]);
    expect(parScoringRecheck(under, 3, { benchmark: 3, oldValue: 3.4, oldN: 60 }, W15, NOW).outcome).toBe('cleared');
  });

  it('holds when the lower bound is still over the benchmark; thin under the rounds floor', () => {
    const over = rounds.flatMap((r) => [hole(r, 4, 5), hole(r, 4, 5), hole(r, 4, 4), hole(r, 4, 5)]);
    expect(parScoringRecheck(over, 4, { benchmark: 4, oldValue: 4.6, oldN: 60 }, W15, NOW).outcome).toBe('holds');
    expect(parScoringRecheck(over.slice(0, 16), 4, { benchmark: 4, oldValue: 4.6, oldN: 60 }, W15, NOW).outcome).toBe('thin');
    // Mean 3.00 at the line, but U90 ≈ 3.21 is not under the old 3.10.
    const level = rounds.flatMap((r) => [hole(r, 3, 3), hole(r, 3, 3), hole(r, 3, 4), hole(r, 3, 2)]);
    expect(parScoringRecheck(level, 3, { benchmark: 3, oldValue: 3.1, oldN: 60 }, W15, NOW).outcome).toBe('inconclusive');
  });
});

describe('windows', () => {
  const rounds = Array.from({ length: 20 }, (_, i) => ({
    id: `r${i}`,
    // r0 newest, one round a week
    round_date: new Date(Date.UTC(2026, 9, 19) - i * 7 * 86400_000).toISOString().slice(0, 10),
  }));

  it('newest 15 rounds and the last 90 days', () => {
    const w = recheckWindows(rounds, NOW);
    expect(w.newest_15_rounds.size).toBe(15);
    expect(w.newest_15_rounds.has('r0')).toBe(true);
    expect(w.newest_15_rounds.has('r15')).toBe(false);
    // 90 days at one round a week: r0..r12.
    expect(w.last_90_days.size).toBe(13);
  });

  it('keeps the window with more attempts; ties keep the newest 15', () => {
    const w = { newest_15_rounds: new Set(['a', 'b']), last_90_days: new Set(['a', 'b', 'c']) };
    const ps = [...putts(10, 9, 4, 'a'), ...putts(10, 9, 4, 'b'), ...putts(10, 9, 4, 'c')];
    const r = recheckOnBestWindow(w, (win, ids) =>
      puttBandRecheck(ps.filter((p) => ids.has(p.round_id)), { lo: 3, hi: 5 }, { benchmark: 70, oldValue: 60, oldN: 50 }, win, NOW),
    );
    expect(r.window).toBe('last_90_days');
    expect(r.recent_n).toBe(30);
    const same = { newest_15_rounds: new Set(['a', 'b']), last_90_days: new Set(['a', 'b']) };
    expect(
      recheckOnBestWindow(same, (win, ids) =>
        puttBandRecheck(ps.filter((p) => ids.has(p.round_id)), { lo: 3, hi: 5 }, { benchmark: 70, oldValue: 60, oldN: 50 }, win, NOW),
      ).window,
    ).toBe('newest_15_rounds');
  });
});

describe('isRecheckRetired', () => {
  it('only an archived row carrying the recheck provenance', () => {
    const meta = { resolved_by: RECHECK_RESOLVED_BY, retired_reason: RECHECK_RETIRED_REASON };
    expect(isRecheckRetired('archived', meta)).toBe(true);
    expect(isRecheckRetired('detected', meta)).toBe(false);
    expect(isRecheckRetired('archived', { archived_by: 'generator-scope-sweep' })).toBe(false);
  });
});
