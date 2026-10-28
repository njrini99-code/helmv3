import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerEvent: vi.fn(), logServerError: vi.fn() }));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/lib/golf/player-profiles', () => ({ readGolfPlayerProfiles: async () => ({ data: [], error: null }) }));

import { holeStats, poolRoundPar } from '../tournaments';
import { eventRoundPar } from '../tournaments-shape';
import { tourFixture } from '../../preview/fixtures-tournaments';
import { metric } from '../../screens/tournaments/metrics';
import { toMetricRound } from '../../screens/tournaments/compare/model';
import { summarize } from '../../screens/tournaments/compare/scope';

const hole = (par: number, score: number | null, extra: { putts?: number | null; gir?: boolean | null } = {}) => ({
  round_id: 'r1',
  par,
  score,
  putts: extra.putts === undefined ? 2 : extra.putts,
  gir: extra.gir === undefined ? true : extra.gir,
  fairway_hit: null,
  penalty_strokes: 0,
});
const noTotals = { total_putts: null, total_penalties: null };

describe('the comparison pool’s hole counts', () => {
  it('counts GIR only on holes that were marked: an unmarked hole is not a miss', () => {
    const s = holeStats([hole(4, 4, { gir: true }), hole(4, 5, { gir: false }), hole(4, 4, { gir: null }), hole(3, 3, { gir: null })], noTotals);
    expect(s.gir).toBe(1);
    expect(s.girOf).toBe(2);
    expect(s.scrOf).toBe(1);
  });

  it('gives no putt total when a scored hole has no putt count, instead of counting it as zero', () => {
    expect(holeStats([hole(4, 4, { putts: 2 }), hole(4, 5, { putts: null })], { total_putts: 31, total_penalties: null }).putts).toBeNull();
    expect(holeStats([hole(4, 4, { putts: 2 }), hole(4, 5, { putts: 1 })], noTotals).putts).toBe(3);
    expect(holeStats([], { total_putts: 31, total_penalties: null }).putts).toBe(31);
    expect(holeStats([], noTotals).putts).toBeNull();
  });
});

describe('a nine-hole event round’s par', () => {
  it('plays half of the eighteen-hole par stored on the tee or course', () => {
    expect(eventRoundPar(72, 9)).toBe(36);
    expect(eventRoundPar(71, 9)).toBe(36);
    expect(eventRoundPar(72, 18)).toBe(72);
  });

  it('keeps a par that is already a nine’s, and nothing when none is known', () => {
    expect(eventRoundPar(36, 9)).toBe(36);
    expect(eventRoundPar(null, 9)).toBeNull();
  });
});

describe('a pool round’s par', () => {
  it('sums the holes’ own pars when the card is full, so an uneven nine is exact', () => {
    const nine = [4, 4, 3, 5, 4, 4, 3, 4, 4].map((par) => ({ par }));
    expect(poolRoundPar(nine, 9, 71, null)).toBe(35);
    expect(poolRoundPar(nine.slice(0, 8), 9, 71, null)).toBe(36);
    expect(poolRoundPar([], 18, null, 70)).toBe(70);
    expect(poolRoundPar([], 9, null, null)).toBe(36);
  });
});

describe('WD and DQ event rounds in a comparison', () => {
  const data = tourFixture('ready').compare!;
  const [first, second] = data.rounds.filter((r) => r.eventId && !r.individual);
  const marked = [{ ...first!, status: 'wd' as const }, { ...second!, status: 'dq' as const }];

  it('are listed out of every figure, with the reason', () => {
    expect(first && second).toBeTruthy();
    const rounds = marked.map((r) => toMetricRound(r, data.events));
    for (const key of ['score_avg', 'gir', 'putts', 'count_rate'] as const) {
      const m = metric(key, rounds, { subject: 'player' });
      expect(m.n, key).toBe(0);
      expect(m.excluded.map((x) => x.reason).sort(), key).toEqual(['dq', 'wd']);
    }
  });

  it('are not counted in the sample the scope says it holds', () => {
    const plain = summarize([first!, second!]);
    expect(plain.n).toBe(2);
    expect(summarize(marked).n).toBe(0);
    expect(summarize([marked[0]!, second!]).n).toBe(1);
  });
});

describe('a round’s GIR through the comparison', () => {
  it('carries the marked-hole count to the metric, so the rate is over holes marked', () => {
    const data = tourFixture('ready').compare!;
    const r = data.rounds.find((x) => x.stats != null && !x.totalOnly)!;
    const m = toMetricRound({ ...r, stats: { ...r.stats, gir: 3, girOf: 6 } }, data.events);
    expect(m.cache).toMatchObject({ gir: 3, girOf: 6 });
  });
});
