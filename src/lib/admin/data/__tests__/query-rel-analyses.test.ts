/**
 * The Reliability tab shows Sentry/Vercel signals but, until 2026-08-28, never
 * their root-cause analysis — those live in admin_events under
 * `fingerprint = 'rel:' + signature` and had no surface at all. queryRelAnalyses
 * is that lookup. These tests pin the identity translation (signature <-> rel:
 * key) and the fail-soft contract, which are the two ways it silently breaks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RcaAnalysis } from '@/lib/admin/rca';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));

import { queryRelAnalyses } from '@/lib/admin/data/reliability';

function analysis(over: Partial<RcaAnalysis> = {}): RcaAnalysis {
  return {
    probableCause: 'because',
    suspectFiles: [],
    suggestedFix: 'FIX HERE — do the thing',
    confidence: 'medium',
    relatedFingerprints: [],
    model: 'claude-sonnet-5',
    generatedAt: '2026-08-28T02:00:00.000Z',
    ...over,
  };
}

/** A thenable query stub resolving to { data, error }. */
function queryResult(result: { data: unknown; error: unknown }) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order']) {
    q[m] = vi.fn(() => q);
  }
  q.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return q;
}

beforeEach(() => fromMock.mockReset());

describe('queryRelAnalyses', () => {
  it('returns an empty map without querying when given no signatures', async () => {
    const out = await queryRelAnalyses([]);
    expect(out.size).toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('keys results by BARE signature, translating the rel: fingerprint back', async () => {
    fromMock.mockReturnValue(
      queryResult({
        data: [{ fingerprint: 'rel:79327965', metadata: analysis({ probableCause: 'grant missing' }), created_at: 't2' }],
        error: null,
      }),
    );
    const out = await queryRelAnalyses(['79327965']);
    expect(out.get('79327965')?.probableCause).toBe('grant missing');
    // never keyed by the rel: form
    expect(out.has('rel:79327965')).toBe(false);
  });

  it('keeps the NEWEST analysis per signature (query orders desc; first wins)', async () => {
    fromMock.mockReturnValue(
      queryResult({
        data: [
          { fingerprint: 'rel:abc', metadata: analysis({ suggestedFix: 'ALREADY FIXED — newest' }), created_at: 't2' },
          { fingerprint: 'rel:abc', metadata: analysis({ suggestedFix: 'FIX HERE — older' }), created_at: 't1' },
        ],
        error: null,
      }),
    );
    const out = await queryRelAnalyses(['abc']);
    expect(out.get('abc')?.suggestedFix).toBe('ALREADY FIXED — newest');
  });

  it('fails soft — a query error yields an empty map, never throws', async () => {
    fromMock.mockReturnValue(queryResult({ data: null, error: { message: 'boom' } }));
    const out = await queryRelAnalyses(['abc']);
    expect(out.size).toBe(0);
  });

  it('skips rows whose metadata is not a valid analysis rather than crashing', async () => {
    fromMock.mockReturnValue(
      queryResult({
        data: [
          { fingerprint: 'rel:good', metadata: analysis(), created_at: 't' },
          { fingerprint: 'rel:bad', metadata: { junk: true }, created_at: 't' },
        ],
        error: null,
      }),
    );
    const out = await queryRelAnalyses(['good', 'bad']);
    expect(out.has('good')).toBe(true);
    expect(out.has('bad')).toBe(false);
  });
});
