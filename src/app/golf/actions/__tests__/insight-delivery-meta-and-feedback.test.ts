/**
 * Remediation acceptance tests for the CoachHelm engine findings:
 *
 *   • P2-15 — `getInsightsForCoachWithMeta` returns a DISCRIMINATED result so a
 *     DB error renders an error state (ok:false), NOT an empty "all clear" feed,
 *     and a capped read honestly discloses `total` + `capped`.
 *   • P058   — `total` reflects the FULL eligible set (post rank+dedupe, pre
 *     limit-slice), so the UI can say "showing N of TOTAL".
 *   • P1-09  — the player read paths overlay `golf_insight_player_feedback`:
 *     a player-dismissed insight is hidden (sticks across refresh) and
 *     useful/not-useful state is attached for the UI chips. Coach reads are
 *     unaffected (no feedback overlay on the coach sweep).
 *
 * These exercise the REAL server-action pipeline (fetch → map → rank → dedupe →
 * overlay) through a chainable thenable Supabase mock, mirroring the pattern in
 * insight-delivery-coach-feed.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

// ---------------------------------------------------------------------------
// Module-boundary mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

let activeClient: unknown = {};
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => activeClient),
}));

vi.mock('@/lib/coachhelm/v3/ranking/score', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/ranking/score')>();
  return { ...actual, loadCoachWeightsForPlayer: vi.fn(async () => ({})) };
});
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({
  loadActiveGoals: vi.fn(async () => []),
}));
// verifyPlayerAccess gates the player read paths; allow by default.
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: vi.fn(async () => ({ allowed: true })),
}));

import {
  getInsightsForCoachWithMeta,
  getInsightsForPlayer,
  getTopInsightForPlayer,
} from '@/app/golf/actions/insight-delivery';

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

interface RawRow {
  id: string;
  player_id: string;
  category: string | null;
  insight_type: string | null;
  title: string;
  content: string;
  signature: string | null;
  evidence: InsightEvidence;
  metadata: Record<string, unknown> | null;
  lifecycle_state: string;
  status: string;
  priority: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  outcome_status: string | null;
  outcome_measured_at: string | null;
  created_at: string;
  updated_at: string;
  drill_attachments: null;
}

function makeRow(o: {
  id: string;
  metric: string;
  category?: string;
  insight_type?: string;
  confidence?: number;
  strokesImpact?: number;
  priority?: string;
  created_at?: string;
}): RawRow {
  const evidence = {
    metric: o.metric,
    metric_label: o.metric,
    strokes_impact: o.strokesImpact ?? 0,
    confidence: o.confidence ?? 0.5,
    sample_n: 20,
  } as unknown as InsightEvidence;

  return {
    id: o.id,
    player_id: 'p-1',
    category: o.category ?? 'approach',
    insight_type: o.insight_type ?? 'approach_proximity',
    title: `Title ${o.id}`,
    content: `Content ${o.id}`,
    signature: 'v3:x',
    evidence,
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: o.priority ?? 'low',
    acknowledged_at: null,
    resolved_at: null,
    outcome_status: null,
    outcome_measured_at: null,
    created_at: o.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    drill_attachments: null,
  };
}

interface FeedbackRow {
  insight_id: string;
  rating: string;
  created_at: string;
}

/**
 * Chainable thenable mock. `golf_coach_insights` resolves the supplied insight
 * rows (paginated via `.range()`); `golf_insight_player_feedback` resolves the
 * supplied feedback rows through the `.select().eq().order()` chain the overlay
 * helper uses. `insightError` forces the insight query to resolve an error.
 */
function makeSupabaseMock(opts: {
  rows: RawRow[];
  feedback?: FeedbackRow[];
  insightError?: { message: string };
  userId?: string;
}) {
  const insightTerminal = {
    data: opts.insightError ? null : opts.rows,
    error: opts.insightError ?? null,
  };

  const insightBuilder = {
    select: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    // getTopInsightForPlayer's urgent-priority pass applies a best-effort
    // abort budget (BEST_EFFORT_QUERY_TIMEOUT_MS) via `.abortSignal(...)`.
    abortSignal: vi.fn().mockReturnThis(),
    then: (resolve: (v: typeof insightTerminal) => void) =>
      Promise.resolve(resolve(insightTerminal)),
  };

  // Feedback chain: select(cols).eq(col,val).order(col,opts) → Promise.
  const feedbackBuilder = {
    select: vi.fn(() => feedbackBuilder),
    eq: vi.fn(() => feedbackBuilder),
    order: vi.fn(async () => ({ data: opts.feedback ?? [], error: null })),
  };

  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: opts.userId ?? 'user-1' } },
        error: null,
      })),
    },
    from: vi.fn((table: string) => {
      if (table === 'golf_coach_insights') return insightBuilder;
      if (table === 'golf_insight_player_feedback') return feedbackBuilder;
      throw new Error(`unexpected table "${table}"`);
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  activeClient = {};
});

// ===========================================================================
// P2-15 / P058 — discriminated meta result
// ===========================================================================

