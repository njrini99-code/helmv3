/**
 * CoachHelm Slice 0 delivery wiring (flag `coachhelm_reads_v1_copy`). Off
 * (the registry value everywhere): the feeds and the exposure rows are what
 * they were. On: the player feed, the coach feed, the roster sweep, the Hub
 * pick, the round takeaway and the coach chat tool fold overlapping reads;
 * all but the chat tool then hold each player to 3 open reads + 1 strength
 * (`includeMore` keeps the rest); exposure rows carry the rank factors.
 * Synthetic fixtures only.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  getRoundTakeawayInsight,
  getTopInsightForPlayer,
  getTopInsightsForPlayers,
} from '@/app/golf/actions/insight-delivery';
import { evaluateFlag } from '@/lib/flags/is-enabled';
import { recordInsightExposure } from '@/lib/coachhelm/v3/effectiveness/event-ledger';
import { getPlayerInsights } from '@/lib/coachhelm/v3/chat/read-tools';
import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';

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

/** Five findings (driver and penalties are one story), two strengths and a note. */
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
  row('bal', 'putt_bias_ratio', 0.9, {
    insight_type: 'putt_bias',
    signature: 'v3:putt_bias:putt_bias:balanced',
    title: 'Misses are balanced left and right',
    priority: 'low',
  }),
];

interface ClientTables {
  /** `golf_insight_player_feedback` rows. */
  feedback?: unknown[];
  /** `golf_player_focus_areas` rows. */
  focus?: unknown[];
  /** The `golf_rounds` row a `.maybeSingle()` returns. */
  round?: unknown;
  /** `golf_team_members` rows (the HELM_COACHHELM_TEAMS canary's team read). */
  members?: unknown[];
  /** Fail the `golf_team_members` read. */
  membersError?: boolean;
}

/** Every builder call on `golf_coach_insights`, as [method, ...args]. */
let insightCalls: unknown[][] = [];

function makeClient(insightRows: unknown[], tables: ClientTables = {}) {
  const make = (table: string, data: unknown[]) => {
    const terminal =
      table === 'golf_team_members' && tables.membersError
        ? { data: null, error: { message: 'boom' } }
        : { data, error: null };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'not', 'or', 'in', 'eq', 'neq', 'gte', 'lte', 'is', 'order', 'limit', 'range', 'abortSignal']) {
      b[m] = vi.fn((...args: unknown[]) => {
        if (table === 'golf_coach_insights') insightCalls.push([m, ...args]);
        return b;
      });
    }
    b.maybeSingle = vi.fn(async () => ({ data: table === 'golf_rounds' ? (tables.round ?? null) : null, error: null }));
    b.then = (resolve: (v: typeof terminal) => void) => Promise.resolve(resolve(terminal));
    return b;
  };
  const rowsFor = (table: string): unknown[] => {
    if (table === 'golf_coach_insights') return insightRows;
    if (table === 'golf_insight_player_feedback') return tables.feedback ?? [];
    if (table === 'golf_player_focus_areas') return tables.focus ?? [];
    if (table === 'golf_team_members') return tables.members ?? [];
    return [];
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
    from: vi.fn((table: string) => make(table, rowsFor(table))),
  } as unknown as SupabaseClient;
}

const ids = (list: Array<{ id: string }>) => list.map((i) => i.id);

type ExposureArg = { insight_id: string; rank_score?: number; rank_factors?: Record<string, unknown> };

/** The rows the last `recordInsightExposure` call was handed. */
function lastExposure(): ExposureArg[] {
  const calls = vi.mocked(recordInsightExposure).mock.calls;
  return (calls.at(-1)?.[0] ?? []) as ExposureArg[];
}

/** The tables a client was asked for. */
const tablesRead = (client: SupabaseClient): string[] => vi.mocked(client.from).mock.calls.map(([t]) => String(t));

describe('coachhelm_reads_v1_copy', () => {
  it('is registered, on in production and preview (owner, 2026-10-31), off in development', () => {
    for (const environment of ['production', 'preview', 'development'] as const) {
      expect(evaluateFlag('coachhelm_reads_v1_copy', { environment, skipTelemetry: true })).toEqual({
        value: environment !== 'development',
        reason: 'environment_rollout',
      });
    }
  });
});

const STRENGTHS = new Set(['s1', 's2']);
const NOTES = new Set(['bal']);

