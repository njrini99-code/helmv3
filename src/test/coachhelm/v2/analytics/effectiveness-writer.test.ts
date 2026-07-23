/**
 * Unit test for the P1 accuracy fix (COACHHELM_ACCURACY_AUDIT_2026-07-23):
 * `rollupInsightEffectivenessForRange` previously counted EVERY
 * `golf_coach_insights` row touching the window, including dead v2-engine
 * rows that `applyInsightVisibility` (the visibility rule every reader uses)
 * excludes. Those dead rows formed their own (team_id, insight_type) bucket
 * that never gets acted upon or measured, permanently writing an
 * `effectiveness_score=0` row for an insight type no coach can ever see.
 *
 * This test proves the fetch is now scoped through the SAME
 * `applyInsightVisibility` contract: a visibility-hidden (dead v2,
 * `engine_version='v2'`, non-`v3:`-signature) insight row is excluded from
 * both the written bucket set (denominator) AND the count for its own
 * insight_type — while a v3-visible row in the same window is still
 * counted and rolled up correctly.
 *
 * The fake Supabase client below actually APPLIES the recorded filter
 * predicates in-memory (not just recording calls) so the test exercises
 * real behavior, not just wiring.
 */

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { rollupInsightEffectivenessForRange } from '@/lib/coachhelm/v2/analytics/effectiveness-writer';
import {
  V3_ENGINE_FILTER,
  VISIBLE_LIFECYCLE_STATES,
} from '@/lib/coachhelm/v3/insight-visibility';

interface FakeInsightRow {
  team_id: string | null;
  insight_type: string | null;
  created_at: string | null;
  dismissed_at: string | null;
  acknowledged_at: string | null;
  action_taken: boolean | null;
  outcome_measured_at: string | null;
  outcome_status: string | null;
  engine_version: string | null;
  signature: string | null;
  lifecycle_state: string | null;
  status: string | null;
}

type FakeMethod = (...args: unknown[]) => unknown;

function asRecord(row: FakeInsightRow): Record<string, unknown> {
  return row as unknown as Record<string, unknown>;
}

/**
 * A fake `golf_coach_insights` query builder that actually filters its
 * in-memory row set as each PostgREST-style predicate is chained, so the
 * test proves real exclusion behavior rather than just asserting call args.
 */
function makeInsightsBuilder(rows: FakeInsightRow[]) {
  let filtered = rows;
  const calls: Array<{ method: string; args: unknown[] }> = [];

  const builder: Record<string, FakeMethod> & {
    then?: (resolve: (v: unknown) => unknown) => unknown;
  } = {} as Record<string, FakeMethod>;

  builder.select = vi.fn(() => builder) as unknown as FakeMethod;

  builder.gte = vi.fn((col: unknown, val: unknown) => {
    calls.push({ method: 'gte', args: [col, val] });
    filtered = filtered.filter((r) => {
      const v = asRecord(r)[col as string] as string | null;
      return v != null && v >= (val as string);
    });
    return builder;
  }) as unknown as FakeMethod;

  builder.lt = vi.fn((col: unknown, val: unknown) => {
    calls.push({ method: 'lt', args: [col, val] });
    filtered = filtered.filter((r) => {
      const v = asRecord(r)[col as string] as string | null;
      return v != null && v < (val as string);
    });
    return builder;
  }) as unknown as FakeMethod;

  builder.lte = vi.fn((col: unknown, val: unknown) => {
    calls.push({ method: 'lte', args: [col, val] });
    filtered = filtered.filter((r) => {
      const v = asRecord(r)[col as string] as string | null;
      return v != null && v <= (val as string);
    });
    return builder;
  }) as unknown as FakeMethod;

  builder.not = vi.fn((col: unknown, op: unknown, val: unknown) => {
    calls.push({ method: 'not', args: [col, op, val] });
    if (op === 'is' && val === null) {
      filtered = filtered.filter((r) => asRecord(r)[col as string] != null);
    }
    return builder;
  }) as unknown as FakeMethod;

  builder.is = vi.fn((col: unknown, val: unknown) => {
    calls.push({ method: 'is', args: [col, val] });
    filtered = filtered.filter((r) => asRecord(r)[col as string] === val);
    return builder;
  }) as unknown as FakeMethod;

  // Mirrors `applyInsightVisibility`'s V3_ENGINE_FILTER OR-clause parsing:
  // "engine_version.eq.v3,signature.like.v3:%"
  builder.or = vi.fn((filterStr: unknown) => {
    calls.push({ method: 'or', args: [filterStr] });
    const clauses = (filterStr as string).split(',');
    filtered = filtered.filter((r) =>
      clauses.some((clause) => {
        const parts = clause.split('.');
        const col = parts[0];
        const op = parts[1];
        const val = parts[2];
        if (col === undefined || op === undefined || val === undefined) return false;
        const v = asRecord(r)[col];
        if (op === 'eq') return v === val;
        if (op === 'like') {
          const pattern = val.replace(/%$/, '');
          return typeof v === 'string' && v.startsWith(pattern);
        }
        return false;
      }),
    );
    return builder;
  }) as unknown as FakeMethod;

  builder.in = vi.fn((col: unknown, vals: unknown) => {
    calls.push({ method: 'in', args: [col, vals] });
    const list = vals as readonly string[];
    filtered = filtered.filter((r) => list.includes(asRecord(r)[col as string] as string));
    return builder;
  }) as unknown as FakeMethod;

  builder.neq = vi.fn((col: unknown, val: unknown) => {
    calls.push({ method: 'neq', args: [col, val] });
    filtered = filtered.filter((r) => asRecord(r)[col as string] !== val);
    return builder;
  }) as unknown as FakeMethod;

  builder.limit = vi.fn((n: unknown) =>
    Promise.resolve({ data: filtered.slice(0, n as number), error: null }),
  ) as unknown as FakeMethod;

  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: filtered, error: null }).then(resolve);

  return { builder, calls };
}

