import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn().mockResolvedValue(undefined), logServerEvent: vi.fn().mockResolvedValue(undefined), logServerException: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock('@/lib/auth/verify-player-access', () => ({ verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'self' })) }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoals: vi.fn(async () => []), loadRecentlyAchievedGoals: vi.fn(async () => []) }));
const recorded = vi.hoisted(() => vi.fn(async (_rows: Array<{ insight_id: string; surface: string; rank_position?: number }>) => undefined));
vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', () => ({ recordInsightExposure: recorded, recordInsightAction: vi.fn(async () => undefined) }));

import { getInsightsForPlayer, type EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { shapePlayerFeed } from '../player-feed';

const evidence = (over: Record<string, unknown> = {}) => ({
  metric: 'putt_make_rate_6_10ft',
  metric_label: '6-10 ft make rate',
  unit: 'percent',
  your_value: 0.38,
  your_value_display: '38%',
  comparison_value: 0.52,
  comparison_label: 'D2 average',
  comparison_source: 'd2_avg',
  sample_n: 47,
  window_days: 30,
  window_start: '2026-03-23T00:00:00.000Z',
  window_end: '2026-04-22T00:00:00.000Z',
  strokes_impact: 2.1,
  strokes_impact_method: 'peer_delta',
  confidence: 0.78,
  confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
  ...over,
});
const row = (id: string, metric: string, impact: number, over: Record<string, unknown> = {}) => ({
  id,
  player_id: 'p-1',
  title: id,
  content: 'c',
  category: 'putting',
  signature: null,
  evidence: evidence({ metric, strokes_impact: impact, ...over }),
  metadata: null,
  lifecycle_state: 'active',
  status: 'active',
  priority: 'normal',
  acknowledged_at: null,
  resolved_at: null,
  created_at: '2026-05-01T00:00:00.000Z',
  updated_at: '2026-05-01T00:00:00.000Z',
  drill_attachments: [],
});
const ROWS = [row('low', 'putt_make_rate_3_5ft', 0.4), row('high', 'putt_make_rate_6_10ft', 3.5), row('mid', 'gir_pct', 1.5), row('hidden', 'fairway_pct', 1, { support: { word: 'Solid' }, ladder: [1] })];

type Op = { table: string; op: string };
function fake(feedback: Array<{ insight_id: string; rating: string; created_at: string }> = []) {
  const ops: Op[] = [];
  const builder = (table: string, terminal: unknown) => {
    const node: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'not', 'or', 'in', 'neq', 'order', 'limit', 'range', 'contains', 'gte', 'lte', 'abortSignal', 'is']) node[m] = () => node;
    for (const m of ['insert', 'upsert', 'update', 'delete']) {
      node[m] = () => {
        ops.push({ table, op: m });
        return node;
      };
    }
    node.maybeSingle = async () => ({ data: null, error: null });
    node.then = (resolve: (v: unknown) => void) => Promise.resolve(resolve(terminal));
    return node;
  };
  const tables: string[] = [];
  return {
    ops,
    tables,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null })) },
    from: (table: string) => {
      tables.push(table);
      if (table === 'golf_coach_insights') return builder(table, { data: ROWS, error: null });
      if (table === 'golf_insight_player_feedback') return builder(table, { data: feedback, error: null });
      return builder(table, { data: [], error: null });
    },
  };
}

const raw = () => ROWS.map((r) => r as unknown as EvidenceInsight);

beforeEach(() => {
  recorded.mockClear();
});

/** Coachhelm-lenses PR 5a, 02 section 6. */
describe('shapePlayerFeed', () => {
  it('writes nothing, and never touches the exposure table', async () => {
    const sb = fake();
    await shapePlayerFeed(sb as never, 'p-1', raw(), { limit: 10 });
    expect(sb.ops).toEqual([]);
    expect(sb.tables).not.toContain('golf_insight_exposure');
    expect(recorded).not.toHaveBeenCalled();
  });

  it('ranks by impact and caps at the limit, after the overlay', async () => {
    const { shown } = await shapePlayerFeed(fake() as never, 'p-1', raw(), { limit: 2 });
    expect(shown).toHaveLength(2);
    expect(shown[0]!.id).toBe('high');
    expect(shown.map((i) => i.id)).not.toContain('low');
  });

  it('a dismissed row does not take a slot', async () => {
    const sb = fake([{ insight_id: 'high', rating: 'dismissed', created_at: '2026-05-02T00:00:00.000Z' }]);
    const { shown } = await shapePlayerFeed(sb as never, 'p-1', raw(), { limit: 2 });
    expect(shown).toHaveLength(2);
    expect(shown.map((i) => i.id)).not.toContain('high');
  });
});

describe('getInsightsForPlayer after the move', () => {
  const settled = () => new Promise((r) => setTimeout(r, 0));

  it('returns the shape function’s ids in the shape function’s order', async () => {
    const { shown } = await shapePlayerFeed(fake() as never, 'p-1', raw(), { limit: 10 });
    const out = await getInsightsForPlayer('p-1', {}, fake() as never);
    expect(out.map((i) => i.id)).toEqual(shown.map((i) => i.id));
    expect(out[0]!.id).toBe('high');
  });

  it('records one player_feed exposure per returned row, once, in rank order', async () => {
    const out = await getInsightsForPlayer('p-1', {}, fake() as never);
    await settled();
    expect(recorded).toHaveBeenCalledTimes(1);
    const rows = recorded.mock.calls[0]![0];
    expect(rows.map((r) => r.insight_id)).toEqual(out.map((i) => i.id));
    expect(new Set(rows.map((r) => r.surface))).toEqual(new Set(['player_feed']));
  });

  it('with drawnLater, records only the ids drawn', async () => {
    await getInsightsForPlayer('p-1', { drawnLater: async () => ['mid'] }, fake() as never);
    await settled();
    expect(recorded.mock.calls[0]![0].map((r) => r.insight_id)).toEqual(['mid']);
  });

  it('with a rejected drawnLater, records nothing and still returns the rows', async () => {
    const out = await getInsightsForPlayer('p-1', { drawnLater: async () => Promise.reject(new Error('no')) }, fake() as never);
    await settled();
    expect(recorded).not.toHaveBeenCalled();
    expect(out.length).toBeGreaterThan(0);
  });

  it('still projects the coach-only evidence keys off the player’s rows', async () => {
    const out = await getInsightsForPlayer('p-1', {}, fake() as never);
    const hidden = out.find((i) => i.id === 'hidden')!.evidence as unknown as Record<string, unknown>;
    expect('support' in hidden).toBe(false);
    expect('ladder' in hidden).toBe(false);
  });
});

describe('the seam', () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
  it('player-feed is server-only, not an action file, and carries no exposure write', () => {
    const feed = src('src/lib/coachhelm/delivery/player-feed.ts');
    expect(feed.startsWith("import 'server-only';")).toBe(true);
    expect(feed).not.toMatch(/['"]use server['"]/);
    expect(feed).not.toMatch(/golf_insight_exposure'|recordInsightExposure|recordExposureForReturned/);
  });
  it('the action file keeps the one exposure write and calls the shape function', () => {
    const action = src('src/app/golf/actions/insight-delivery.ts');
    expect(action).toMatch(/await shapePlayerFeed\(supabase, playerId, filtered/);
    expect(action.match(/'player_feed'/g)?.length).toBeGreaterThanOrEqual(1);
    expect(action).not.toMatch(/function (applyPlayerFeedbackOverlay|loadPlayerFeedbackByInsight|readsDeliveryPlan|canaryReadsDeliveryPlan)\b/);
  });
});