/**
 * What delivery should keep, from the flag-off order: the lower-ranked of the
 * driver and penalties reads (both findings) folds into the higher one, then
 * the first 3 findings and the first strength, in that order; a note is never
 * one of them.
 */
function expectedKept(offOrder: string[], cap = true): { kept: string[]; leader: string; folded: string } {
  const leader = offOrder.indexOf('tee') < offOrder.indexOf('pen') ? 'tee' : 'pen';
  const folded = leader === 'tee' ? 'pen' : 'tee';
  const unfolded = offOrder.filter((id) => id !== folded);
  if (!cap) return { kept: unfolded, leader, folded };
  let findings = 0;
  let strengths = 0;
  const kept = unfolded.filter((id) => {
    if (NOTES.has(id)) return false;
    if (STRENGTHS.has(id)) return strengths++ < 1;
    return findings++ < 3;
  });
  return { kept, leader, folded };
}

const FOLDED_TITLE: Record<string, string> = {
  tee: 'Driver may be costing you more than it gains',
  pen: 'Penalty strokes: 0.8 per round',
};

async function offOrder(rows: unknown[] = ROWS): Promise<string[]> {
  flagOn.value = false;
  const out = await getInsightsForPlayer('p1', { limit: 20 }, makeClient(rows));
  return ids(out);
}

beforeEach(() => {
  insightCalls = [];
  vi.mocked(recordInsightExposure).mockClear();
});