describe('getInsightsForCoachWithMeta — P2-15 error vs empty', () => {
  it('a DB error returns ok:false (an error state), NOT an empty all-clear feed', async () => {
    activeClient = makeSupabaseMock({
      rows: [],
      insightError: { message: 'boom' },
      userId: 'coach-1',
    }) as unknown as SupabaseClient;

    const res = await getInsightsForCoachWithMeta('coach-1');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBeTruthy();
    }
  });

  it('an empty result returns ok:true with an empty data array (genuine all-clear)', async () => {
    activeClient = makeSupabaseMock({ rows: [], userId: 'coach-1' }) as unknown as SupabaseClient;

    const res = await getInsightsForCoachWithMeta('coach-1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual([]);
      expect(res.total).toBe(0);
      expect(res.capped).toBe(false);
    }
  });

  it('P058: a capped read discloses total > data.length and capped:true', async () => {
    // 5 distinct-subject rows; limit 2 → data has 2, total is 5, capped true.
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow({ id: `r-${i}`, metric: `metric_${i}`, confidence: 0.5 + i * 0.05 }),
    );
    activeClient = makeSupabaseMock({ rows, userId: 'coach-1' }) as unknown as SupabaseClient;

    const res = await getInsightsForCoachWithMeta('coach-1', { limit: 2 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.length).toBe(2);
      expect(res.total).toBe(5);
      expect(res.capped).toBe(true);
    }
  });

  it('an uncapped read reports capped:false and total === data.length', async () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      makeRow({ id: `r-${i}`, metric: `metric_${i}` }),
    );
    activeClient = makeSupabaseMock({ rows, userId: 'coach-1' }) as unknown as SupabaseClient;

    const res = await getInsightsForCoachWithMeta('coach-1', { limit: 100 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.capped).toBe(false);
      expect(res.total).toBe(res.data.length);
      expect(res.total).toBe(3);
    }
  });
});

// ===========================================================================
// P1-09 — player feedback overlay
// ===========================================================================

describe('getInsightsForPlayer — P1-09 feedback overlay', () => {
  it('hides a player-dismissed insight (the dismissal sticks across refresh)', async () => {
    const rows = [
      makeRow({ id: 'keep', metric: 'metric_keep', confidence: 0.9 }),
      makeRow({ id: 'gone', metric: 'metric_gone', confidence: 0.8 }),
    ];
    activeClient = makeSupabaseMock({
      rows,
      feedback: [{ insight_id: 'gone', rating: 'dismissed', created_at: '2026-06-01T00:00:00Z' }],
    }) as unknown as SupabaseClient;

    const out = await getInsightsForPlayer('p-1');
    const ids = out.map((i) => i.id);
    expect(ids).toContain('keep');
    expect(ids).not.toContain('gone');
  });

  it('attaches helpful/not-useful state for the UI chips without hiding the row', async () => {
    const rows = [makeRow({ id: 'rated', metric: 'metric_rated', confidence: 0.9 })];
    activeClient = makeSupabaseMock({
      rows,
      feedback: [{ insight_id: 'rated', rating: 'helpful', created_at: '2026-06-02T00:00:00Z' }],
    }) as unknown as SupabaseClient;

    const out = await getInsightsForPlayer('p-1');
    expect(out).toHaveLength(1);
    expect(out[0]?.player_feedback?.rating).toBe('helpful');
  });

  it('the LATEST feedback per insight wins (newest-first overlay)', async () => {
    const rows = [makeRow({ id: 'rated', metric: 'metric_rated', confidence: 0.9 })];
    activeClient = makeSupabaseMock({
      rows,
      // Newest-first order is what the helper queries; first row is the latest.
      feedback: [
        { insight_id: 'rated', rating: 'not_helpful', created_at: '2026-06-10T00:00:00Z' },
        { insight_id: 'rated', rating: 'helpful', created_at: '2026-06-01T00:00:00Z' },
      ],
    }) as unknown as SupabaseClient;

    const out = await getInsightsForPlayer('p-1');
    expect(out[0]?.player_feedback?.rating).toBe('not_helpful');
  });

  it('with no feedback, every row passes through unmodified', async () => {
    const rows = [makeRow({ id: 'a', metric: 'm_a' }), makeRow({ id: 'b', metric: 'm_b' })];
    activeClient = makeSupabaseMock({ rows, feedback: [] }) as unknown as SupabaseClient;

    const out = await getInsightsForPlayer('p-1');
    expect(out.map((i) => i.id).sort()).toEqual(['a', 'b']);
    expect(out.every((i) => i.player_feedback == null)).toBe(true);
  });
});

describe('getTopInsightForPlayer — P1-09 feedback overlay', () => {
  it('does not return a player-dismissed urgent insight (it falls through)', async () => {
    // Single urgent row, dismissed by the player → the Hub card must not show it.
    const rows = [
      makeRow({ id: 'urgent-dismissed', metric: 'm_urgent', priority: 'urgent', confidence: 0.9 }),
    ];
    activeClient = makeSupabaseMock({
      rows,
      feedback: [
        { insight_id: 'urgent-dismissed', rating: 'dismissed', created_at: '2026-06-01T00:00:00Z' },
      ],
    }) as unknown as SupabaseClient;

    const top = await getTopInsightForPlayer('p-1');
    // The only row was dismissed; the urgent pass + ranked pass both filter it.
    expect(top?.id).not.toBe('urgent-dismissed');
  });
});
