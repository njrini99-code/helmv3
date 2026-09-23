/**
 * RC0 (2026-09-12): a row inserted `tentative` on a thin first sample was
 * never promoted — both `updateExisting` branches refreshed evidence and
 * confidence but left lifecycle untouched, so rows with confidence 1.0 and
 * 45–115 shots stayed invisible to every coach surface. These tests drive
 * the real `upsertInsight` through both branches with a tentative existing
 * row and assert the promotion write, its provenance, and the team gate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/notifications/insight-notifier', () => ({
  notifyInsightLanded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

import { upsertInsight } from '@/lib/coachhelm/v2/insights/upsert';
import { notifyInsightLanded } from '@/lib/notifications/insight-notifier';
import type { InsightInput, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

interface RecordedCall {
  table: string;
  op: 'select' | 'update';
  payload?: Record<string, unknown>;
}

function createFakeSupabase(opts: {
  existingRow: Record<string, unknown> | null;
  teamPreferences?: Record<string, unknown> | null;
  settingsError?: { message: string } | null;
  /** Simulate a lost lifecycle CAS race (a concurrent coach action / engine
   *  write moved the row between the SELECT and this UPDATE): `[]` means the
   *  `.eq('lifecycle_state', …)` guard matched zero rows. */
  updateResult?: { data: unknown; error: { message: string } | null };
}) {
  const calls: (RecordedCall & { filters?: Record<string, unknown> })[] = [];
  const fromFn = vi.fn((table: string) => {
    const thenable = {
      select: vi.fn(() => thenable),
      eq: vi.fn(() => thenable),
      is: vi.fn(() => thenable),
      order: vi.fn(() => thenable),
      limit: vi.fn(() => {
        calls.push({ table, op: 'select' });
        return Promise.resolve({ data: opts.existingRow ? [opts.existingRow] : [], error: null });
      }),
      maybeSingle: vi.fn(() => {
        calls.push({ table, op: 'select' });
        if (table === 'golf_team_coachhelm_settings') {
          if (opts.settingsError) return Promise.resolve({ data: null, error: opts.settingsError });
          return Promise.resolve({
            data: opts.teamPreferences === undefined ? null : { preferences: opts.teamPreferences },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      }),
      // Chainable .eq()/.is() (the CAS guard adds a second filter beyond
      // `.eq('id', …)`), terminated by `.select('id')` as `updateExisting`
      // now does. Defaults to a successful CAS match (the row id came back).
      update: vi.fn((payload: Record<string, unknown>) => {
        const filters: Record<string, unknown> = {};
        const chain = {
          eq: (col: string, val: unknown) => { filters[col] = val; return chain; },
          is: (col: string, val: unknown) => { filters[`${col}__is`] = val; return chain; },
          select: (_cols?: string) => {
            calls.push({ table, op: 'update', payload, filters });
            const rowId = (opts.existingRow as { id?: string } | null)?.id ?? 'row-1';
            return Promise.resolve(opts.updateResult ?? { data: [{ id: rowId }], error: null });
          },
        };
        return chain;
      }),
    };
    return thenable;
  });
  const client = { from: fromFn } as unknown as Parameters<typeof upsertInsight>[0];
  return { client, calls };
}

/** approach_miss-shaped evidence: honest mode, confidence == sample adequacy. */
function evidence(yourValue: number, sampleAdequacy: number, sampleN = 45): InsightEvidence {
  return {
    metric: 'approach_green_hit_125_175',
    metric_label: '125-175 yd greens hit',
    unit: 'percent',
    your_value: yourValue,
    your_value_display: `${yourValue}%`,
    comparison_value: 65,
    comparison_label: 'Tour',
    comparison_source: 'pga_baseline',
    sample_n: sampleN,
    window_days: 90,
    window_start: '',
    window_end: '',
    strokes_impact: 0,
    strokes_impact_method: 'rough_estimate',
    confidence: 0,
    confidence_factors: {
      sample_adequacy: sampleAdequacy, recency: 1, variance: 0.5, factors_measured: false,
    },
  };
}

function input(yourValue: number, sampleAdequacy: number): InsightInput {
  return {
    player_id: 'player-1',
    coach_id: 'coach-1',
    team_id: 'team-1',
    category: 'approach',
    signature: 'v3:approach_miss:125_175ft',
    title: '125-175 yd approach',
    content: '…',
    evidence: evidence(yourValue, sampleAdequacy),
    priority: 'low',
  };
}

function tentativeRow(yourValue: number, movementCount = 0): Record<string, unknown> {
  return {
    id: 'row-1',
    evidence: evidence(yourValue, 0.24, 6),
    metadata: { movement_count: movementCount, last_refreshed_at: '2026-09-11T02:00:00.000Z' },
    lifecycle_state: 'tentative',
  };
}

function updatePayload(calls: RecordedCall[]): Record<string, unknown> {
  const update = calls.find((c) => c.op === 'update' && c.table === 'golf_coach_insights');
  if (!update?.payload) throw new Error('no update recorded');
  return update.payload;
}

describe('upsertInsight promotes tentative rows whose sample support clears the floor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refresh branch (value within 5%): tentative → detected with provenance', async () => {
    const { client, calls } = createFakeSupabase({ existingRow: tentativeRow(29) });
    await upsertInsight(client, input(29, 1.0));
    const payload = updatePayload(calls);
    expect(payload.lifecycle_state).toBe('detected');
    const metadata = payload.metadata as Record<string, unknown>;
    expect(typeof metadata.promoted_at).toBe('string');
    expect(metadata.promotion_reason).toBe('confidence_floor');
    expect(typeof metadata.first_visible_at).toBe('string');
    // created_at is never rewritten: recovered rows keep their original feed date.
    expect(payload).not.toHaveProperty('created_at');
    expect(payload).not.toHaveProperty('status');
  });

  it('movement branch (value moves >5%): tentative → detected, movement still recorded', async () => {
    const { client, calls } = createFakeSupabase({ existingRow: tentativeRow(20, 7) });
    await upsertInsight(client, input(29, 1.0));
    const payload = updatePayload(calls);
    expect(payload.lifecycle_state).toBe('detected');
    const metadata = payload.metadata as Record<string, unknown>;
    expect(metadata.movement_count).toBe(8);
    expect(metadata.promotion_reason).toBe('confidence_floor');
    expect(vi.mocked(notifyInsightLanded)).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle_state: 'detected', was_lifecycle_promotion: true }),
    );
  });

  it('below the floor: stays tentative, no promotion provenance', async () => {
    const { client, calls } = createFakeSupabase({ existingRow: tentativeRow(29) });
    await upsertInsight(client, input(29, 0.3));
    const payload = updatePayload(calls);
    expect(payload).not.toHaveProperty('lifecycle_state');
    const metadata = payload.metadata as Record<string, unknown>;
    expect(metadata.promoted_at).toBeUndefined();
  });

  it('does not read the team gate at all when no promotion is possible', async () => {
    const { client, calls } = createFakeSupabase({ existingRow: tentativeRow(29) });
    await upsertInsight(client, input(29, 0.3));
    expect(calls.some((c) => c.table === 'golf_team_coachhelm_settings')).toBe(false);
  });

  it('team preference tentative_promotion_enabled=false pauses promotion (canary gate)', async () => {
    const { client, calls } = createFakeSupabase({
      existingRow: tentativeRow(29),
      teamPreferences: { tentative_promotion_enabled: false },
    });
    await upsertInsight(client, input(29, 1.0));
    const payload = updatePayload(calls);
    expect(payload).not.toHaveProperty('lifecycle_state');
    // Evidence still refreshed — pausing visibility never drops fresh data.
    expect((payload.evidence as InsightEvidence).confidence).toBe(1);
  });

  it('missing settings row or lookup error fails open (promotion proceeds)', async () => {
    const noRow = createFakeSupabase({ existingRow: tentativeRow(29) });
    await upsertInsight(noRow.client, input(29, 1.0));
    expect(updatePayload(noRow.calls).lifecycle_state).toBe('detected');

    const errored = createFakeSupabase({
      existingRow: tentativeRow(29), settingsError: { message: 'boom' },
    });
    await upsertInsight(errored.client, input(29, 1.0));
    expect(updatePayload(errored.calls).lifecycle_state).toBe('detected');
  });

  it('stamps the confidence method version on the refreshed evidence', async () => {
    const { client, calls } = createFakeSupabase({ existingRow: tentativeRow(29) });
    await upsertInsight(client, input(29, 1.0));
    const ev = updatePayload(calls).evidence as InsightEvidence;
    expect(ev.confidence_factors.method_version).toBe('honest_v2');
  });

  // 2026-09-22 (R1/R2 leftover): a concurrent coach dismissal/acknowledge/
  // archive between the SELECT and this UPDATE must never be clobbered by a
  // promotion decided from the stale 'tentative' read.
  it('lost lifecycle CAS race: a concurrent coach action wins, no promotion applied, no push', async () => {
    const { client, calls } = createFakeSupabase({
      existingRow: tentativeRow(29),
      updateResult: { data: [], error: null }, // .eq('lifecycle_state', 'tentative') matched nothing
    });
    const id = await upsertInsight(client, input(29, 1.0));

    expect(id).toBe('row-1'); // hands back the row's identity, unchanged
    expect(vi.mocked(notifyInsightLanded)).not.toHaveBeenCalled();
    const update = calls.find((c) => c.op === 'update' && c.table === 'golf_coach_insights');
    expect(update?.filters?.lifecycle_state).toBe('tentative');
  });
});
