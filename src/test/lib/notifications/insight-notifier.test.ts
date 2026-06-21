/**
 * Tests for src/lib/notifications/insight-notifier.ts
 *
 * P1-10 — the notifier now ROUTES through the V3 dispatcher
 * (dispatchCoachHelmNotification) so the player's per-category prefs + quiet mode
 * govern delivery and an in-app receipt is created. This module's own job is
 * reduced to deciding WHEN an insight warrants a notification + composing copy.
 *
 * Verifies:
 *  1. Skips when lifecycle_state != 'matured' | 'resolved'
 *  2. Skips when was_lifecycle_promotion === false (every dedup-refresh)
 *  3. Matured → routes through the dispatcher as category 'new_insight'
 *  4. Resolved → routes through the dispatcher as category 'goal_achieved'
 *     with celebratory copy
 *  5. The historical "1 per (player, kind) per day" cadence is preserved via
 *     throttle_key = kind
 *  6. A dispatcher failure does NOT throw (engine keeps running)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

// --- Module-level mock state ----------------------------------------------

type DispatchCall = {
  player_id: string;
  category: string;
  title: string;
  body: string;
  action_url?: string;
  data?: Record<string, unknown>;
  throttle_key?: string | null;
};

const dispatchCalls: DispatchCall[] = [];
let dispatchThrows: Error | null = null;

const logServerErrorCalls: Array<{ message: string; severity: string }> = [];

// --- Mocks ----------------------------------------------------------------

vi.mock('@/lib/coachhelm/v3/notifications/dispatch', () => ({
  dispatchCoachHelmNotification: vi.fn(async (args: DispatchCall) => {
    if (dispatchThrows) throw dispatchThrows;
    dispatchCalls.push(args);
    return {
      decision: { push: true, email: false, in_app: true, exempted_from_quiet: false },
      throttled: false,
      in_app: true,
      push: true,
      email: false,
    };
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async (message: string, _ctx: unknown, severity = 'error') => {
    logServerErrorCalls.push({ message, severity });
  }),
}));

// --- Helpers --------------------------------------------------------------

function makeEvidence(): InsightEvidence {
  return {
    metric: 'make_pct_6_10ft',
    metric_label: '6–10 ft make %',
    unit: 'percent',
    your_value: 0.38,
    your_value_display: '38%',
    comparison_value: 0.52,
    comparison_label: 'D2 avg',
    comparison_source: 'd2_avg',
    sample_n: 47,
    window_days: 30,
    window_start: '2026-03-22T00:00:00Z',
    window_end: '2026-04-21T00:00:00Z',
    strokes_impact: 1.4,
    strokes_impact_method: 'sg_baseline',
    confidence: 0.78,
    confidence_factors: {
      sample_adequacy: 0.9,
      recency: 0.8,
      variance: 0.6,
    },
  };
}

async function loadNotifier() {
  return import('@/lib/notifications/insight-notifier');
}

// --- Suite ----------------------------------------------------------------

describe('insight-notifier → V3 dispatcher (P1-10)', () => {
  beforeEach(() => {
    dispatchCalls.length = 0;
    logServerErrorCalls.length = 0;
    dispatchThrows = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('skips when lifecycle_state is "detected" (not matured)', async () => {
    const { notifyInsightLanded } = await loadNotifier();
    await notifyInsightLanded({
      player_id: 'player-1',
      insight_id: 'ins-1',
      category: 'putting',
      title: '6–10 ft putting',
      evidence: makeEvidence(),
      lifecycle_state: 'detected',
      was_lifecycle_promotion: false,
    });
    expect(dispatchCalls).toHaveLength(0);
  });

  it('skips when was_lifecycle_promotion is false (dedup refresh)', async () => {
    const { notifyInsightLanded } = await loadNotifier();
    await notifyInsightLanded({
      player_id: 'player-1',
      insight_id: 'ins-1',
      category: 'putting',
      title: '6–10 ft putting',
      evidence: makeEvidence(),
      lifecycle_state: 'matured', // already matured, but not a promotion THIS write
      was_lifecycle_promotion: false,
    });
    expect(dispatchCalls).toHaveLength(0);
  });

  it('routes a matured insight through the dispatcher as new_insight', async () => {
    const { notifyInsightLanded } = await loadNotifier();
    await notifyInsightLanded({
      player_id: 'player-1',
      insight_id: 'ins-1',
      category: 'putting',
      title: '6–10 ft putting',
      evidence: makeEvidence(),
      lifecycle_state: 'matured',
      was_lifecycle_promotion: true,
    });

    expect(dispatchCalls).toHaveLength(1);
    const call = dispatchCalls[0]!;
    expect(call.player_id).toBe('player-1');
    expect(call.category).toBe('new_insight');
    // Preserves the "1 per (player, kind) per day" cadence.
    expect(call.throttle_key).toBe('insight_matured');
    expect(call.body.toLowerCase()).toContain('making waves');
    expect(call.data?.insightId).toBe('ins-1');
    expect(call.data?.kind).toBe('insight_matured');
  });

  it('routes a resolved insight through the dispatcher as goal_achieved with celebratory copy', async () => {
    const { notifyInsightLanded } = await loadNotifier();
    await notifyInsightLanded({
      player_id: 'player-2',
      insight_id: 'ins-99',
      category: 'putting',
      title: '6–10 ft putting',
      evidence: makeEvidence(),
      lifecycle_state: 'resolved',
      was_lifecycle_promotion: true,
    });

    expect(dispatchCalls).toHaveLength(1);
    const call = dispatchCalls[0]!;
    expect(call.category).toBe('goal_achieved');
    expect(call.throttle_key).toBe('insight_resolved');
    expect(call.body).toContain('closed the gap');
    expect(call.data?.kind).toBe('insight_resolved');
  });

  it('swallows a dispatcher failure — never throws', async () => {
    dispatchThrows = new Error('dispatch boom');
    const { notifyInsightLanded } = await loadNotifier();

    await expect(
      notifyInsightLanded({
        player_id: 'player-1',
        insight_id: 'ins-1',
        category: 'putting',
        title: '6–10 ft putting',
        evidence: makeEvidence(),
        lifecycle_state: 'matured',
        was_lifecycle_promotion: true,
      }),
    ).resolves.toBeUndefined();

    expect(
      logServerErrorCalls.some((c) => c.message.includes('unhandled failure')),
    ).toBe(true);
  });
});