function makeEmptyPassthroughBuilder() {
  const builder: Record<string, FakeMethod> & {
    then?: (resolve: (v: unknown) => unknown) => unknown;
  } = {} as Record<string, FakeMethod>;
  const passthrough = (() => builder) as unknown as FakeMethod;
  for (const m of ['select', 'in', 'gte', 'lt', 'lte', 'eq', 'neq', 'is', 'not', 'or', 'limit']) {
    builder[m] = passthrough;
  }
  builder.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(resolve);
  return builder;
}

function createFakeSupabase(rawRows: FakeInsightRow[]) {
  const upsertCalls: Array<{ rows: unknown[]; opts: unknown }> = [];
  const insightsBuilders: ReturnType<typeof makeInsightsBuilder>[] = [];

  const from = vi.fn((table: string) => {
    if (table === 'golf_coach_insights') {
      const built = makeInsightsBuilder([...rawRows]);
      insightsBuilders.push(built);
      return built.builder;
    }
    if (table === 'golf_insight_effectiveness') {
      return {
        upsert: vi.fn((rows: unknown[], opts: unknown) => {
          upsertCalls.push({ rows, opts });
          return Promise.resolve({ error: null });
        }),
      };
    }
    // golf_rounds (outcome backfill) — not exercised when candidates are
    // empty, but stubbed defensively.
    return makeEmptyPassthroughBuilder();
  });

  const client = { from } as unknown as SupabaseClient;
  return { client, upsertCalls, insightsBuilders };
}

const WINDOW_START = new Date('2026-07-20T00:00:00.000Z');
const WINDOW_END = new Date('2026-07-21T00:00:00.000Z');
const IN_WINDOW_TS = '2026-07-20T12:00:00.000Z';

function baseRow(overrides: Partial<FakeInsightRow>): FakeInsightRow {
  return {
    team_id: 'team-1',
    insight_type: 'unset',
    created_at: IN_WINDOW_TS,
    dismissed_at: null,
    acknowledged_at: null,
    action_taken: false,
    outcome_measured_at: null,
    outcome_status: null,
    engine_version: 'v3',
    signature: 'v3:unset:0000',
    lifecycle_state: 'detected',
    status: 'active',
    ...overrides,
  };
}

