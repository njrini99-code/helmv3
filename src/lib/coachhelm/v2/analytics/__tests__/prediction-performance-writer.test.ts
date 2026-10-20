import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isGradedPrediction,
  rollupPredictionPerformanceRolling30d,
} from '../prediction-performance-writer';

type Row = Record<string, unknown>;

function fakeSupabase(predictions: Row[], members: Row[], opts: { rejectExtended?: boolean } = {}) {
  const upserts: Row[][] = [];
  const builder = (data: Row[]) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'gte', 'lt', 'in', 'eq']) b[m] = () => b;
    b.then = (resolve: (v: unknown) => unknown) => resolve({ data, error: null });
    return b;
  };
  const client = {
    from(table: string) {
      if (table === 'golf_predictions') return builder(predictions);
      if (table === 'golf_team_members') return builder(members);
      return {
        upsert: async (rows: Row[]) => {
          if (opts.rejectExtended && rows.some((r) => 'naive_mean_absolute_error' in r)) {
            return { error: { code: 'PGRST204', message: "Could not find the 'naive_mean_absolute_error' column" } };
          }
          upserts.push(rows);
          return { error: null };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, upserts };
}

const NOW = Date.parse('2026-09-28T12:00:00Z');
const members = [{ player_id: 'p1', team_id: 't1' }];

function pred(over: Row): Row {
  return {
    player_id: 'p1',
    metric: 'score_to_par',
    model_version: 'coachhelm-v2',
    predicted_value: 4,
    predicted_low: 0,
    predicted_high: 8,
    actual_value: 5,
    was_accurate: true,
    validated_at: '2026-09-20T00:00:00Z',
    created_at: '2026-09-10T00:00:00Z',
    confidence: 0.7,
    error_category: null,
    confidence_factors: { naive_last5: 7 },
    ...over,
  };
}

describe('isGradedPrediction', () => {
  it('counts only rows with a real actual that are not retired invalid-horizon', () => {
    expect(isGradedPrediction(pred({}))).toBe(true);
    expect(isGradedPrediction(pred({ actual_value: null, was_accurate: false }))).toBe(false);
    expect(isGradedPrediction(pred({ error_category: 'invalid_horizon', actual_value: null }))).toBe(false);
    expect(isGradedPrediction(pred({ validated_at: null }))).toBe(false);
  });
});

describe('rollupPredictionPerformanceRolling30d', () => {
  it('never counts a null-actual verdict as a validated miss', async () => {
    const { client, upserts } = fakeSupabase(
      [
        pred({}),
        // Legacy shape: validated_at set, no actual, was_accurate false.
        pred({ actual_value: null, was_accurate: false }),
        pred({ actual_value: null, was_accurate: null, error_category: 'invalid_horizon' }),
      ],
      members,
    );
    await rollupPredictionPerformanceRolling30d(client, NOW);
    const row = upserts[0]![0]!;
    expect(row.predictions_validated).toBe(1);
    expect(row.accuracy_rate).toBe(1);
    // invalid_horizon rows are not "made" either — they could never validate.
    expect(row.predictions_made).toBe(2);
  });

  it('scores accuracy as the actual landing inside the stored interval', async () => {
    const { client, upserts } = fakeSupabase(
      [
        pred({ actual_value: 5 }),
        // was_accurate true via direction only, but outside the band.
        pred({ actual_value: 12, was_accurate: true }),
      ],
      members,
    );
    await rollupPredictionPerformanceRolling30d(client, NOW);
    expect(upserts[0]![0]!.accuracy_rate).toBe(0.5);
    expect(upserts[0]![0]!.interval_coverage).toBe(0.5);
  });

  it('reports MAE against the naive last-5 baseline alongside coverage', async () => {
    const { client, upserts } = fakeSupabase(
      [pred({ predicted_value: 4, actual_value: 5 }), pred({ predicted_value: 6, actual_value: 5, confidence_factors: {} })],
      members,
    );
    await rollupPredictionPerformanceRolling30d(client, NOW);
    const row = upserts[0]![0]!;
    expect(row.mean_absolute_error).toBe(1);
    // Only the row that carries naive_last5 (7 vs actual 5) enters the naive MAE.
    expect(row.naive_mean_absolute_error).toBe(2);
    expect(row.naive_sample_count).toBe(1);
  });

  it('still writes the snapshot when the extended columns are not deployed yet', async () => {
    const { client, upserts } = fakeSupabase([pred({})], members, { rejectExtended: true });
    const res = await rollupPredictionPerformanceRolling30d(client, NOW);
    expect(res).toEqual({ written: 1, failed: 0 });
    expect(upserts[0]![0]!).not.toHaveProperty('naive_mean_absolute_error');
    expect(upserts[0]![0]!.predictions_validated).toBe(1);
  });
});
