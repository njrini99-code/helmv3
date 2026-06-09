/**
 * Resurrection tests (to-95 audit P2 sweep complement): when a generator
 * re-emits a signature whose existing row was previously ARCHIVED (by the
 * age-based lifecycle cron or the BaseGenerator stale-scope retraction),
 * updateExisting must bring the row back to a visible lifecycle state.
 * Without this, the refresh lands fresh evidence on a row the delivery
 * read paths can never show again — silently and permanently.
 *
 * `status` must NOT be touched: a coach dismissal keeps hiding the row
 * regardless of lifecycle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/notifications/insight-notifier', () => ({
  notifyInsightLanded: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

import { upsertInsight } from '@/lib/coachhelm/v2/insights/upsert';
import type { InsightInput, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

interface RecordedCall {
  table: string;
  op: 'select' | 'update';
  payload?: Record<string, unknown>;
}

function createFakeSupabase(existingRow: Record<string, unknown> | null) {
  const calls: RecordedCall[] = [];
  const fromFn = vi.fn((table: string) => {
    const thenable = {
      select: vi.fn(() => thenable),
      eq: vi.fn(() => thenable),
      is: vi.fn(() => thenable),
      order: vi.fn(() => thenable),
      limit: vi.fn(() => {
        calls.push({ table, op: 'select' });
        return Promise.resolve({ data: existingRow ? [existingRow] : [], error: null });
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        calls.push({ table, op: 'update', payload });
        return {
          eq: () => Promise.resolve({ data: null, error: null }),
        };
      }),
    };
    return thenable;
  });
  const client = { from: fromFn } as unknown as Parameters<typeof upsertInsight>[0];
  return { client, calls };
}

function evidence(yourValue: number): InsightEvidence {
  return {
    metric: 'putt_make_rate_6_10ft',
    metric_label: 'Make rate from 6-10 feet',
    unit: 'percent',
    your_value: yourValue,
    your_value_display: `${yourValue}`,
    comparison_value: 0.52,
    comparison_label: 'D2 average',
    comparison_source: 'd2_avg',
    sample_n: 47,
    window_days: 30,
    window_start: '2026-05-08',
    window_end: '2026-06-07',
    strokes_impact: 2.1,
    strokes_impact_method: 'peer_delta',
    confidence: 0,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 1 },
  };
}

function input(yourValue: number): InsightInput {
  return {
    player_id: 'player-1',
    coach_id: 'coach-1',
    team_id: 'team-1',
    category: 'putting',
    signature: 'v3:putt_distance:5_10ft',
    title: '6-10ft putts',
    content: 'Of your 47 putts...',
    evidence: evidence(yourValue),
  };
}

function archivedRow(yourValue: number): Record<string, unknown> {
  return {
    id: 'row-1',
    evidence: evidence(yourValue),
    metadata: {},
    lifecycle_state: 'archived',
  };
}

function lastUpdatePayload(calls: RecordedCall[]): Record<string, unknown> {
  const update = calls.find((c) => c.op === 'update');
  if (!update?.payload) throw new Error('no update recorded');
  return update.payload;
}

describe('upsertInsight resurrection of archived rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refresh branch (value within 5%): archived row returns to detected', async () => {
    const { client, calls } = createFakeSupabase(archivedRow(0.38));
    const id = await upsertInsight(client, input(0.38)); // identical value — small wiggle
    expect(id).toBe('row-1');

    const payload = lastUpdatePayload(calls);
    expect(payload.lifecycle_state).toBe('detected');
    expect(payload.archived_at).toBeNull();
    expect((payload.metadata as Record<string, unknown>).redetected_at).toBeTruthy();
    // status untouched — dismissal must keep hiding the row.
    expect(payload).not.toHaveProperty('status');
  });

  it('movement branch (value moves >5%): archived row returns to detected with movement', async () => {
    const { client, calls } = createFakeSupabase(archivedRow(0.38));
    const id = await upsertInsight(client, input(0.5)); // ~32% move
    expect(id).toBe('row-1');

    const payload = lastUpdatePayload(calls);
    expect(payload.lifecycle_state).toBe('detected');
    expect(payload.archived_at).toBeNull();
    const metadata = payload.metadata as Record<string, unknown>;
    expect(metadata.redetected_at).toBeTruthy();
    expect(metadata.movement).toBeTruthy();
    expect(payload).not.toHaveProperty('status');
  });

  it('non-archived row: refresh branch still preserves lifecycle (no resurrection writes)', async () => {
    const { client, calls } = createFakeSupabase({
      id: 'row-1',
      evidence: evidence(0.38),
      metadata: {},
      lifecycle_state: 'matured',
    });
    await upsertInsight(client, input(0.38));

    const payload = lastUpdatePayload(calls);
    expect(payload).not.toHaveProperty('lifecycle_state');
    expect(payload).not.toHaveProperty('archived_at');
  });
});
