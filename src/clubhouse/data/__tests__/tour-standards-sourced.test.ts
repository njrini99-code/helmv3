import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * SC-08: a figure is graded against the Tour only when its golf_pga_standards row names the page its value comes from
 * (`source_url`, migration 20261115223000). An unsourced row leaves the figure on screen without a grade. Before the
 * migration is applied the rows have no `source_url` key, and every row grades as it did. Stats, Home and CoachHelm all
 * read the Tour through `readTourStandards`, so the rule holds on each.
 */

vi.mock('server-only', () => ({}));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));
vi.mock('@/lib/coachhelm/v2/gate', () => ({
  isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: true, disabledBy: null, disabledReason: null })),
  isCoachHelmEnabledForPlayer: vi.fn(async () => ({ effectivelyEnabled: true, disabledBy: null, disabledReason: null })),
}));
vi.mock('@/app/golf/actions/insight-delivery', () => ({ getInsightsForCoach: vi.fn(), getInsightsForPlayer: vi.fn(), getTopInsightsForPlayers: vi.fn(), getThemesForCoach: vi.fn(), getThemesForPlayer: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/genome/loader', () => ({ loadGenome: vi.fn(async () => null) }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachProgramPulse: vi.fn(), getCoachChatContext: async () => ({ roster: [] }) }));

import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../../lib/track-server';
import { bandPutts, gradesAgainstTour, readTourBenchmarks, readTourStandards } from '../stats-common';
import { tourBaselineOf } from '../coachhelm';

type Filters = Array<[string, unknown[]]>;
const seen: Filters[] = [];

const SOURCED = { source_url: 'https://www.pgatour.com/stats/detail/02428', as_of: '2026-11-15' };
const rows = [
  { metric_id: 'gir_pct', pga_tour_value: 66, ...SOURCED },
  { metric_id: 'scoring_par_4', pga_tour_value: 3.97, source_url: null, as_of: null },
  { metric_id: 'putts_made_3_5ft_pct', pga_tour_value: 90.5, source_url: null, as_of: null },
  { metric_id: 'putts_made_25_plus_ft_pct', pga_tour_value: '5.5', ...SOURCED },
  // Not a page: the column's CHECK refuses it, and the read does not trust it either.
  { metric_id: 'scrambling_pct_sand', pga_tour_value: 50, source_url: 'Research doc §2', as_of: null },
];

beforeEach(() => {
  seen.length = 0;
  vi.mocked(chLogServer).mockClear();
  tables.current = {
    golf_pga_standards: (f) => {
      seen.push(f);
      return { data: rows };
    },
  };
});

describe('which standards rows may grade (SC-08)', () => {
  it('a row grades only with an https source; null is unsourced; a row read before the column existed grades as before', () => {
    expect(gradesAgainstTour({ source_url: 'https://www.lpga.com/stats' })).toBe(true);
    expect(gradesAgainstTour({ source_url: null })).toBe(false);
    expect(gradesAgainstTour({ source_url: '' })).toBe(false);
    expect(gradesAgainstTour({ source_url: 'Research doc §2' })).toBe(false);
    expect(gradesAgainstTour({})).toBe(true);
  });

  it('the shared read keeps the sourced rows only, for the team\'s own tour, without naming a column that may not exist', async () => {
    const supabase = await createClient();
    const { values, error } = await readTourStandards(supabase, 'pga', 'stats');
    expect(error).toBe(false);
    expect([...values]).toEqual([
      ['gir_pct', 66],
      ['putts_made_25_plus_ft_pct', 5.5],
    ]);
    expect(seen[0]).toContainEqual(['select', ['*']]);
    expect(seen[0]).toContainEqual(['eq', ['tour', 'pga']]);
  });

  it('before the migration (no source_url key on any row) every row with a value grades, as it did', async () => {
    tables.current = { golf_pga_standards: { data: rows.map(({ metric_id, pga_tour_value }) => ({ metric_id, pga_tour_value })) } };
    const { bench } = await readTourBenchmarks(await createClient(), 'pga', 'stats');
    expect(bench.size).toBe(rows.length);
    expect(bench.get('scoring_par_4')).toBe(3.97);
  });

  it('a failed read is told apart from a tour with no sourced rows, and logged', async () => {
    tables.current = { golf_pga_standards: { error: { code: '57014', message: 'timeout' } } };
    const { values, error } = await readTourStandards(await createClient(), 'lpga', 'home');
    expect(error).toBe(true);
    expect(values.size).toBe(0);
    expect(chLogServer).toHaveBeenCalledWith('home', 'tourBenchmarks', expect.anything());
  });

  it('Stats: a putting band whose row is unsourced shows its make rate without a Tour mark', async () => {
    const { bench } = await readTourBenchmarks(await createClient(), 'pga', 'stats');
    const put = (feet: number, made: boolean) => ({ roundId: 'r1', feet, made });
    const bands = bandPutts([put(4, true), put(5, false), put(30, true)], bench);
    expect(bands.find((b) => b.label === '3–5 ft')).toMatchObject({ attempts: 2, made: 1, bench: null });
    expect(bands.find((b) => b.label === '25+ ft')).toMatchObject({ attempts: 1, made: 1, bench: 5.5 });
  });

  it('CoachHelm reads the same rule: an unsourced Tour value is no benchmark on the board', async () => {
    const { baseline, error } = await tourBaselineOf(await createClient(), { gender: 'mens' });
    expect(error).toBe(false);
    expect(baseline?.tour).toBe('pga');
    expect(baseline?.values.get('gir_pct')).toBe(66);
    expect(baseline?.values.has('scoring_par_4')).toBe(false);
    expect(baseline?.values.has('scrambling_pct_sand')).toBe(false);
  });
});
