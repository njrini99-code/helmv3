/**
 * Sentry JAVASCRIPT-NEXTJS-R2 — N+1 on `golf_insight_exposure`,
 * `GET /golf/dashboard/stats/team` (and every other roster sweep).
 *
 * `getTopInsightsForPlayers` recorded exposure INSIDE its per-player loop, so a
 * roster of N players fired N `recordInsightExposure` calls — each one a dedup
 * read on `golf_insight_exposure` plus an insert. That is the repeated
 * `from(golf_insight_exposure)` span Sentry flagged, and N concurrent
 * fire-and-forget writes are also how the ledger's `fetch failed` rows
 * (f34bc102) arrive in bursts.
 *
 * Contract: ONE ledger call per sweep, carrying every player's rows with their
 * per-player rank_position preserved.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    throw new Error('test passes supabaseOverride; createClient must not be called');
  }),
}));

const recordInsightExposure = vi.fn(async (_rows: unknown[]) => undefined);
vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/effectiveness/event-ledger')>();
  return { ...actual, recordInsightExposure: (rows: unknown[]) => recordInsightExposure(rows) };
});

import { getTopInsightsForPlayers } from '@/app/golf/actions/insight-delivery';

function row(id: string, playerId: string, metric: string) {
  return {
    id,
    player_id: playerId,
    category: 'approach',
    insight_type: 'approach_proximity',
    title: `Title ${id}`,
    content: `Content ${id}`,
    signature: 'v3:x',
    evidence: { metric, metric_label: metric, strokes_impact: 0.5, confidence: 0.8, sample_n: 20 },
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    outcome_status: null,
    outcome_measured_at: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    drill_attachments: null,
  };
}

function makeClient(insightRows: unknown[]) {
  const make = (data: unknown[]) => {
    const terminal = { data, error: null };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'not', 'or', 'in', 'eq', 'neq', 'gte', 'lte', 'is', 'order', 'limit', 'range']) {
      b[m] = vi.fn(() => b);
    }
    b.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    b.then = (resolve: (v: typeof terminal) => void) => Promise.resolve(resolve(terminal));
    return b;
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'coach-1' } }, error: null })) },
    // Insights for the sweep; every other table (e.g. calibration) reads empty.
    from: vi.fn((table: string) => make(table === 'golf_coach_insights' ? insightRows : [])),
  } as unknown as SupabaseClient;
}

describe('getTopInsightsForPlayers — exposure ledger is written once per sweep (Sentry R2)', () => {
  beforeEach(() => recordInsightExposure.mockClear());

  it('records every player\'s head insight in ONE recordInsightExposure call', async () => {
    const rows = [
      row('i-1', 'p-1', 'approach_125_175'),
      row('i-2', 'p-2', 'approach_125_175'),
      row('i-3', 'p-3', 'approach_125_175'),
    ];
    const out = await getTopInsightsForPlayers(['p-1', 'p-2', 'p-3'], {}, makeClient(rows));

    expect([...out.keys()].sort()).toEqual(['p-1', 'p-2', 'p-3']);
    expect(recordInsightExposure).toHaveBeenCalledTimes(1);
    const written = recordInsightExposure.mock.calls[0]?.[0] as Array<{
      insight_id: string;
      player_id: string;
      surface: string;
      rank_position: number;
    }>;
    expect(written.map((r) => r.insight_id).sort()).toEqual(['i-1', 'i-2', 'i-3']);
    // rank_position stays per-player: each player's head insight is position 0.
    expect(written.every((r) => r.rank_position === 0 && r.surface === 'roster_card')).toBe(true);
  });

  it('records the rank_score each roster pick was ranked on (audit row 51)', async () => {
    const out = await getTopInsightsForPlayers(['p-1'], {}, makeClient([row('i-1', 'p-1', 'approach_125_175')]));
    expect(out.get('p-1')?.[0]?.id).toBe('i-1');
    const written = recordInsightExposure.mock.calls[0]?.[0] as Array<{ rank_score?: number }>;
    // 0.5 strokes × 0.8 confidence × neutral weight/goal/coachability × full damping.
    expect(written[0]?.rank_score).toBeCloseTo(0.4, 6);
  });

  it('never reads the calibration table while ranking (defect 4: explicit no-op)', async () => {
    const client = makeClient([row('i-1', 'p-1', 'approach_125_175')]);
    await getTopInsightsForPlayers(['p-1'], {}, client);
    const tables = (client.from as unknown as { mock: { calls: unknown[][] } }).mock.calls.map((c) => c[0]);
    expect(tables).not.toContain('golf_confidence_calibration');
  });

  it('writes nothing when no player has a visible insight', async () => {
    await getTopInsightsForPlayers(['p-1', 'p-2'], {}, makeClient([]));
    expect(recordInsightExposure).not.toHaveBeenCalled();
  });
});
