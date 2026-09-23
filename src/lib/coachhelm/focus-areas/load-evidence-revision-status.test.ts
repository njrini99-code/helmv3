/**
 * A8 slice 3 — `computeEvidenceRevisionStatuses` batched loader.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

const isFlagEnabledMock = vi.fn().mockReturnValue(false);
vi.mock('@/lib/flags', () => ({ isFlagEnabled: (...args: unknown[]) => isFlagEnabledMock(...args) }));

import { computeEvidenceRevisionStatuses } from './load-evidence-revision-status';
import { computeInsightEvidenceRevision } from './evidence-revision-source';

const LIVE_INSIGHT_ROW = {
  id: 'insight-1',
  lifecycle_state: 'detected',
  evidence: {
    confidence: 0.72,
    your_value: 3.1,
    comparison_value: 2.4,
    secondary_value: 1.9,
    sample_n: 42,
    window_days: 30,
    window_start: '2026-08-24T00:00:00.000Z',
    window_end: '2026-09-23T00:00:00.000Z',
  },
  engine_version: 'v3.4.1',
};
const LIVE_FINGERPRINT = computeInsightEvidenceRevision(LIVE_INSIGHT_ROW)!;

function makeClient(insightRows: Record<string, unknown>[], readError: unknown = null) {
  const inFn = vi.fn().mockResolvedValue({ data: readError ? null : insightRows, error: readError });
  const selectFn = vi.fn().mockReturnValue({ in: inFn });
  const client = {
    from: vi.fn().mockReturnValue({ select: selectFn }),
  };
  return {
    client: client as unknown as SupabaseClient<Database>,
    from: client.from,
    _selectFn: selectFn,
    _inFn: inFn,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  isFlagEnabledMock.mockReturnValue(false);
});

describe('computeEvidenceRevisionStatuses', () => {
  it('flag off: returns {} and never reads golf_coach_insights', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    const client = makeClient([LIVE_INSIGHT_ROW]);

    const result = await computeEvidenceRevisionStatuses(client.client, [
      { id: 'fa-1', from_insight_id: 'insight-1', evidence_revision: LIVE_FINGERPRINT },
    ]);

    expect(result).toEqual({});
    expect(client.from).not.toHaveBeenCalled();
  });

  it('flag on, no candidates (no stored revision): returns {} without reading', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const client = makeClient([LIVE_INSIGHT_ROW]);

    const result = await computeEvidenceRevisionStatuses(client.client, [
      { id: 'fa-1', from_insight_id: 'insight-1', evidence_revision: null },
      { id: 'fa-2', from_insight_id: null, evidence_revision: 'abc' },
    ]);

    expect(result).toEqual({});
    expect(client.from).not.toHaveBeenCalled();
  });

  it('flag on, stored matches live: reports "match"', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const client = makeClient([LIVE_INSIGHT_ROW]);

    const result = await computeEvidenceRevisionStatuses(client.client, [
      { id: 'fa-1', from_insight_id: 'insight-1', evidence_revision: LIVE_FINGERPRINT },
    ]);

    expect(result).toEqual({ 'fa-1': 'match' });
  });

  it('flag on, stored differs from live: reports "changed"', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const client = makeClient([LIVE_INSIGHT_ROW]);

    const result = await computeEvidenceRevisionStatuses(client.client, [
      { id: 'fa-1', from_insight_id: 'insight-1', evidence_revision: 'stale-fingerprint' },
    ]);

    expect(result).toEqual({ 'fa-1': 'changed' });
  });

  it('flag on, the live insight is missing from the read (deleted/inaccessible): omits the id entirely', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const client = makeClient([]); // no rows returned for insight-1

    const result = await computeEvidenceRevisionStatuses(client.client, [
      { id: 'fa-1', from_insight_id: 'insight-1', evidence_revision: LIVE_FINGERPRINT },
    ]);

    expect(result).toEqual({});
  });

  it('flag on, the read errors: degrades to {} rather than throwing', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const client = makeClient([], { message: 'boom' });

    const result = await computeEvidenceRevisionStatuses(client.client, [
      { id: 'fa-1', from_insight_id: 'insight-1', evidence_revision: LIVE_FINGERPRINT },
    ]);

    expect(result).toEqual({});
  });

  it('batches distinct insight ids into a single .in() read for multiple focus areas', async () => {
    isFlagEnabledMock.mockReturnValue(true);
    const client = makeClient([LIVE_INSIGHT_ROW]);

    await computeEvidenceRevisionStatuses(client.client, [
      { id: 'fa-1', from_insight_id: 'insight-1', evidence_revision: LIVE_FINGERPRINT },
      { id: 'fa-2', from_insight_id: 'insight-1', evidence_revision: 'stale' },
    ]);

    expect(client._inFn).toHaveBeenCalledTimes(1);
    expect(client._inFn).toHaveBeenCalledWith('id', ['insight-1']);
  });
});
