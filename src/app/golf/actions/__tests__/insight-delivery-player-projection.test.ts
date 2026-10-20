/**
 * CoachHelm Slice 1b (finding 8): the support pass's coach-only evidence keys
 * never leave the server on a player path: the player feed, the Hub pick (its
 * urgent and normal branches) and the round takeaway. Exposure rows still
 * read them. Synthetic fixtures only.
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

vi.mock('@/lib/auth/verify-player-access', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/verify-player-access')>()),
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'self' })),
}));

vi.mock('@/lib/coachhelm/v3/effectiveness/event-ledger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/effectiveness/event-ledger')>();
  return { ...actual, recordInsightExposure: vi.fn(async () => undefined) };
});

import {
  getInsightsForPlayer,
  getRoundTakeawayInsight,
  getTopInsightForPlayer,
} from '@/app/golf/actions/insight-delivery';
import { PLAYER_HIDDEN_EVIDENCE_KEYS } from '@/lib/coachhelm/delivery/player-projection';

const STAMP = {
  support: { version: 'support_v1', q_adj: 0.02 },
  ladder: 'observed',
  what_ladder: 'observed',
  ladder_reasons: ['one_window_only'],
  strokes_shrunk: 0.5,
  shrink: { kappa: 30 },
};

function row(id: string, priority: 'urgent' | 'medium', impact: number) {
  return {
    id,
    player_id: 'p1',
    category: 'putting',
    insight_type: 'putt_distance',
    title: `Title ${id}`,
    content: `Content ${id}.`,
    signature: `v3:x:${id}`,
    evidence: {
      metric: `putts_made_${id}_pct`,
      metric_label: id,
      unit: 'percent',
      your_value: 40,
      comparison_value: 60,
      comparison_source: 'pga_baseline',
      strokes_impact: impact,
      strokes_impact_method: 'peer_delta',
      confidence: 0.8,
      sample_n: 40,
      ...STAMP,
    },
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority,
    acknowledged_at: null,
    resolved_at: null,
    outcome_status: null,
    outcome_measured_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    drill_attachments: null,
  };
}

function makeClient(insightRows: unknown[], round: unknown = null) {
  const make = (table: string, data: unknown[]) => {
    const terminal = { data, error: null };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'not', 'or', 'in', 'eq', 'neq', 'gte', 'lte', 'is', 'order', 'limit', 'range', 'abortSignal']) {
      b[m] = vi.fn(() => b);
    }
    b.maybeSingle = vi.fn(async () => ({ data: table === 'golf_rounds' ? round : null, error: null }));
    b.then = (resolve: (v: typeof terminal) => void) => Promise.resolve(resolve(terminal));
    return b;
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    from: vi.fn((table: string) => make(table, table === 'golf_coach_insights' ? insightRows : [])),
  } as unknown as SupabaseClient;
}

function expectStripped(evidence: unknown) {
  for (const k of PLAYER_HIDDEN_EVIDENCE_KEYS) expect(evidence).not.toHaveProperty(k);
  expect(evidence).toHaveProperty('metric');
}

beforeEach(() => vi.clearAllMocks());

describe('player paths strip the support pass keys (Slice 1b)', () => {
  it('player feed', async () => {
    const out = await getInsightsForPlayer('p1', {}, makeClient([row('a', 'medium', 1.2), row('b', 'medium', 0.8)]));
    expect(out.length).toBeGreaterThan(0);
    for (const i of out) expectStripped(i.evidence);
  });

  it('Hub pick, normal branch', async () => {
    const top = await getTopInsightForPlayer('p1', makeClient([row('a', 'medium', 1.2), row('b', 'medium', 0.8)]));
    expect(top).not.toBeNull();
    expectStripped(top!.evidence);
  });

  it('Hub pick, urgent branch', async () => {
    const top = await getTopInsightForPlayer('p1', makeClient([row('u', 'urgent', 0.4)]));
    expect(top?.id).toBe('u');
    expectStripped(top!.evidence);
  });

  it('round takeaway', async () => {
    const takeaway = await getRoundTakeawayInsight(
      'p1',
      'round-1',
      makeClient([row('a', 'medium', 1.2)], { round_date: '2026-10-01' }),
    );
    expect(takeaway).not.toBeNull();
    expectStripped(takeaway!.evidence);
  });
});
