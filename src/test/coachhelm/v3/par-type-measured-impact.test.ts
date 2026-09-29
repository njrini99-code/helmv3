/**
 * ParTypeGenerator measured strokes impact (audit defect 1 / row 13).
 *
 * par_scoring wrote strokes_impact 0 on 141 of 141 rows, including 29 whose
 * counterfactual was unsuppressed. The row is floor-exempt, so the base keeps
 * whatever the generator composes: the measured gap-to-cohort impact must be
 * composed here, sized by the player's OWN holes of that par per round.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const cacheRow = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: cacheRow }) }) }),
  }),
}));
const holes = vi.fn();
vi.mock('@/lib/coachhelm/v3/engine/hole-diagnosis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/engine/hole-diagnosis')>();
  return { ...actual, loadCompletedHoles: (...a: unknown[]) => holes(...a) };
});
const standing = vi.fn();
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({
  loadStandingForMetric: (...a: unknown[]) => standing(...a),
}));
vi.mock('@/lib/coachhelm/v3/counterfactual/player-cohort-loader', () => ({
  loadPlayerCohort: vi.fn().mockResolvedValue({ gender: 'mens', level: null }),
}));

import { ParTypeGenerator } from '@/lib/coachhelm/v3/generators/par-type';

/** `rounds` rounds of an 18-hole card with `par4s` par-4s each, all scored `score`. */
function card(rounds: number, par4s: number, score: number) {
  const out: Array<{ round_id: string; hole_number: number; par: number; score: number }> = [];
  for (let r = 0; r < rounds; r++) {
    for (let h = 1; h <= 18; h++) {
      const par = h <= par4s ? 4 : h % 2 === 0 ? 3 : 5;
      out.push({ round_id: `r${r}`, hole_number: h, par, score: par === 4 ? score : par });
    }
  }
  return out;
}

describe('ParTypeGenerator — measured strokes impact', () => {
  beforeEach(() => {
    cacheRow.mockResolvedValue({
      data: {
        player_id: 'p', rounds_played: 12, first_round_date: '2026-03-01',
        last_round_date: '2026-09-01', par4_average: 4.5,
      },
      error: null,
    });
  });

  it('(avg − cohort) × the player\'s own par-4s per round', async () => {
    holes.mockResolvedValue(card(12, 12, 5)); // 12 par-4s per round
    standing.mockResolvedValue({ pga_value: 4.0, level_avg: 4.4 });
    const g = new ParTypeGenerator('p', 4);
    const agg = await g.aggregate();
    expect(agg?.holes_per_round).toBe(12);
    // (4.5 − 4.4 cohort) × 12 = 1.2, under the par-4 ceiling of 1.5.
    expect(agg?.strokes_impact).toBeCloseTo(1.2, 6);
    const c = g.composeContent(agg!);
    expect(c.evidence.strokes_impact).toBeCloseTo(1.2, 6);
    expect(c.evidence.window_start).toBe('2026-03-01');
  });

  it('is 0 when the player is at or better than the cohort', async () => {
    holes.mockResolvedValue(card(12, 10, 4));
    standing.mockResolvedValue({ pga_value: 4.0, level_avg: 4.6 });
    const agg = await new ParTypeGenerator('p', 4).aggregate();
    expect(agg?.strokes_impact).toBe(0);
  });

  it('is 0 without a standing row (no target to measure against)', async () => {
    holes.mockResolvedValue(card(12, 10, 5));
    standing.mockResolvedValue(null);
    const agg = await new ParTypeGenerator('p', 4).aggregate();
    expect(agg?.strokes_impact).toBe(0);
  });
});
