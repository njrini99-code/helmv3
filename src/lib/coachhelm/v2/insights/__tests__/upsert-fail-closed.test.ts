/**
 * A failed read of the existing rows must not look like "no rows": the
 * insert would mint a duplicate of the same issue. upsertInsight fails
 * closed (logs, throws a retryable error, writes nothing). Synthetic data.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InsightOwnershipLookupError, upsertInsight } from '@/lib/coachhelm/v2/insights/upsert';
import { classifyThrown } from '@/lib/coachhelm/v3/engine/analysis-outcome';
import type { InsightEvidence, InsightInput } from '@/lib/coachhelm/v2/insights/types';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/notifications/insight-notifier', () => ({
  notifyInsightLanded: vi.fn(async () => undefined),
}));

import { logServerError } from '@/lib/server-error-logger';

const evidence: InsightEvidence = {
  metric: 'putt_make_rate_6_10ft',
  metric_label: 'Make rate from 6-10ft',
  unit: 'percent',
  your_value: 0.3,
  your_value_display: '30%',
  comparison_value: 0.48,
  comparison_label: 'Your baseline',
  comparison_source: 'your_baseline',
  sample_n: 25,
  window_days: 30,
  window_start: new Date(Date.now() - 30 * 86400e3).toISOString(),
  window_end: new Date().toISOString(),
  strokes_impact: 0.5,
  strokes_impact_method: 'peer_delta',
  confidence: 0,
  confidence_factors: { sample_adequacy: 1, recency: 1, variance: 1 },
};

const input = (overrides: Partial<InsightInput> = {}): InsightInput => ({
  player_id: 'player-1',
  category: 'putting',
  insight_type: 'pattern',
  signature: 'fail-closed-sig',
  title: 'Title',
  content: 'Content',
  evidence,
  metadata: {},
  ...overrides,
});

type Resp = { data: unknown; error: { message: string; code?: string } | null };

function fake(opts: {
  teamMember?: () => Promise<Resp>;
  dedupLookup?: Resp;
}) {
  const inserted: unknown[] = [];
  const updated: unknown[] = [];
  const ownershipChain = (resp: () => Promise<Resp>) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: resp,
    };
    return chain;
  };
  return {
    inserted,
    updated,
    from(table: string) {
      if (table === 'golf_team_members') {
        return ownershipChain(opts.teamMember ?? (async () => ({ data: { team_id: 'team-1' }, error: null })));
      }
      if (table === 'golf_team_coach_staff') {
        return ownershipChain(async () => ({ data: { coach_id: 'coach-1' }, error: null }));
      }
      if (table === 'golf_coach_insights') {
        const lookup = {
          select: () => lookup,
          eq: () => lookup,
          is: () => lookup,
          order: () => lookup,
          limit: async () => opts.dedupLookup ?? { data: [], error: null },
        };
        return {
          select: () => lookup,
          upsert: (payload: unknown) => ({
            select: () => ({
              maybeSingle: async () => {
                inserted.push(payload);
                return { data: { id: `ins-${inserted.length}` }, error: null };
              },
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('upsertInsight fails closed on a failed read', () => {
  it('a dedup lookup error writes nothing, is logged, and is retryable', async () => {
    const db = fake({
      dedupLookup: { data: null, error: { message: 'Could not query the database for the schema cache', code: 'PGRST002' } },
    });
    const err = await upsertInsight(db as never, input()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InsightOwnershipLookupError);
    expect(db.inserted).toHaveLength(0);
    expect(classifyThrown(err).kind).toBe('retryable_failure');
    expect(vi.mocked(logServerError)).toHaveBeenCalledWith(
      expect.stringContaining('dedup lookup failed'),
      expect.objectContaining({ action: 'coachhelm.upsert.dedupLookup' }),
      'warning',
    );
  });

  it('an ownership lookup that throws (not returns an error) writes nothing', async () => {
    const db = fake({
      teamMember: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const err = await upsertInsight(db as never, input()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InsightOwnershipLookupError);
    expect(db.inserted).toHaveLength(0);
    expect(classifyThrown(err).kind).toBe('retryable_failure');
  });

  it('normal path is unchanged: no existing row inserts once with the resolved owner', async () => {
    const db = fake({});
    await expect(upsertInsight(db as never, input())).resolves.toBe('ins-1');
    expect(db.inserted).toHaveLength(1);
    expect(db.inserted[0]).toMatchObject({ coach_id: 'coach-1', team_id: 'team-1', signature: 'fail-closed-sig' });
    expect(vi.mocked(logServerError)).not.toHaveBeenCalled();
  });
});
