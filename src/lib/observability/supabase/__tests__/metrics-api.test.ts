import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  __resetPlatformMetricsCacheForTests,
  buildPlatformHealthModel,
  computeCpuPct,
  computeMemoryPct,
  computePoolReading,
  fetchSupabasePlatformMetrics,
  parsePrometheusText,
  type CpuDeltaInput,
} from '../metrics-api';

describe('parsePrometheusText', () => {
  it('returns null for a body with no sample lines (e.g. an HTML error page)', () => {
    expect(parsePrometheusText('<!DOCTYPE html><title>522</title>')).toBeNull();
  });

  it('returns null for an empty body', () => {
    expect(parsePrometheusText('')).toBeNull();
  });

  it('parses a gauge with no labels', () => {
    const samples = parsePrometheusText('pg_up 1\n');
    expect(samples).toEqual([{ name: 'pg_up', labels: {}, value: 1 }]);
  });

  it('parses labeled series and multiple lines, skipping HELP/TYPE/comments', () => {
    const text = [
      '# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.',
      '# TYPE node_cpu_seconds_total counter',
      'node_cpu_seconds_total{cpu="0",mode="idle"} 1234.5',
      'node_cpu_seconds_total{cpu="0",mode="user"} 45.6',
      '',
      'pg_database_size_bytes 953068691',
    ].join('\n');
    const samples = parsePrometheusText(text);
    expect(samples).toHaveLength(3);
    expect(samples).toContainEqual({
      name: 'node_cpu_seconds_total',
      labels: { cpu: '0', mode: 'idle' },
      value: 1234.5,
    });
    expect(samples).toContainEqual({ name: 'pg_database_size_bytes', labels: {}, value: 953068691 });
  });

  it('skips a line with a non-numeric value instead of throwing', () => {
    const samples = parsePrometheusText('pg_up NaN\nreal_metric 1\n');
    expect(samples).toEqual([{ name: 'real_metric', labels: {}, value: 1 }]);
  });

  it('skips a line that does not match the sample grammar without throwing on the whole body', () => {
    const samples = parsePrometheusText('this is not prometheus at all\npg_up 1\n');
    expect(samples).toEqual([{ name: 'pg_up', labels: {}, value: 1 }]);
  });
});

describe('computeCpuPct', () => {
  const t0: CpuDeltaInput = { busySecondsCumulative: 100, sampledAtMs: 0 };

  it('returns null with no prior sample (first scrape / cold start)', () => {
    expect(computeCpuPct(t0, null)).toBeNull();
  });

  it('computes a rate from two scrapes 60s apart', () => {
    const t1: CpuDeltaInput = { busySecondsCumulative: 130, sampledAtMs: 60_000 };
    // 30 busy-seconds over 60 wall-seconds = 50%
    expect(computeCpuPct(t1, t0)).toBeCloseTo(50, 5);
  });

  it('clamps to 100 when the busy delta exceeds the wall-clock interval (unverified multi-series sum)', () => {
    const t1: CpuDeltaInput = { busySecondsCumulative: 400, sampledAtMs: 60_000 };
    expect(computeCpuPct(t1, t0)).toBe(100);
  });

  it('returns null for a non-positive interval', () => {
    const same: CpuDeltaInput = { busySecondsCumulative: 130, sampledAtMs: 0 };
    expect(computeCpuPct(same, t0)).toBeNull();
    const backwards: CpuDeltaInput = { busySecondsCumulative: 130, sampledAtMs: -1 };
    expect(computeCpuPct(backwards, t0)).toBeNull();
  });

  it('returns null on a counter reset (busy seconds went down) rather than a negative percentage', () => {
    const t1: CpuDeltaInput = { busySecondsCumulative: 10, sampledAtMs: 60_000 };
    expect(computeCpuPct(t1, t0)).toBeNull();
  });
});

describe('computeMemoryPct', () => {
  it('computes 1 - available/total as a percentage', () => {
    expect(computeMemoryPct(1000, 250)).toBeCloseTo(75, 5);
  });

  it('returns null when either input is null', () => {
    expect(computeMemoryPct(null, 250)).toBeNull();
    expect(computeMemoryPct(1000, null)).toBeNull();
  });

  it('returns null for a non-positive total (never divide by zero)', () => {
    expect(computeMemoryPct(0, 0)).toBeNull();
  });

  it('rejects a negative available-bytes reading as invalid input, never a clamped guess', () => {
    expect(computeMemoryPct(1000, -50)).toBeNull();
  });

  it('clamps to 0 when available exceeds total (a malformed scrape, not -400%)', () => {
    expect(computeMemoryPct(1000, 5000)).toBe(0);
  });
});

