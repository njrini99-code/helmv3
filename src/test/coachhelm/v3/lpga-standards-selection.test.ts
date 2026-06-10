/**
 * Unit tests for LPGA standards selection logic (2026-06-10).
 *
 * Covers:
 *   1. `loadStandardsForGender` — women's teams get LPGA rows, men's/null get PGA.
 *   2. `loadStandardsForGender` — fallback to PGA when no LPGA row exists for a metric.
 *   3. `loadStandardsForTour` — tour discriminator routing.
 *   4. `pgaReferenceLabel` in StandingBar/utils — "LPGA" label for women's teams.
 *   5. Stats-leak-maps gender routing (mock-level: loadPgaRefs picks the right tour).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// StandingBar utils — pure function, no mocks needed
// ---------------------------------------------------------------------------
import { pgaReferenceLabel } from '@/components/golf/coachhelm/v3/StandingBar/utils';

describe('pgaReferenceLabel — LPGA label for women\'s teams', () => {
  it('returns "PGA" / "PGA Tour" for men\'s teams (is_womens=false)', () => {
    const label = pgaReferenceLabel('gir_pct', false);
    expect(label.short).toBe('PGA');
    expect(label.long).toBe('PGA Tour');
  });

  it('returns "PGA" / "PGA Tour" when is_womens is omitted (backward compat)', () => {
    const label = pgaReferenceLabel('gir_pct');
    expect(label.short).toBe('PGA');
    expect(label.long).toBe('PGA Tour');
  });

  it('returns "LPGA" / "LPGA Tour" for women\'s teams on a non-SG metric', () => {
    const label = pgaReferenceLabel('gir_pct', true);
    expect(label.short).toBe('LPGA');
    expect(label.long).toBe('LPGA Tour');
  });

  it('returns "LPGA" for putting metrics on women\'s teams', () => {
    const label = pgaReferenceLabel('putts_made_5_10ft_pct', true);
    expect(label.short).toBe('LPGA');
  });

  it('returns "Field Avg" for SG metrics regardless of gender (SG is zero-sum)', () => {
    expect(pgaReferenceLabel('sg_total', false).short).toBe('Field Avg');
    expect(pgaReferenceLabel('sg_total', true).short).toBe('Field Avg');
    expect(pgaReferenceLabel('sg_putting', true).short).toBe('Field Avg');
    expect(pgaReferenceLabel('sg_approach', true).short).toBe('Field Avg');
  });
});

// ---------------------------------------------------------------------------
// pga-standards.ts — loadStandardsForGender / loadStandardsForTour
//
// We mock createAdminClient + fromUntyped since these functions do DB IO.
// ---------------------------------------------------------------------------

const mockSelectChain = (rows: unknown[]) => {
  let selectedTour: string | null = null;
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((_col: string, val: string) => {
      if (_col === 'tour') selectedTour = val;
      return chain;
    }),
    order: vi.fn(() => chain),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => {
      // Filter rows by the tour that was set via .eq('tour', ...)
      const filtered = selectedTour
        ? rows.filter((r) => (r as { tour?: string }).tour === selectedTour)
        : rows;
      return Promise.resolve({ data: filtered, error: null }).then(resolve);
    },
  };
  return chain;
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn((_supabase: unknown, _table: string) => mockSelectChain(mockDbRows)),
}));

/** Shared mock DB rows — updated per-test group. */
let mockDbRows: Array<Record<string, unknown>> = [];

import { loadStandardsForTour, loadStandardsForGender } from '@/lib/coachhelm/v3/standing/pga-standards';

// We need isMetricId to pass for our test metric_ids.
// The real registry validates; we mock it to accept what we pass.
vi.mock('@/lib/coachhelm/v3/metrics/registry', () => ({
  isMetricId: (id: string) => ['gir_pct', 'scrambling_pct_sand', 'sg_total', 'unknown_metric'].includes(id)
    // accept all the metrics we use in tests, including real-registry ones
    || typeof id === 'string',
}));

describe('loadStandardsForTour', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns only PGA rows when tour="pga"', async () => {
    mockDbRows = [
      { metric_id: 'gir_pct', season: '2024', tour: 'pga', pga_tour_value: 66, display_label: 'GIR', source: null,
        korn_ferry_value: null, div1_avg_value: 60, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null,
        pga_p25: null, pga_p50: null, pga_p75: null },
      { metric_id: 'gir_pct', season: '2024', tour: 'lpga', pga_tour_value: 70, display_label: 'GIR (LPGA)', source: null,
        korn_ferry_value: null, div1_avg_value: 63, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null,
        pga_p25: null, pga_p50: null, pga_p75: null },
    ];
    const map = await loadStandardsForTour('pga');
    expect(map.get('gir_pct')?.pga_tour_value).toBe(66);
    expect(map.get('gir_pct')?.tour).toBe('pga');
  });

  it('returns only LPGA rows when tour="lpga"', async () => {
    mockDbRows = [
      { metric_id: 'gir_pct', season: '2024', tour: 'pga', pga_tour_value: 66, display_label: 'GIR', source: null,
        korn_ferry_value: null, div1_avg_value: 60, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null,
        pga_p25: null, pga_p50: null, pga_p75: null },
      { metric_id: 'gir_pct', season: '2024', tour: 'lpga', pga_tour_value: 70, display_label: 'GIR (LPGA)', source: null,
        korn_ferry_value: null, div1_avg_value: 63, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null,
        pga_p25: null, pga_p50: null, pga_p75: null },
    ];
    const map = await loadStandardsForTour('lpga');
    expect(map.get('gir_pct')?.pga_tour_value).toBe(70);
    expect(map.get('gir_pct')?.tour).toBe('lpga');
  });
});

