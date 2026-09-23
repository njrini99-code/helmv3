/**
 * A6 top-N audit — cross-surface agreement.
 *
 * Three independent surfaces each pick "the leading insight" for the same
 * player from the same underlying `golf_coach_insights` rows:
 *   - the player feed            (`getInsightsForPlayer`)
 *   - PracticeRx / the Hub pick  (`getTopInsightForPlayer`)
 *   - the coach chat tool        (`getPlayerInsights`)
 *
 * All three now route through the SAME canonical pipeline (`scoreInsight` via
 * `rankEvidenceInsights`/`rankEvidenceInsightsScored`, then
 * `collapseParScoring` + `dedupeBySubject`). This test proves they agree on
 * the #1 insight from one shared fixture, with the winning row placed LAST in
 * raw/DB order — so agreement can only come from real ranking, not from all
 * three trusting the same (wrong) array/DB order.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'self' as const })),
}));
// Neutral weights/goals for every surface, so the composite score is driven
// only by the evidence fields the fixture varies (strokes_impact/confidence).
vi.mock('@/lib/coachhelm/v3/ranking/score', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/ranking/score')>();
  return { ...actual, loadCoachWeightsForPlayer: vi.fn(async () => ({})) };
});
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({
  loadActiveGoals: vi.fn(async () => []),
}));

import { getInsightsForPlayer, getTopInsightForPlayer } from '@/app/golf/actions/insight-delivery';
import { getPlayerInsights } from '@/lib/coachhelm/v3/chat/read-tools';
import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';

function makeEvidence(strokes_impact: number, confidence: number, metric: string) {
  return {
    metric,
    metric_label: metric,
    your_value_display: '—',
    strokes_impact,
    confidence,
  };
}

function makeRow(id: string, category: string, strokes_impact: number, confidence: number, metric: string) {
  return {
    id,
    player_id: 'p1',
    title: `Insight ${id}`,
    content: 'Content',
    category,
    insight_type: 'trend',
    signature: `sig-${id}`,
    evidence: makeEvidence(strokes_impact, confidence, metric),
    metadata: null,
    lifecycle_state: 'matured',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-04-01T12:00:00.000Z',
    updated_at: '2026-04-01T12:00:00.000Z',
  };
}

// The best row (by strokes_impact * confidence) is placed LAST — the
// opposite of what a "trust array/DB order" implementation would need to
// pick it correctly.
const weakRow = makeRow('weak-1', 'approach', 0.3, 0.4, 'gir_pct');
const midRow = makeRow('mid-1', 'off_tee', 1.0, 0.6, 'fairway_hit_rate');
const bestRow = makeRow('best-1', 'putting', 3.0, 0.9, 'three_putt_rate');
const rawRows = [weakRow, midRow, bestRow];

// ---------------------------------------------------------------------------
// Feed + Hub/PracticeRx mock — insight-delivery.ts's `SupabaseClient` shape.
// ---------------------------------------------------------------------------
function makeInsightDeliverySb(queuedResponses: Array<{ data: unknown[]; error: null }>) {
  const insightQueue = [...queuedResponses];
  const emptyNode = (): Record<string, unknown> => {
    const node: Record<string, unknown> = {};
    node.select = () => node;
    node.eq = () => node;
    node.order = () => node;
    node.then = (resolve: (v: { data: never[]; error: null }) => void) =>
      Promise.resolve(resolve({ data: [], error: null }));
    return node;
  };
  const insightBuilder = () => {
    const terminal = insightQueue.shift() ?? { data: [], error: null };
    const node: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'not', 'or', 'in', 'neq', 'order', 'limit', 'range', 'gte', 'lte', 'abortSignal']) {
      node[m] = () => node;
    }
    node.then = (resolve: (v: typeof terminal) => void) => Promise.resolve(resolve(terminal));
    return node;
  };
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u-1' } }, error: null })) },
    from: vi.fn((table: string) => {
      if (table === 'golf_coach_insights') return insightBuilder();
      // golf_insight_player_feedback (loadPlayerFeedbackByInsight): no
      // dismissals in this fixture.
      if (table === 'golf_insight_player_feedback') {
        const node = emptyNode();
        node.order = () => Promise.resolve({ data: [], error: null });
        return node;
      }
      return emptyNode();
    }),
  };
}

// ---------------------------------------------------------------------------
// Chat tool mock — read-tools.ts's PostgREST-double shape (`sbWith` pattern).
// ---------------------------------------------------------------------------
function makeChatSb(rows: unknown[]) {
  const node: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'gte', 'lte', 'neq', 'limit', 'range', 'or']) {
    node[m] = () => node;
  }
  node.then = (resolve: (v: { data: unknown[]; error: null }) => void) =>
    Promise.resolve(resolve({ data: rows, error: null }));
  return { from: vi.fn(() => node) };
}

const ctx: CoachChatContext = {
  coach_id: 'coach-1',
  user_id: 'user-1',
  team_id: 'team-1',
  team_name: 'Helm University',
  timezone: 'America/New_York',
  roster: [{ id: 'p1', name: 'Avery Stone', first_name: 'Avery', last_name: 'Stone', graduation_year: null }],
};

describe('A6 cross-surface top-N agreement', () => {
  it('feed, Hub/PracticeRx pick, and chat tool all lead with the same insight', async () => {
    // Feed: getInsightsForPlayer
    const feedSb = makeInsightDeliverySb([{ data: rawRows, error: null }]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const feed = await getInsightsForPlayer('p1', {}, feedSb as any);

    // Hub / PracticeRx: getTopInsightForPlayer — urgent pass empty (no urgent
    // rows in this fixture), then the full ranked pass sees all 3 rows.
    const hubSb = makeInsightDeliverySb([
      { data: [], error: null },
      { data: rawRows, error: null },
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hubPick = await getTopInsightForPlayer('p1', hubSb as any);

    // Chat tool: getPlayerInsights
    const chatSb = makeChatSb(rawRows);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatEnvelope = await getPlayerInsights(chatSb as any, ctx, { player_id: 'p1', limit: 5 });
    const chatTop = (chatEnvelope.detail as { insights: Array<{ insight_id: string }> }).insights[0];

    expect(feed[0]?.id).toBe('best-1');
    expect(hubPick?.id).toBe('best-1');
    expect(chatTop?.insight_id).toBe('best-1');
  });
});
