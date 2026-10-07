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
  return { bucket_id, label: bucket_id, team_value, pga_value: null, div1_value: null, sample_n };
}

describe('putting benchmarks', () => {
  it('pins the golf_pga_standards values', () => {
    expect(puttingBenchmark('3_5', 'pga')).toMatchObject({ tour: 90.5, div1: 88.0 });
    expect(puttingBenchmark('25_plus', 'pga')).toMatchObject({ tour: 5.5, div1: 4.0 });
    expect(puttingBenchmark('5_10', 'lpga')).toMatchObject({ tour: 55.0, div1: 44.0 });
    expect(puttingBenchmark('15_25', 'lpga')).toMatchObject({ tour: 12.0, div1: 9.0 });
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

  it("men's Tour values match the cohort-baselines putt anchors", () => {
    for (const def of PUTTING_BENCHMARK_BANDS) {
      expect(puttingBenchmark(def.band, 'pga')?.tour).toBe(cohortAnchor(def.metricId, 'mens'));
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

    it('grades only bands with enough putts', () => {
      const rows = buildPuttingBenchmarkRows([
        sample('3_5', 95, 30),
        sample('5_10', 55, 20),
        sample('10_15', 20, 12),
        sample('15_25', 40, PUTTING_BENCHMARK_MIN_SAMPLE - 1),
      ]);
      const byBand = Object.fromEntries(rows.map((r) => [r.band, r])) as Record<string, (typeof rows)[number]>;
      expect(byBand['3_5']!.verdict).toBe('above_tour');
      expect(byBand['5_10']!.verdict).toBe('between');
      expect(byBand['5_10']!.gapToDiv1).toBe(5);
      expect(byBand['10_15']!.verdict).toBe('below_div1');
      expect(byBand['15_25']!.verdict).toBe('small_sample');
      expect(byBand['15_25']!.gapToDiv1).toBeNull();
      expect(byBand['25_plus']).toMatchObject({ verdict: 'no_putts', makePct: null, sampleN: 0 });
    });

    it('prefers the live reference over the mirrored constant', () => {
      const [row] = buildPuttingBenchmarkRows([
        { ...sample('3_5', 80, 20), pga_value: 91, div1_value: 85 },
      ]);
      expect(row).toMatchObject({ tour: 91, div1: 85, gapToDiv1: -5, verdict: 'below_div1' });
    });

    it('uses LPGA standards for women', () => {
      const rows = buildPuttingBenchmarkRows([], 'lpga');
      expect(rows[0]).toMatchObject({ tour: 86.0, div1: 80.0 });
    });
  });
});