describe('computePoolReading', () => {
  it('computes saturation percent when both used and max are known', () => {
    expect(computePoolReading(8, 10)).toEqual({ used: 8, max: 10, saturationPct: 80 });
  });

  it('returns a null saturation when either input is missing', () => {
    expect(computePoolReading(null, 10).saturationPct).toBeNull();
    expect(computePoolReading(8, null).saturationPct).toBeNull();
  });

  it('returns a null saturation for a zero max (never divide by zero)', () => {
    expect(computePoolReading(0, 0).saturationPct).toBeNull();
  });
});

describe('buildPlatformHealthModel', () => {
  it('nulls out every derived field when the allow-listed samples are empty', () => {
    const { model } = buildPlatformHealthModel([], '2026-09-03T12:00:00.000Z', 0, null);
    expect(model.dbUp).toBeNull();
    expect(model.cpuPct).toBeNull();
    expect(model.memoryPct).toBeNull();
    expect(model.dbSizeBytes).toBeNull();
    expect(model.ioPressure).toBeNull();
    expect(model.autovacuumOrBloatSignal).toBeNull();
    expect(model.authPool).toEqual({ used: null, max: null, saturationPct: null });
    expect(model.sourceStatus).toBe('ok');
  });

  it('reads dbUp as a strict 0|1, never coercing a stray value', () => {
    const { model } = buildPlatformHealthModel(
      [{ name: 'pg_up', labels: {}, value: 2 }],
      '2026-09-03T12:00:00.000Z',
      0,
      null,
    );
    expect(model.dbUp).toBeNull();
  });

  it('maps pg_up = 0 through as dbUp: 0, not null and not false-as-healthy', () => {
    const { model } = buildPlatformHealthModel(
      [{ name: 'pg_up', labels: {}, value: 0 }],
      '2026-09-03T12:00:00.000Z',
      0,
      null,
    );
    expect(model.dbUp).toBe(0);
  });

  it('sums non-idle node_cpu_seconds_total series and excludes mode=idle', () => {
    const samples = [
      { name: 'node_cpu_seconds_total', labels: { cpu: '0', mode: 'idle' }, value: 999 },
      { name: 'node_cpu_seconds_total', labels: { cpu: '0', mode: 'user' }, value: 10 },
      { name: 'node_cpu_seconds_total', labels: { cpu: '0', mode: 'system' }, value: 5 },
    ];
    const previous: CpuDeltaInput = { busySecondsCumulative: 0, sampledAtMs: -60_000 };
    const { model, currentCpu } = buildPlatformHealthModel(samples, '2026-09-03T12:00:00.000Z', 0, previous);
    expect(currentCpu?.busySecondsCumulative).toBe(15);
    expect(model.cpuPct).toBeCloseTo(25, 5); // 15 busy-seconds over 60s
  });

  it('computes dbSizeBytes and postgrestPool from their respective metrics', () => {
    const samples = [
      { name: 'pg_database_size_bytes', labels: {}, value: 953068691 },
      { name: 'pgrst_db_pool_max', labels: {}, value: 10 },
      { name: 'pgrst_db_pool_available', labels: {}, value: 4 },
    ];
    const { model } = buildPlatformHealthModel(samples, '2026-09-03T12:00:00.000Z', 0, null);
    expect(model.dbSizeBytes).toBe(953068691);
    expect(model.postgrestPool).toEqual({ used: 6, max: 10, saturationPct: 60 });
  });
});

describe('fetchSupabasePlatformMetrics — unconfigured path (no network)', () => {
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  beforeEach(() => {
    __resetPlatformMetricsCacheForTests();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    __resetPlatformMetricsCacheForTests();
  });

  it('reports unconfigured with every field null when no credential is set — never a fabricated healthy', async () => {
    const model = await fetchSupabasePlatformMetrics(0);
    expect(model.sourceStatus).toBe('unconfigured');
    expect(model.dbUp).toBeNull();
    expect(model.cpuPct).toBeNull();
    expect(model.memoryPct).toBeNull();
  });

  it('caches the unconfigured result for 60s from the same in-memory instance', async () => {
    const first = await fetchSupabasePlatformMetrics(0);
    const second = await fetchSupabasePlatformMetrics(30_000);
    expect(second).toBe(first);
  });

  it('re-evaluates after the cache TTL elapses', async () => {
    const first = await fetchSupabasePlatformMetrics(0);
    const second = await fetchSupabasePlatformMetrics(61_000);
    expect(second).not.toBe(first);
    expect(second.sourceStatus).toBe('unconfigured');
  });
});