describe('delivery with the flag off: unchanged', () => {
  beforeEach(() => {
    flagOn.value = false;
  });

  it('the player feed keeps every read, unfolded and uncapped', async () => {
    const out = await getInsightsForPlayer('p1', { limit: 20 }, makeClient(ROWS));
    expect([...ids(out)].sort()).toEqual(['bal', 'f2', 'f3', 'f4', 'pen', 's1', 's2', 'tee']);
    expect(out.every((i) => i.also === undefined && i.content === `Content ${i.id}.`)).toBe(true);
  });

  it('exposure rows carry a score and no rank factors, and no focus area is read', async () => {
    const client = makeClient(ROWS);
    const out = await getInsightsForPlayer('p1', { limit: 20 }, client);
    const rows = lastExposure();
    expect(rows.map((r) => r.insight_id)).toEqual(ids(out));
    expect(rows.every((r) => typeof r.rank_score === 'number' && !('rank_factors' in r))).toBe(true);
    expect(tablesRead(client)).not.toContain('golf_player_focus_areas');
  });

  it('the Hub pick still runs its urgent-only query', async () => {
    await getTopInsightForPlayer('p1', makeClient(ROWS));
    expect(insightCalls).toContainEqual(['eq', 'priority', 'urgent']);
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
    expect(kept).toHaveLength(7);
    expect(kept).toContain('bal');
  });

  it('records exposure for exactly the reads kept, each with its score', async () => {
    const { kept } = expectedKept(await offOrder());
    flagOn.value = true;
    vi.mocked(recordInsightExposure).mockClear();
    await getInsightsForPlayer('p1', { limit: 20 }, makeClient(ROWS));
    const rows = lastExposure();
    expect(rows.map((r) => r.insight_id)).toEqual(kept);
    // `rank_factors` is Slice 1's (flag coachhelm_support_v1, off here): this
    // flag never writes it.
    expect(rows.every((r) => typeof r.rank_score === 'number' && !('rank_factors' in r))).toBe(true);
  });

  it('a read the player dismissed never takes one of the 3 + 1', async () => {
    const { kept } = expectedKept((await offOrder()).filter((id) => id !== 'f2'));
    flagOn.value = true;
    const feedback = [{ insight_id: 'f2', rating: 'dismissed', created_at: '2026-10-02T00:00:00.000Z' }];
    const out = await getInsightsForPlayer('p1', { limit: 20 }, makeClient(ROWS, { feedback }));
    expect(ids(out)).toEqual(kept);
    expect(ids(out)).not.toContain('f2');
    expect(kept.filter((id) => !STRENGTHS.has(id))).toHaveLength(3);
  });

  it('a read a live focus area came from stays its own card', async () => {
    const { folded } = expectedKept(await offOrder());
    flagOn.value = true;
    const client = makeClient(ROWS, { focus: [{ from_insight_id: folded }] });
    const out = await getInsightsForPlayer('p1', { limit: 20, includeMore: true }, client);
    expect(ids(out)).toEqual(expect.arrayContaining(['tee', 'pen']));
    expect(out.every((i) => i.also === undefined)).toBe(true);
    expect(tablesRead(client)).toContain('golf_player_focus_areas');
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

  it('the Hub pick with an urgent read: no urgent-only query, and the feed head, folded', async () => {
    const urgentRows = ROWS.map((r) => (r.id === 'pen' ? { ...r, priority: 'urgent' } : r));
    const { kept, leader, folded } = expectedKept(await offOrder(urgentRows));
    expect(leader).toBe('pen');
    flagOn.value = true;
    insightCalls = [];
    const top = await getTopInsightForPlayer('p1', makeClient(urgentRows));
    expect(insightCalls).not.toContainEqual(['eq', 'priority', 'urgent']);
    expect(top?.id).toBe(kept[0]);
    expect(top?.also?.map((a) => a.id)).toEqual([folded]);
  });

  it('the round-review takeaway leads with the feed head, folded', async () => {
    const { kept, folded } = expectedKept(await offOrder());
    flagOn.value = true;
    const client = makeClient(ROWS, { round: { round_date: '2026-10-01' } });
    const takeaway = await getRoundTakeawayInsight('p1', 'round-1', client);
    expect(takeaway?.id).toBe(kept[0]);
    if (takeaway?.id === 'tee' || takeaway?.id === 'pen') expect(takeaway.also?.map((a) => a.id)).toEqual([folded]);
  });

  it('the coach chat tool folds but lists every read (no 3 + 1 cap)', async () => {
    const { kept, leader, folded } = expectedKept(await offOrder(), false);
    flagOn.value = true;
    const ctx: CoachChatContext = {
      coach_id: 'coach-1',
      user_id: 'user-1',
      team_id: 'team-1',
      team_name: 'Team',
      timezone: 'America/New_York',
      roster: [{ id: 'p1', name: 'Player One', first_name: 'Player', last_name: 'One', graduation_year: null }],
    };
    const env = await getPlayerInsights(makeClient(ROWS) as never, ctx, { player_id: 'p1', limit: 10 });
    const listed = (env.detail as { insights: Array<{ insight_id: string; content: string }> }).insights;
    expect(listed.map((i) => i.insight_id)).toEqual(kept);
    expect(listed.find((i) => i.insight_id === leader)?.content).toContain(FOLDED_TITLE[folded]);
  });
});

describe('HELM_COACHHELM_TEAMS canary: the delivery plan is decided per player', () => {
  const other = ROWS.map((r) => ({ ...r, id: `q-${r.id}`, player_id: 'p2' }));
  const members = [{ player_id: 'p1', team_id: 't1' }];

  beforeEach(() => {
    flagOn.value = true;
    process.env.HELM_COACHHELM_TEAMS = 't1';
  });
  afterEach(() => {
    delete process.env.HELM_COACHHELM_TEAMS;
  });

  it('the coach team sweep folds and caps the listed team’s player and leaves the other as it was', async () => {
    const res = await getInsightsForCoachWithMeta('coach-1', { limit: 100 }, makeClient([...ROWS, ...other], { members }));
    expect(res.ok && res.data.filter((i) => i.player_id === 'p1').length).toBe(4);
    expect(res.ok && res.data.filter((i) => i.player_id === 'p2').length).toBe(ROWS.length);
    expect(res.ok && res.data.filter((i) => i.player_id === 'p2').every((i) => i.also === undefined)).toBe(true);
  });

  it('the roster sweep does the same, player by player', async () => {
    const { kept } = expectedKept(await offOrder());
    flagOn.value = true;
    const roster = await getTopInsightsForPlayers(['p1', 'p2'], { limit: 20 }, makeClient([...ROWS, ...other], { members }));
    expect(ids(roster.get('p1') ?? [])).toEqual(kept);
    expect(roster.get('p2')?.length).toBe(ROWS.length);
  });

  it('a failed team read: every player as it was (fail closed)', async () => {
    const res = await getInsightsForCoachWithMeta(
      'coach-1',
      { limit: 100 },
      makeClient([...ROWS, ...other], { members, membersError: true }),
    );
    expect(res.ok && res.data.length).toBe(ROWS.length * 2);
  });
});
