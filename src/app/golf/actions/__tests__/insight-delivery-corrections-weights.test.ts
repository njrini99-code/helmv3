/**
 * CoachHelm Slice 6a (`coachhelm_corrections_v1`): the coach team feed
 * (`getInsightsForCoach` without a player) and the roster cards
 * (`getTopInsightsForPlayers`) rank several players at once. They load every
 * player's coach weights in ONE batched call (`loadCoachWeightsForPlayers`)
 * and apply them per player. Flag off, that loader returns an empty map and
 * both paths rank with neutral weights exactly as before.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    throw new Error('tests pass supabaseOverride');
  }),
}));
vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/effectiveness/event-ledger')>();
  return { ...actual, recordInsightExposure: vi.fn(async () => undefined) };
});

const h = vi.hoisted(() => ({
  loadCoachWeightsForPlayers: vi.fn(),
  loadCoachWeightsForPlayer: vi.fn(async () => ({})),
}));
vi.mock('@/lib/coachhelm/v3/ranking/score', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/ranking/score')>();
  return {
    ...actual,
    loadCoachWeightsForPlayer: h.loadCoachWeightsForPlayer,
    loadCoachWeightsForPlayers: h.loadCoachWeightsForPlayers,
  };
});
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({
  loadActiveGoals: vi.fn(async () => []),
}));

import { getInsightsForCoach, getTopInsightsForPlayers } from '@/app/golf/actions/insight-delivery';

function row(id: string, playerId: string, kind: 'approach' | 'putt') {
  const approach = kind === 'approach';
  return {
    id,
    player_id: playerId,
    category: approach ? 'approach' : 'putting',
    insight_type: approach ? 'approach_proximity' : 'putt_distance',
    title: `Title ${id}`,
    content: `Content ${id}`,
    signature: 'v3:x',
    evidence: {
      metric: approach ? 'approach_125_175' : 'putt_6_10',
      metric_label: approach ? 'approach_125_175' : 'putt_6_10',
      // Neutral scores: approach 0.5 x 0.8 = 0.40, putt 0.4 x 0.8 = 0.32.
      strokes_impact: approach ? 0.5 : 0.4,
      confidence: 0.8,
      sample_n: 20,
    },
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

const ROWS = [
  row('a-1', 'p-1', 'approach'),
  row('b-1', 'p-1', 'putt'),
  row('a-2', 'p-2', 'approach'),
  row('b-2', 'p-2', 'putt'),
];

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
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'coach-user-1' } }, error: null })) },
    from: vi.fn((table: string) => make(table === 'golf_coach_insights' ? insightRows : [])),
  } as unknown as SupabaseClient;
}

// p-1's primary coach keeps rejecting approach reads: W 0.5 halves them.
const P1_WEIGHTS = new Map([['p-1', { approach_proximity: 0.5 }]]);

beforeEach(() => {
  h.loadCoachWeightsForPlayers.mockReset();
  h.loadCoachWeightsForPlayer.mockClear();
});

describe('roster cards (getTopInsightsForPlayers)', () => {
  it('applies each player’s weights from one batched load', async () => {
    h.loadCoachWeightsForPlayers.mockResolvedValue(P1_WEIGHTS);
    const out = await getTopInsightsForPlayers(['p-1', 'p-2'], { limit: 1 }, makeClient(ROWS));
    expect(out.get('p-1')?.[0]?.id).toBe('b-1');
    expect(out.get('p-2')?.[0]?.id).toBe('a-2');
    expect(h.loadCoachWeightsForPlayers).toHaveBeenCalledTimes(1);
    expect([...(h.loadCoachWeightsForPlayers.mock.calls[0]?.[1] as string[])].sort()).toEqual(['p-1', 'p-2']);
    expect(h.loadCoachWeightsForPlayer).not.toHaveBeenCalled();
  });

  it('an empty map (flag off) ranks every player neutrally, as before', async () => {
    h.loadCoachWeightsForPlayers.mockResolvedValue(new Map());
    const out = await getTopInsightsForPlayers(['p-1', 'p-2'], { limit: 1 }, makeClient(ROWS));
    expect(out.get('p-1')?.[0]?.id).toBe('a-1');
    expect(out.get('p-2')?.[0]?.id).toBe('a-2');
  });

  it('a failing load degrades to neutral weights instead of failing the roster', async () => {
    h.loadCoachWeightsForPlayers.mockRejectedValue(new Error('boom'));
    const out = await getTopInsightsForPlayers(['p-1', 'p-2'], { limit: 1 }, makeClient(ROWS));
    expect(out.get('p-1')?.[0]?.id).toBe('a-1');
  });
});

describe('coach team feed (getInsightsForCoach without a player)', () => {
  it('applies each player’s weights per insight from one batched load', async () => {
    h.loadCoachWeightsForPlayers.mockResolvedValue(P1_WEIGHTS);
    const out = await getInsightsForCoach('coach-1', {}, makeClient(ROWS));
    const ids = out.map((r) => r.id);
    // a-2 0.40 > b-1, b-2 0.32 > a-1 0.20
    expect(ids[0]).toBe('a-2');
    expect(ids[ids.length - 1]).toBe('a-1');
    expect(h.loadCoachWeightsForPlayers).toHaveBeenCalledTimes(1);
    expect(h.loadCoachWeightsForPlayer).not.toHaveBeenCalled();
  });

  it('an empty map (flag off) keeps the neutral order', async () => {
    h.loadCoachWeightsForPlayers.mockResolvedValue(new Map());
    const out = await getInsightsForCoach('coach-1', {}, makeClient(ROWS));
    const ids = out.map((r) => r.id);
    expect(ids.slice(0, 2).sort()).toEqual(['a-1', 'a-2']);
    expect(ids.slice(2).sort()).toEqual(['b-1', 'b-2']);
  });
});