describe('rollupInsightEffectivenessForRange — visibility scoping (P1)', () => {
  it('excludes a visibility-hidden dead v2 insight from the rollup denominator/count', async () => {
    const visibleV3Row = baseRow({
      insight_type: 'putting_lag_control',
      engine_version: 'v3',
      signature: 'v3:putting_lag_control:abc123',
      acknowledged_at: IN_WINDOW_TS,
      outcome_measured_at: IN_WINDOW_TS,
      outcome_status: 'improved',
    });

    // Dead v2-engine insight type: `applyInsightVisibility` excludes any row
    // that is neither `engine_version='v3'` nor signature-stamped `v3:%`,
    // regardless of lifecycle_state/status otherwise looking visible.
    const deadV2Row = baseRow({
      insight_type: 'par_scoring_par4',
      engine_version: 'v2',
      signature: 'v2:par_scoring_par4:xyz789',
    });

    const { client, upsertCalls, insightsBuilders } = createFakeSupabase([
      visibleV3Row,
      deadV2Row,
    ]);

    const result = await rollupInsightEffectivenessForRange(client, WINDOW_START, WINDOW_END);

    expect(result.failed).toBe(0);
    expect(result.written).toBe(1);

    // Only one (team_id, insight_type) bucket was upserted — the dead v2
    // type never got its own row, so it can no longer sit forever at
    // effectiveness_score=0 on the coach-facing analytics page.
    expect(upsertCalls).toHaveLength(1);
    const insertedRows = upsertCalls[0]!.rows as Array<Record<string, unknown>>;
    expect(insertedRows).toHaveLength(1);

    const deadTypeRow = insertedRows.find((r) => r.insight_type === 'par_scoring_par4');
    expect(deadTypeRow).toBeUndefined();

    const liveTypeRow = insertedRows.find((r) => r.insight_type === 'putting_lag_control');
    expect(liveTypeRow).toBeDefined();
    expect(liveTypeRow?.team_id).toBe('team-1');
    // Counts are unaffected by the visibility scoping for the surviving row —
    // proves the fix only narrows WHAT is counted, not the counting math.
    expect(liveTypeRow?.insights_generated).toBe(1);
    expect(liveTypeRow?.insights_acted_upon).toBe(1);
    expect(liveTypeRow?.insights_with_outcome).toBe(1);
    expect(liveTypeRow?.outcomes_improved).toBe(1);
    expect(liveTypeRow?.action_rate).toBe(1);
    expect(liveTypeRow?.improvement_rate).toBe(1);
    expect(liveTypeRow?.effectiveness_score).toBe(1);

    // Wiring assertion: the main fetch applies the SAME shared contract
    // every other golf_coach_insights reader uses.
    const mainQueryCalls = insightsBuilders[0]!.calls;
    expect(mainQueryCalls).toContainEqual({ method: 'or', args: [V3_ENGINE_FILTER] });
    expect(mainQueryCalls).toContainEqual({
      method: 'in',
      args: ['lifecycle_state', [...VISIBLE_LIFECYCLE_STATES]],
    });
    expect(mainQueryCalls).toContainEqual({ method: 'neq', args: ['status', 'dismissed'] });
  });

  it('excludes a dismissed and an archived/tentative-lifecycle row too (full contract, not just engine)', async () => {
    const visibleRow = baseRow({ insight_type: 'sg_putting_trend' });
    const dismissedRow = baseRow({
      insight_type: 'dismissed_type',
      status: 'dismissed',
    });
    const tentativeRow = baseRow({
      insight_type: 'tentative_type',
      lifecycle_state: 'tentative',
    });

    const { client, upsertCalls } = createFakeSupabase([
      visibleRow,
      dismissedRow,
      tentativeRow,
    ]);

    const result = await rollupInsightEffectivenessForRange(client, WINDOW_START, WINDOW_END);

    expect(result.written).toBe(1);
    const insertedRows = upsertCalls[0]!.rows as Array<Record<string, unknown>>;
    expect(insertedRows.map((r) => r.insight_type)).toEqual(['sg_putting_trend']);
  });

  it('writes nothing (not an error) when every row in the window is visibility-hidden', async () => {
    const deadV2Row = baseRow({
      insight_type: 'par_scoring_par4',
      engine_version: 'v2',
      signature: 'v2:par_scoring_par4:xyz789',
    });

    const { client, upsertCalls } = createFakeSupabase([deadV2Row]);

    const result = await rollupInsightEffectivenessForRange(client, WINDOW_START, WINDOW_END);

    expect(result.failed).toBe(0);
    expect(result.written).toBe(0);
    expect(upsertCalls).toHaveLength(0);
  });
});
