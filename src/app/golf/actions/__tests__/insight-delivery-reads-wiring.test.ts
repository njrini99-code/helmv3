/**
 * CoachHelm Slice 0 delivery wiring (flag `coachhelm_reads_v1_copy`). Off
 * (the registry value everywhere): the feeds are what they were. On: the
 * player feed, the coach feed, the roster sweep and the Hub pick fold
 * overlapping reads and hold each player to 3 open reads + 1 strength;
 * `includeMore` (the Clubhouse Board and Deep dive) keeps the rest.
 * Synthetic fixtures only.
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

const flagOn = { value: false };
vi.mock('@/lib/flags/is-enabled', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/flags/is-enabled')>();
  return {
    ...actual,
    isFlagEnabled: (id: string, ctx?: Parameters<typeof actual.isFlagEnabled>[1]) =>
      id === 'coachhelm_reads_v1_copy' ? flagOn.value : actual.isFlagEnabled(id, ctx),
  };
});

import {
  getInsightsForCoachWithMeta,
  getInsightsForPlayer,
  getTopInsightForPlayer,
  getTopInsightsForPlayers,
} from '@/app/golf/actions/insight-delivery';
import { evaluateFlag } from '@/lib/flags/is-enabled';

/** A finding: behind its Tour comparison, medium priority; `impact` orders the feed. */
function row(id: string, metric: string, impact: number, over: Record<string, unknown> = {}) {
  return {
    id,
    player_id: 'p1',
    category: 'putting',
    insight_type: 'putt_distance',
    title: `Title ${id}`,
    content: `Content ${id}.`,
    signature: `v3:x:${id}`,
    evidence: {
      metric,
      metric_label: metric,
      unit: 'percent',
      your_value: 40,
      comparison_value: 60,
      comparison_source: 'pga_baseline',
      strokes_impact: impact,
      strokes_impact_method: 'peer_delta',
      confidence: 0.8,
      sample_n: 40,
    },
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    outcome_status: null,
    outcome_measured_at: null,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    drill_attachments: null,
    ...over,
  };
}

/** Five findings, one of them a penalties read the driver read folds in, and two strengths. */
const ROWS = [
  row('tee', 'sg_ott', 2.5, {
    category: 'tee',
    insight_type: 'tee_strategy',
    signature: 'v3:tee_strategy:tee_strategy:laggy',
    title: 'Driver may be costing you more than it gains',
    priority: 'high',
  }),
  row('pen', 'penalty_rate_per_round', 2.0, {
    category: 'course_management',
    insight_type: 'course_management',
    title: 'Penalty strokes: 0.8 per round',
    evidence: { metric: 'penalty_rate_per_round', unit: 'count', your_value: 0.8, comparison_value: 0.3, comparison_source: 'pga_baseline', strokes_impact: 2.0, strokes_impact_method: 'peer_delta', confidence: 0.8, sample_n: 9 },
  }),
  row('f2', 'putts_made_10_15ft_pct', 1.5),
  row('f3', 'putts_made_3_5ft_pct', 1.2),
  row('f4', 'putts_made_25_plus_ft_pct', 1.0),
  row('s1', 'putts_made_5_10ft_pct', 0.6, { priority: 'low', evidence: { metric: 'putts_made_5_10ft_pct', unit: 'percent', your_value: 80, comparison_value: 60, comparison_source: 'pga_baseline', strokes_impact: 0.6, strokes_impact_method: 'peer_delta', confidence: 0.8, sample_n: 40 } }),
  row('s2', 'putts_made_15_25ft_pct', 0.5, { priority: 'low', evidence: { metric: 'putts_made_15_25ft_pct', unit: 'percent', your_value: 80, comparison_value: 60, comparison_source: 'pga_baseline', strokes_impact: 0.5, strokes_impact_method: 'peer_delta', confidence: 0.8, sample_n: 40 } }),
];

function makeClient(insightRows: unknown[]) {
  const make = (data: unknown[]) => {
    const terminal = { data, error: null };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'not', 'or', 'in', 'eq', 'neq', 'gte', 'lte', 'is', 'order', 'limit', 'range', 'abortSignal']) {
      b[m] = vi.fn(() => b);
    }
    b.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    b.then = (resolve: (v: typeof terminal) => void) => Promise.resolve(resolve(terminal));
    return b;
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    from: vi.fn((table: string) => make(table === 'golf_coach_insights' ? insightRows : [])),
  } as unknown as SupabaseClient;
}

const ids = (list: Array<{ id: string }>) => list.map((i) => i.id);