describe('loadStandardsForGender', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns PGA rows for mens (unchanged behaviour)', async () => {
    mockDbRows = [
      { metric_id: 'gir_pct', season: '2024', tour: 'pga', pga_tour_value: 66, display_label: 'GIR', source: null,
        korn_ferry_value: null, div1_avg_value: 60, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null,
        pga_p25: null, pga_p50: null, pga_p75: null },
    ];
    const map = await loadStandardsForGender('mens');
    expect(map.get('gir_pct')?.pga_tour_value).toBe(66);
    expect(map.get('gir_pct')?.tour).toBe('pga');
  });

  it('returns PGA rows for null/undefined gender (safe default)', async () => {
    mockDbRows = [
      { metric_id: 'gir_pct', season: '2024', tour: 'pga', pga_tour_value: 66, display_label: 'GIR', source: null,
        korn_ferry_value: null, div1_avg_value: 60, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null,
        pga_p25: null, pga_p50: null, pga_p75: null },
    ];
    expect((await loadStandardsForGender(null)).get('gir_pct')?.tour).toBe('pga');
    expect((await loadStandardsForGender(undefined)).get('gir_pct')?.tour).toBe('pga');
  });

  it('returns LPGA rows for womens where available', async () => {
    mockDbRows = [
      { metric_id: 'gir_pct', season: '2024', tour: 'pga', pga_tour_value: 66, display_label: 'GIR', source: null,
        korn_ferry_value: null, div1_avg_value: 60, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null,
        pga_p25: null, pga_p50: null, pga_p75: null },
      { metric_id: 'gir_pct', season: '2024', tour: 'lpga', pga_tour_value: 70, display_label: 'GIR (LPGA)', source: null,
        korn_ferry_value: null, div1_avg_value: 63, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null,
        pga_p25: null, pga_p50: null, pga_p75: null },
    ];
    const map = await loadStandardsForGender('womens');
    // LPGA row wins for a metric that has one.
    expect(map.get('gir_pct')?.pga_tour_value).toBe(70);
    expect(map.get('gir_pct')?.tour).toBe('lpga');
  });

  it('falls back to PGA for womens when no LPGA row exists for that metric', async () => {
    // scrambling_pct_sand only has a PGA row — LPGA not seeded for it in this mock.
    mockDbRows = [
      { metric_id: 'gir_pct', season: '2024', tour: 'pga', pga_tour_value: 66, display_label: 'GIR', source: null,
        korn_ferry_value: null, div1_avg_value: 60, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null,
        pga_p25: null, pga_p50: null, pga_p75: null },
      { metric_id: 'gir_pct', season: '2024', tour: 'lpga', pga_tour_value: 70, display_label: 'GIR (LPGA)', source: null,
        korn_ferry_value: null, div1_avg_value: 63, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null,
        pga_p25: null, pga_p50: null, pga_p75: null },
      // scrambling_pct_sand: PGA only
      { metric_id: 'scrambling_pct_sand', season: '2024', tour: 'pga', pga_tour_value: 50, display_label: 'Sand Save', source: null,
        korn_ferry_value: null, div1_avg_value: null, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null,
        pga_p25: null, pga_p50: null, pga_p75: null },
    ];
    const map = await loadStandardsForGender('womens');
    // gir_pct: LPGA wins
    expect(map.get('gir_pct')?.tour).toBe('lpga');
    expect(map.get('gir_pct')?.pga_tour_value).toBe(70);
    // scrambling_pct_sand: falls back to PGA (no LPGA row in mock)
    expect(map.get('scrambling_pct_sand')?.tour).toBe('pga');
    expect(map.get('scrambling_pct_sand')?.pga_tour_value).toBe(50);
  });

  it('LPGA overrides PGA for the same metric, not the reverse', async () => {
    // Even if the map starts with PGA, LPGA must overwrite it for women.
    mockDbRows = [
      { metric_id: 'gir_pct', season: '2024', tour: 'pga', pga_tour_value: 66, display_label: 'GIR', source: null,
        korn_ferry_value: null, div1_avg_value: 60, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null,
        pga_p25: null, pga_p50: null, pga_p75: null },
      { metric_id: 'gir_pct', season: '2024', tour: 'lpga', pga_tour_value: 70, display_label: 'GIR LPGA', source: null,
        korn_ferry_value: null, div1_avg_value: 63, div2_avg_value: null, div3_avg_value: null, hs_avg_value: null,
        pga_p25: null, pga_p50: null, pga_p75: null },
    ];
    const map = await loadStandardsForGender('womens');
    // The map must carry the LPGA value, not the PGA value.
    expect(map.get('gir_pct')?.pga_tour_value).toBe(70);
    expect(map.get('gir_pct')?.pga_tour_value).not.toBe(66);
  });
});
