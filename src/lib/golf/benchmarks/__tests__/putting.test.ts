import { describe, it, expect } from 'vitest';
import {
  PUTTING_BENCHMARK_BANDS,
  PUTTING_BENCHMARK_MIN_SAMPLE,
  buildPuttingBenchmarkRows,
  puttingBenchmark,
  puttingTourForGender,
  type PuttingBandSample,
} from '@/lib/golf/benchmarks/putting';
import { cohortAnchor } from '@/lib/coachhelm/v3/counterfactual/cohort-baselines';

function sample(bucket_id: string, team_value: number | null, sample_n: number): PuttingBandSample {
  return { bucket_id, label: bucket_id, team_value, pga_value: null, sample_n };
}

describe('putting benchmarks (Tour only)', () => {
  it('pins the golf_pga_standards Tour values', () => {
    expect(puttingBenchmark('3_5', 'pga')).toMatchObject({ tour: 90.5 });
    expect(puttingBenchmark('25_plus', 'pga')).toMatchObject({ tour: 5.5 });
    expect(puttingBenchmark('5_10', 'lpga')).toMatchObject({ tour: 55.0 });
    expect(puttingBenchmark('15_25', 'lpga')).toMatchObject({ tour: 12.0 });
  });

  it('carries no college or division value on any band', () => {
    for (const tour of ['pga', 'lpga'] as const) {
      for (const def of PUTTING_BENCHMARK_BANDS) {
        const standard = puttingBenchmark(def.band, tour)!;
        expect(Object.keys(standard)).toEqual(['tour', 'sourceNote']);
        expect(standard.sourceNote).not.toMatch(/\bD[123]\b|division|college|NCAA|Shot Scope/i);
      }
    }
  });

  it('cites a source on every value', () => {
    for (const tour of ['pga', 'lpga'] as const) {
      for (const def of PUTTING_BENCHMARK_BANDS) {
        expect(puttingBenchmark(def.band, tour)?.sourceNote).toMatch(/golf_pga_standards/);
      }
    }
  });

  it('has no benchmark for bands without a standard', () => {
    expect(puttingBenchmark('0_3')).toBeNull();
    expect(puttingBenchmark('15_20')).toBeNull();
  });

  it("men's and women's Tour values match the cohort-baselines putt anchors", () => {
    for (const def of PUTTING_BENCHMARK_BANDS) {
      expect(puttingBenchmark(def.band, 'pga')?.tour).toBe(cohortAnchor(def.metricId, 'mens'));
      expect(puttingBenchmark(def.band, 'lpga')?.tour).toBe(cohortAnchor(def.metricId, 'womens'));
    }
  });

  it('routes women to LPGA and everyone else to PGA', () => {
    expect(puttingTourForGender('womens')).toBe('lpga');
    expect(puttingTourForGender('mens')).toBe('pga');
    expect(puttingTourForGender(null)).toBe('pga');
  });

  describe('buildPuttingBenchmarkRows', () => {
    it('drops the 0-3 ft band and keeps distance order', () => {
      const rows = buildPuttingBenchmarkRows([sample('0_3', 99, 40), sample('5_10', 50, 20)]);
      expect(rows.map((r) => r.band)).toEqual(['3_5', '5_10', '10_15', '15_25', '25_plus']);
    });

    it('grades only bands with enough putts, against the Tour alone', () => {
      const rows = buildPuttingBenchmarkRows([
        sample('3_5', 95, 30),
        sample('5_10', 55, 20),
        sample('10_15', 20, 12),
        sample('15_25', 40, PUTTING_BENCHMARK_MIN_SAMPLE - 1),
      ]);
      const byBand = Object.fromEntries(rows.map((r) => [r.band, r])) as Record<string, (typeof rows)[number]>;
      expect(byBand['3_5']).toMatchObject({ verdict: 'above_tour', gapToTour: 4.5 });
      expect(byBand['5_10']).toMatchObject({ verdict: 'below_tour', gapToTour: -7.2 });
      expect(byBand['10_15']).toMatchObject({ verdict: 'below_tour', gapToTour: -15.7 });
      expect(byBand['15_25']).toMatchObject({ verdict: 'small_sample', gapToTour: null });
      expect(byBand['25_plus']).toMatchObject({ verdict: 'no_putts', makePct: null, sampleN: 0, gapToTour: null });
    });

    it('treats a make rate exactly at the Tour value as at or above', () => {
      const [row] = buildPuttingBenchmarkRows([sample('3_5', 90.5, 30)]);
      expect(row).toMatchObject({ verdict: 'above_tour', gapToTour: 0 });
    });

    it('never emits a division field or verdict', () => {
      const rows = buildPuttingBenchmarkRows([sample('3_5', 80, 30), sample('5_10', 10, 30)]);
      for (const row of rows) {
        expect(Object.keys(row)).not.toContain('div1');
        expect(Object.keys(row)).not.toContain('gapToDiv1');
        expect(row.verdict).not.toMatch(/div1|between/);
      }
    });

    it('prefers the live reference over the mirrored constant', () => {
      const [row] = buildPuttingBenchmarkRows([{ ...sample('3_5', 80, 20), pga_value: 91 }]);
      expect(row).toMatchObject({ tour: 91, gapToTour: -11, verdict: 'below_tour' });
    });

    it('uses LPGA standards for women', () => {
      const rows = buildPuttingBenchmarkRows([], 'lpga');
      expect(rows[0]).toMatchObject({ tour: 86.0 });
    });
  });
});

describe('audit rows 9/32 — a withheld leak-map band reads small sample, not no putts', () => {
  it('sample_n > 0 with a withheld (null) make % is small_sample', () => {
    const rows = buildPuttingBenchmarkRows([
      { bucket_id: '10_15', label: '10-15 ft', team_value: null, pga_value: null, sample_n: 4 },
    ]);
    const row = rows.find((r) => r.band === '10_15')!;
    expect(row.verdict).toBe('small_sample');
    expect(row.sampleN).toBe(4);
    expect(row.makePct).toBeNull();
  });
});
