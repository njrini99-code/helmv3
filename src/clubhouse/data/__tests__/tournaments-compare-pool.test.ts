import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerEvent: vi.fn(), logServerError: vi.fn() }));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/lib/golf/player-profiles', () => ({ readGolfPlayerProfiles: async () => ({ data: [], error: null }) }));

import { holeStats } from '../tournaments';
import { eventRoundPar } from '../tournaments-shape';
import { tourFixture } from '../../preview/fixtures-tournaments';
import { metric } from '../../screens/tournaments/metrics';
import { toMetricRound } from '../../screens/tournaments/compare/model';

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

describe('WD and DQ event rounds in a comparison', () => {
  it('are listed out of every figure, with the reason', () => {
    const data = tourFixture('ready').compare!;
    const [first, second] = data.rounds.filter((r) => r.eventId && !r.individual);
    expect(first && second).toBeTruthy();
    const rounds = [toMetricRound({ ...first!, status: 'wd' }, data.events), toMetricRound({ ...second!, status: 'dq' }, data.events)];
    const score = metric('score_avg', rounds, { subject: 'player' });
    expect(score.n).toBe(0);
    expect(score.excluded.map((x) => x.reason).sort()).toEqual(['dq', 'wd']);
  });
});
