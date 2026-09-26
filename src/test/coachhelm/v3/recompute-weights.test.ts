import { describe, it, expect } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import {
  currentLift,
  diffWeights,
  recomputeCoachWeights,
  replayCoachWeights,
  type AttributionFact,
  type InsightFact,
} from '@/lib/coachhelm/v3/causality/recompute-weights';
import { nextWeight } from '@/lib/coachhelm/v3/causality/attribute';

function attr(over: Partial<AttributionFact> = {}): AttributionFact {
  return {
    insight_id: 'i1',
    target_metric_id: 'sg_putting',
    baseline_value: -1,
    post_value: -0.5,
    n_rounds_before: 3,
    n_rounds_after: 3,
    method_version: 'v2_observed_delta',
    attributed_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

function ins(over: Partial<InsightFact> = {}): InsightFact {
  return {
    id: 'i1',
    player_id: 'p1',
    coach_id: 'c1',
    insight_type: 'putt_bias',
    engine_version: 'v3',
    signature: 'putt_bias:left:5_10',
    lifecycle_state: 'detected',
    status: 'active',
    ...over,
  };
}

describe('currentLift', () => {
  it('is direction-corrected: a lower-is-better drop is a positive lift', () => {
    expect(
      currentLift(attr({ target_metric_id: 'penalty_rate_per_round', baseline_value: 1.5, post_value: 1.0 })),
    ).toBeCloseTo(0.5);
    expect(currentLift(attr())).toBeCloseTo(0.5);
  });

  it('is null below the per-window round floor', () => {
    expect(currentLift(attr({ n_rounds_after: 1 }))).toBeNull();
  });
});

describe('replayCoachWeights', () => {
  it('folds the cron EMA in attributed_at order from {1.0, 0}', () => {
    const rows = [
      attr({ insight_id: 'i2', attributed_at: '2026-09-02T00:00:00Z', baseline_value: 0, post_value: -1 }),
      attr({ insight_id: 'i1', attributed_at: '2026-09-01T00:00:00Z' }),
    ];
    const map = new Map([
      ['i1', ins()],
      ['i2', ins({ id: 'i2' })],
    ]);
    const res = replayCoachWeights(rows, map);
    const expected = nextWeight(nextWeight({ weight: 1, sample_n: 0 }, 0.5), -1);
    expect(res.weights).toEqual([{ coach_id: 'c1', insight_type: 'putt_bias', intent: 'general', ...expected }]);
    expect(res.used).toBe(2);
  });

  it('counts past outcomes whatever the insight became later (archived, dismissed, matured)', () => {
    const rows = [
      attr({ insight_id: 'arch', attributed_at: '2026-09-01T00:00:00Z' }),
      attr({ insight_id: 'dism', attributed_at: '2026-09-02T00:00:00Z', method_version: null }),
      attr({ insight_id: 'mat', attributed_at: '2026-09-03T00:00:00Z' }),
    ];
    const map = new Map([
      ['arch', ins({ id: 'arch', lifecycle_state: 'archived' })],
      ['dism', ins({ id: 'dism', lifecycle_state: 'detected', status: 'dismissed' })],
      ['mat', ins({ id: 'mat', lifecycle_state: 'matured' })],
    ]);
    const res = replayCoachWeights(rows, map);
    const expected = nextWeight(nextWeight(nextWeight({ weight: 1, sample_n: 0 }, 0.5), 0.5), 0.5);
    expect(res.used).toBe(3);
    expect(res.weights).toEqual([{ coach_id: 'c1', insight_type: 'putt_bias', intent: 'general', ...expected }]);
  });

  it('skips comparable-method rows, data-quality gaps and null lifts, each under its own reason', () => {
    const rows = [
      attr({ insight_id: 'a', method_version: 'comparable_opportunities_v1' }),
      attr({ insight_id: 'gone' }),
      attr({ insight_id: 'd' }),
      attr({ insight_id: 'np' }),
      attr({ insight_id: 'v2' }),
      attr({ insight_id: 'e', n_rounds_before: 0 }),
      attr({ insight_id: 'f', method_version: null }),
    ];
    const map = new Map([
      ['d', ins({ id: 'd', coach_id: null })],
      ['np', ins({ id: 'np', player_id: null })],
      ['v2', ins({ id: 'v2', engine_version: 'v2', signature: 'putt_bias:left' })],
      ['e', ins({ id: 'e' })],
      ['f', ins({ id: 'f', engine_version: null, signature: 'v3:x' })],
    ]);
    const res = replayCoachWeights(rows, map);
    expect(res.skipped).toEqual({
      method: 1,
      missing_insight: 1,
      no_coach: 1,
      no_player: 1,
      not_v3: 1,
      null_lift: 1,
    });
    expect(res.used).toBe(1);
  });
});

describe('diffWeights', () => {
  it('reports changed, unsupported and new keys', () => {
    const diff = diffWeights(
      [
        { coach_id: 'c1', insight_type: 'a', intent: 'general', weight: 1.5, sample_n: 20 },
        { coach_id: 'c1', insight_type: 'gone', intent: 'general', weight: 0.7, sample_n: 12 },
      ],
      [
        { coach_id: 'c1', insight_type: 'a', intent: 'general', weight: 1.1, sample_n: 4 },
        { coach_id: 'c2', insight_type: 'b', intent: 'general', weight: 1.2, sample_n: 1 },
      ],
    );
    expect(diff.map((d) => [d.insight_type, d.old?.weight ?? null, d.next?.weight ?? null])).toEqual([
      ['a', 1.5, 1.1],
      ['gone', 0.7, null],
      ['b', null, 1.2],
    ]);
  });
});

/** Wraps the fake client so every mutating builder call is recorded. */
function recording(tables: Record<string, Record<string, unknown>[]>) {
  const raw = createFakeSupabase({ tables });
  const writes: string[] = [];
  const sb = {
    ...raw,
    from(table: string) {
      const builder = raw.from(table) as unknown as object;
      return new Proxy(builder, {
        get(target, prop, recv) {
          if (typeof prop === 'string' && ['insert', 'update', 'upsert', 'delete'].includes(prop)) {
            writes.push(`${table}.${prop}`);
          }
          return Reflect.get(target, prop, recv);
        },
      });
    },
  };
  return { sb, writes, raw };
}

describe('recomputeCoachWeights', () => {
  const tables = () => ({
    golf_insight_outcome_attribution: [attr() as unknown as Record<string, unknown>],
    golf_coach_insights: [ins() as unknown as Record<string, unknown>],
    golf_coachhelm_coach_weights: [
      { coach_id: 'c1', insight_type: 'putt_bias', intent: 'general', weight: 1.9, sample_n: 40 },
      { coach_id: 'c1', insight_type: 'stale', intent: 'general', weight: 0.5, sample_n: 30 },
    ],
  });

  it('the default dry run makes ZERO writes and still reports the diff', async () => {
    const { sb, writes } = recording(tables());
    const res = await recomputeCoachWeights(sb as never);
    expect(writes).toEqual([]);
    expect(res.applied).toBe(false);
    const putt = res.diff.find((d) => d.insight_type === 'putt_bias')!;
    expect(putt.old).toEqual({ weight: 1.9, sample_n: 40 });
    expect(putt.next?.sample_n).toBe(1);
    expect(res.diff.find((d) => d.insight_type === 'stale')?.next).toBeNull();
  });

  it('--apply upserts recomputed keys and never deletes without --prune', async () => {
    const { sb, writes, raw } = recording(tables());
    await recomputeCoachWeights(sb as never, { apply: true });
    expect(writes).toEqual(['golf_coachhelm_coach_weights.upsert']);
    const { data } = await raw.from('golf_coachhelm_coach_weights').select('*');
    expect(data).toHaveLength(2);
  });
});
