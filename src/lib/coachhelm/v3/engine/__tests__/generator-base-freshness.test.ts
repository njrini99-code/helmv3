/**
 * Slice 0b through BaseGenerator.run(): every read is stamped with the window
 * it used (flag-independent), and with `coachhelm_reads_v1_copy` on a read
 * under its family floor is not written: the scope is retracted and the
 * receipt carries the Watching count-down. Synthetic rounds only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

const upsertInsightV3Mock = vi.fn();
const flagMock = vi.fn(() => false);
let fake: FakeSupabase;

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fake }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => flagMock() }));
vi.mock('@/lib/coachhelm/v3/insights/upsert-v3', () => ({
  upsertInsightV3: (...args: unknown[]) => upsertInsightV3Mock(...args),
  V3_SIGNATURE_PREFIX: 'v3:',
  GATED_OUT: '__gated_out__',
}));
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({ loadStandingForMetric: async () => null }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));

import { BaseGenerator } from '../generator-base';
import { __resetRoundIndexMemo } from '../read-window';
import type { ComposedContent, GeneratorAggregate, InsightCategory, MetricId } from '../types';
import type { InsightInput } from '@/lib/coachhelm/v2/insights/types';

interface Agg extends GeneratorAggregate {
  attempts: number;
}

class ApproachLike extends BaseGenerator<Agg> {
  readonly name = 'approach-like';
  readonly metricId: MetricId = 'sg_putting';
  readonly insightType = 'approach_miss';
  readonly category: InsightCategory = 'approach';
  readonly minSampleN = 5;
  protected override readonly requiresStanding = false;

  constructor(private readonly agg: Agg) {
    super('p1');
  }
  async aggregate(): Promise<Agg> {
    return this.agg;
  }
  composeContent(agg: Agg): ComposedContent {
    return {
      title: 't',
      content: 'c',
      signature: 'approach_miss:50_125ft',
      evidence: {
        metric: 'm',
        metric_label: 'M',
        unit: 'percent',
        your_value: 50,
        your_value_display: '50%',
        comparison_value: 60,
        comparison_label: 'Tour',
        comparison_source: 'pga_baseline',
        sample_n: agg.attempts,
        window_days: 90,
        window_start: '',
        window_end: '',
        strokes_impact: 0,
        strokes_impact_method: 'sg_baseline',
        confidence: 0,
        confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
      },
    };
  }
}

function seedRounds(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: `r${i + 1}`,
    player_id: 'p1',
    status: 'completed',
    is_test: false,
    round_date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    created_at: `2026-10-${String(i + 1).padStart(2, '0')}T20:00:00Z`,
    holes_played: 18,
    total_score: 75,
    front_nine: 37,
    back_nine: 38,
    total_putts: 30,
  }));
  fake = createFakeSupabase({ tables: { golf_rounds: rows, golf_coach_insights: [] } });
  return rows.map((r) => r.id);
}

function lastInput(): InsightInput {
  const call = upsertInsightV3Mock.mock.calls.at(-1);
  if (!call) throw new Error('not written');
  return call[1] as InsightInput;
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetRoundIndexMemo();
  flagMock.mockReturnValue(false);
  upsertInsightV3Mock.mockResolvedValue('row-1');
});

describe('BaseGenerator.run() — Slice 0b stamping', () => {
  it('stamps the window from the rounds the aggregate named (flag off)', async () => {
    const ids = seedRounds(6);
    const res = await new ApproachLike({
      sampleN: 9, playerValue: 1, attempts: 9, windowRoundIds: ids.slice(1, 4),
    }).run();
    expect(res.status).toBe('generated');
    expect(lastInput().evidence).toMatchObject({
      window_start: '2026-10-02',
      window_end: '2026-10-04',
      newest_round_id: 'r4',
      rounds_n: 3,
      sample_unit: 'approaches',
      source_round_ids: ['r4', 'r3', 'r2'],
    });
  });

  it('with the flag off a thin read is still written (old gates unchanged)', async () => {
    const ids = seedRounds(2);
    const res = await new ApproachLike({ sampleN: 9, playerValue: 1, attempts: 9, windowRoundIds: ids }).run();
    expect(res.status).toBe('generated');
    expect(res.watching).toBeUndefined();
  });
});

describe('BaseGenerator.run() — Slice 0b floors (flag on)', () => {
  it('holds a read under the floor back as Watching and writes nothing', async () => {
    flagMock.mockReturnValue(true);
    const ids = seedRounds(2);
    const res = await new ApproachLike({ sampleN: 9, playerValue: 1, attempts: 9, windowRoundIds: ids }).run();
    expect(res).toMatchObject({ id: null, gated: false, status: 'no_data' });
    expect(res.watching).toEqual({
      family: 'approach_miss',
      needs: [
        { unit: 'rounds', have_n: 2, need_n: 4 },
        { unit: 'approaches', have_n: 9, need_n: 20 },
      ],
    });
    expect(upsertInsightV3Mock).not.toHaveBeenCalled();
  });

  it('writes a read that clears the floor', async () => {
    flagMock.mockReturnValue(true);
    const ids = seedRounds(5);
    const res = await new ApproachLike({ sampleN: 24, playerValue: 1, attempts: 24, windowRoundIds: ids }).run();
    expect(res.status).toBe('generated');
    expect(lastInput().evidence.rounds_n).toBe(5);
  });
});
