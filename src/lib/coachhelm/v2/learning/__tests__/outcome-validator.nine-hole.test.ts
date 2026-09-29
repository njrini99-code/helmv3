import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));

import { extractMetricValue } from '../outcome-validator';

const base = {
  total_putts: 30,
  total_fairways_hit: 7,
  total_fairways: 14,
  total_gir: 9,
  total_gir_possible: 18,
  created_at: null,
};

describe('extractMetricValue — score_to_par is graded on the 18-hole basis', () => {
  it('scales a 9-hole round to 18 holes, matching how the forecast is made', () => {
    // The predictor forecasts an 18-hole score_to_par. A +2 nine used to be
    // graded raw against it, so a 9-hole round always looked like a great day.
    expect(extractMetricValue('score_to_par', { ...base, score_to_par: 2, holes_played: 9 })).toBe(4);
  });

  it('leaves an 18-hole round unchanged', () => {
    expect(extractMetricValue('score_to_par', { ...base, score_to_par: 5, holes_played: 18 })).toBe(5);
    expect(extractMetricValue('scoreToPar', { ...base, score_to_par: 5, holes_played: null })).toBe(5);
  });
});
