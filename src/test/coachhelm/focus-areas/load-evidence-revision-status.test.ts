/**
 * A8 slice 3 fail-open fix: `computeEvidenceRevisionStatuses` must return
 * `null` when the live-insight read fails, distinct from `{}` ("asked,
 * nothing to compare" — flag off, or no candidate focus areas). Collapsing
 * both into `{}` made a failed read indistinguishable from "nothing
 * changed" and silently hid the evidence-changed warning — this is the
 * regression fail-open-audit.mjs caught (48 empty-collection-on-error
 * sites, baseline 47).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

const isFlagEnabledMock = vi.fn();
vi.mock('@/lib/flags', () => ({
  isFlagEnabled: (...args: unknown[]) => isFlagEnabledMock(...args),
}));

// Deterministic stand-in for the real hash: 'live-<id>' unless overridden.
const computeInsightEvidenceRevisionMock = vi.fn((row: { id: string }) => `live-${row.id}`);
vi.mock('@/lib/coachhelm/focus-areas/evidence-revision-source', () => ({
  computeInsightEvidenceRevision: (row: { id: string }) => computeInsightEvidenceRevisionMock(row),
}));

import { computeEvidenceRevisionStatuses } from '@/lib/coachhelm/focus-areas/load-evidence-revision-status';

function makeClient(rowsByInChunk: (ids: string[]) => { data: unknown; error: unknown }) {
  const inCalls: string[][] = [];
  return {
    client: {
      from: (_table: string) => ({
        select: (_cols: string) => ({
          in: (_col: string, ids: string[]) => {
            inCalls.push(ids);
            return Promise.resolve(rowsByInChunk(ids));
          },
        }),
      }),
    },
    inCalls,
  };
}

beforeEach(() => {
  isFlagEnabledMock.mockReset().mockReturnValue(true);
  computeInsightEvidenceRevisionMock.mockClear();
});

describe('computeEvidenceRevisionStatuses', () => {
  it('returns {} (not null) when the flag is off, without reading anything', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    const { client, inCalls } = makeClient(() => ({ data: [], error: null }));

    const result = await computeEvidenceRevisionStatuses(client as never, [
      { id: 'fa-1', from_insight_id: 'ins-1', evidence_revision: 'rev-1' },
    ]);

    expect(result).toEqual({});
    expect(inCalls).toEqual([]);
  });

  it('returns {} (not null) when there are no candidate focus areas', async () => {
    const { client, inCalls } = makeClient(() => ({ data: [], error: null }));

    const result = await computeEvidenceRevisionStatuses(client as never, [
      { id: 'fa-1', from_insight_id: null, evidence_revision: null },
    ]);

    expect(result).toEqual({});
    expect(inCalls).toEqual([]);
  });

  it('returns null, distinct from {}, when the live-insight read fails', async () => {
    const { client } = makeClient(() => ({ data: null, error: { message: 'boom' } }));

    const result = await computeEvidenceRevisionStatuses(client as never, [
      { id: 'fa-1', from_insight_id: 'ins-1', evidence_revision: 'rev-1' },
    ]);

    expect(result).toBeNull();
  });

  it('compares stored vs. live revisions on a successful read', async () => {
    const { client } = makeClient((ids) => ({
      data: ids.map((id) => ({ id, lifecycle_state: 'active', evidence: {}, engine_version: 1 })),
      error: null,
    }));
    // 'ins-1' recomputes to a DIFFERENT value than what was stored (changed);
    // 'ins-2' recomputes to exactly what was stored (match).
    computeInsightEvidenceRevisionMock.mockImplementation((row: { id: string }) =>
      row.id === 'ins-2' ? 'rev-2' : `live-${row.id}`,
    );

    const result = await computeEvidenceRevisionStatuses(client as never, [
      { id: 'fa-1', from_insight_id: 'ins-1', evidence_revision: 'rev-1' },
      { id: 'fa-2', from_insight_id: 'ins-2', evidence_revision: 'rev-2' },
    ]);

    expect(result).toEqual({ 'fa-1': 'changed', 'fa-2': 'match' });
  });

  it('chunks the insight-id list over 200 into separate .in() calls', async () => {
    const { client, inCalls } = makeClient((ids) => ({
      data: ids.map((id) => ({ id, lifecycle_state: 'active', evidence: {}, engine_version: 1 })),
      error: null,
    }));

    const focusAreas = Array.from({ length: 250 }, (_, i) => ({
      id: `fa-${i}`,
      from_insight_id: `ins-${i}`,
      evidence_revision: `rev-${i}`,
    }));

    const result = await computeEvidenceRevisionStatuses(client as never, focusAreas);

    expect(inCalls).toHaveLength(2);
    expect(inCalls[0]).toHaveLength(200);
    expect(inCalls[1]).toHaveLength(50);
    expect(result).not.toBeNull();
    expect(Object.keys(result ?? {})).toHaveLength(250);
  });

  it('short-circuits to null as soon as any chunk fails, not just the first/last', async () => {
    let call = 0;
    const { client, inCalls } = makeClient((ids) => {
      call += 1;
      if (call === 2) return { data: null, error: { message: 'boom on second chunk' } };
      return { data: ids.map((id) => ({ id, lifecycle_state: 'active', evidence: {}, engine_version: 1 })), error: null };
    });

    const focusAreas = Array.from({ length: 250 }, (_, i) => ({
      id: `fa-${i}`,
      from_insight_id: `ins-${i}`,
      evidence_revision: `rev-${i}`,
    }));

    const result = await computeEvidenceRevisionStatuses(client as never, focusAreas);

    expect(result).toBeNull();
    expect(inCalls).toHaveLength(2);
  });
});