describe('coachhelm_reads_v1_copy', () => {
  it('is registered and off in every environment', () => {
    for (const environment of ['production', 'preview', 'development'] as const) {
      expect(evaluateFlag('coachhelm_reads_v1_copy', { environment, skipTelemetry: true })).toEqual({
        value: false,
        reason: 'environment_rollout',
      });
    }
  });
});

const STRENGTHS = new Set(['s1', 's2']);

/**
 * What delivery should keep, from the flag-off order: the lower-ranked of the
 * driver and penalties reads folds into the higher one, then the first 3
 * findings and the first strength, in that order.
 */
function expectedKept(offOrder: string[], cap = true): { kept: string[]; leader: string; folded: string } {
  const leader = offOrder.indexOf('tee') < offOrder.indexOf('pen') ? 'tee' : 'pen';
  const folded = leader === 'tee' ? 'pen' : 'tee';
  const unfolded = offOrder.filter((id) => id !== folded);
  if (!cap) return { kept: unfolded, leader, folded };
  let findings = 0;
  let strengths = 0;
  const kept = unfolded.filter((id) => {
    if (STRENGTHS.has(id)) return strengths++ < 1;
    return findings++ < 3;
  });
  return { kept, leader, folded };
}

const FOLDED_TITLE: Record<string, string> = {
  tee: 'Driver may be costing you more than it gains',
  pen: 'Penalty strokes: 0.8 per round',
};

async function offOrder(): Promise<string[]> {
  flagOn.value = false;
  const out = await getInsightsForPlayer('p1', { limit: 20 }, makeClient(ROWS));
  return ids(out);
}

describe('delivery with the flag off: unchanged', () => {
  beforeEach(() => {
    flagOn.value = false;
  });

  it('the player feed keeps every read, unfolded and uncapped', async () => {
    const out = await getInsightsForPlayer('p1', { limit: 20 }, makeClient(ROWS));
    expect([...ids(out)].sort()).toEqual(['f2', 'f3', 'f4', 'pen', 's1', 's2', 'tee']);
    expect(out.every((i) => i.also === undefined && i.content === `Content ${i.id}.`)).toBe(true);
  });
});

describe('delivery with the flag on', () => {
  it('the player feed folds driver and penalties into one read and holds 3 open + 1 strength', async () => {
    const { kept, leader, folded } = expectedKept(await offOrder());
    flagOn.value = true;
    const out = await getInsightsForPlayer('p1', { limit: 20 }, makeClient(ROWS));
    expect(ids(out)).toEqual(kept);
    expect(kept).toHaveLength(4);
    const head = out.find((i) => i.id === leader)!;
    expect(head.also).toEqual([{ id: folded, title: FOLDED_TITLE[folded], relation: 'overlap' }]);
    expect(head.content).toBe(`Content ${leader}. Also in this read: “${FOLDED_TITLE[folded]}”.`);
  });

  it('includeMore keeps the reads past 3 + 1 (folded all the same)', async () => {
    const { kept } = expectedKept(await offOrder(), false);
    flagOn.value = true;
    const out = await getInsightsForPlayer('p1', { limit: 20, includeMore: true }, makeClient(ROWS));
    expect(ids(out)).toEqual(kept);
    expect(kept).toHaveLength(6);
  });

  it('the coach feed keeps the same 3 + 1 and counts what it keeps', async () => {
    const { kept } = expectedKept(await offOrder());
    flagOn.value = true;
    const res = await getInsightsForCoachWithMeta('coach-1', { player_id: 'p1' }, makeClient(ROWS));
    expect(res.ok && ids(res.data)).toEqual(kept);
    expect(res.ok && res.total).toBe(4);
  });

  it('the coach team sweep caps each player on their own', async () => {
    flagOn.value = true;
    const other = ROWS.map((r) => ({ ...r, id: `q-${r.id}`, player_id: 'p2' }));
    const res = await getInsightsForCoachWithMeta('coach-1', { limit: 100 }, makeClient([...ROWS, ...other]));
    expect(res.ok && res.data.filter((i) => i.player_id === 'p1').length).toBe(4);
    expect(res.ok && res.data.filter((i) => i.player_id === 'p2').length).toBe(4);
  });

  it('the roster sweep and the Hub pick lead with the feed head, folded', async () => {
    const { kept, folded } = expectedKept(await offOrder());
    flagOn.value = true;
    const roster = await getTopInsightsForPlayers(['p1'], { limit: 5 }, makeClient(ROWS));
    expect(ids(roster.get('p1') ?? [])).toEqual(kept);
    const top = await getTopInsightForPlayer('p1', makeClient(ROWS));
    expect(top?.id).toBe(kept[0]);
    if (top?.id === 'tee' || top?.id === 'pen') expect(top.also?.map((a) => a.id)).toEqual([folded]);
  });
});

