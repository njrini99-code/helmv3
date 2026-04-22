/**
 * Tests for src/lib/notifications/insight-notifier.ts
 *
 * Verifies the Wave 1B push-notification hook:
 *  1. Skips when lifecycle_state != 'matured' | 'resolved'
 *  2. Skips when was_lifecycle_promotion === false (every dedup-refresh)
 *  3. Sends when lifecycle_state='matured' AND was_lifecycle_promotion=true
 *  4. Throttles: second push for same (player, kind, day) is NOT sent
 *  5. Resolution notification fires correctly with celebratory copy
 *  6. Push send failure does NOT throw (engine keeps running)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

// --- Module-level mock state ----------------------------------------------

type PushCall = {
  type: string;
  userId: string;
  data: Record<string, unknown>;
};

const pushCalls: PushCall[] = [];
let pushReturn: { success: boolean; error?: string } = { success: true };

const redisSetCalls: Array<{
  key: string;
  value: unknown;
  options?: { ex?: number; nx?: boolean };
}> = [];
let redisSetReturn: 'OK' | null | Error = 'OK';

const adminLookupByPlayer = new Map<string, { user_id: string } | null>();
let adminLookupError: { message: string; code?: string } | null = null;

const logServerErrorCalls: Array<{ message: string; severity: string }> = [];

// --- Mocks ----------------------------------------------------------------

vi.mock('@/lib/notifications/push', () => ({
  sendPushNotification: vi.fn(
    async (type: string, userId: string, data: Record<string, unknown>) => {
      pushCalls.push({ type, userId, data });
      return pushReturn;
    },
  ),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => {
            if (adminLookupError) {
              return { data: null, error: adminLookupError };
            }
            const row = adminLookupByPlayer.get(val) ?? null;
            return { data: row, error: null };
          },
        }),
      }),
    }),
  }),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    async set(
      key: string,
      value: unknown,
      options?: { ex?: number; nx?: boolean },
    ): Promise<'OK' | null> {
      redisSetCalls.push({ key, value, options });
      if (redisSetReturn instanceof Error) throw redisSetReturn;
      return redisSetReturn;
    }
  },
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
  const mod = await import('@/lib/notifications/insight-notifier');
  mod.__resetRedisForTests();
  return mod;
}

// --- Suite ----------------------------------------------------------------

describe('insight-notifier', () => {
  beforeEach(() => {
    pushCalls.length = 0;
    redisSetCalls.length = 0;
    logServerErrorCalls.length = 0;
    adminLookupByPlayer.clear();
    adminLookupError = null;
    pushReturn = { success: true };
    redisSetReturn = 'OK';
    process.env.KV_REST_API_URL = 'https://fake.upstash';
    process.env.KV_REST_API_TOKEN = 'fake-token';
    // Map player → user
    adminLookupByPlayer.set('player-1', { user_id: 'user-1' });
    adminLookupByPlayer.set('player-2', { user_id: 'user-2' });
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
    expect(pushCalls).toHaveLength(0);
    expect(redisSetCalls).toHaveLength(0);
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
    expect(pushCalls).toHaveLength(0);
    expect(redisSetCalls).toHaveLength(0);
  });

  it('sends a push when lifecycle_state=matured AND was_lifecycle_promotion=true', async () => {
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

    expect(redisSetCalls).toHaveLength(1);
    expect(redisSetCalls[0]!.key).toMatch(/^push:player:player-1:insight_matured:\d{4}-\d{2}-\d{2}$/);
    expect(redisSetCalls[0]!.options).toMatchObject({ ex: 86400, nx: true });

    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0]!.type).toBe('coachhelm_insight');
    expect(pushCalls[0]!.userId).toBe('user-1');
    const title = String(pushCalls[0]!.data.insightTitle);
    expect(title.toLowerCase()).toContain('putting');
    expect(title.toLowerCase()).toContain('making waves');
    expect(pushCalls[0]!.data.kind).toBe('insight_matured');
  });

  it('throttles when the same player already had a push today', async () => {
    const { notifyInsightLanded } = await loadNotifier();

    // First call claims the slot.
    await notifyInsightLanded({
      player_id: 'player-1',
      insight_id: 'ins-1',
      category: 'putting',
      title: '6–10 ft putting',
      evidence: makeEvidence(),
      lifecycle_state: 'matured',
      was_lifecycle_promotion: true,
    });
    expect(pushCalls).toHaveLength(1);

    // Upstash NX SET returns null on the second attempt (slot taken).
    redisSetReturn = null;
    await notifyInsightLanded({
      player_id: 'player-1',
      insight_id: 'ins-2',
      category: 'approach',
      title: 'Approach accuracy',
      evidence: makeEvidence(),
      lifecycle_state: 'matured',
      was_lifecycle_promotion: true,
    });

    // Still 1 — second attempt was throttled.
    expect(pushCalls).toHaveLength(1);
    expect(redisSetCalls).toHaveLength(2);
  });

  it('resolution notification fires with celebratory copy + correct kind', async () => {
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

    expect(pushCalls).toHaveLength(1);
    expect(pushCalls[0]!.data.kind).toBe('insight_resolved');
    expect(pushCalls[0]!.userId).toBe('user-2');
    const title = String(pushCalls[0]!.data.insightTitle);
    expect(title).toContain('closed the gap');
    expect(title).toContain('putting');
    // Throttle key uses the resolved kind.
    expect(redisSetCalls[0]!.key).toContain(':insight_resolved:');
  });

  it('swallows push send failure — never throws', async () => {
    pushReturn = { success: false, error: 'APNs 503' };
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

    expect(pushCalls).toHaveLength(1); // it did try
    expect(
      logServerErrorCalls.some((c) => c.message.includes('push send reported failure')),
    ).toBe(true);
  });

  it('no-ops silently when the player→user lookup returns no row', async () => {
    const { notifyInsightLanded } = await loadNotifier();
    await notifyInsightLanded({
      player_id: 'ghost-player', // not in adminLookupByPlayer
      insight_id: 'ins-1',
      category: 'putting',
      title: 'x',
      evidence: makeEvidence(),
      lifecycle_state: 'matured',
      was_lifecycle_promotion: true,
    });

    // Slot was claimed (before lookup) but no push was sent.
    expect(redisSetCalls).toHaveLength(1);
    expect(pushCalls).toHaveLength(0);
  });

  it('fails-open when Redis throws (signal > strict throttle)', async () => {
    redisSetReturn = new Error('ECONNRESET');
    const { notifyInsightLanded } = await loadNotifier();
    await notifyInsightLanded({
      player_id: 'player-1',
      insight_id: 'ins-1',
      category: 'approach',
      title: 'Approach',
      evidence: makeEvidence(),
      lifecycle_state: 'matured',
      was_lifecycle_promotion: true,
    });
    // Fail-open: the push still went through.
    expect(pushCalls).toHaveLength(1);
    expect(
      logServerErrorCalls.some((c) => c.message.includes('throttle check failed')),
    ).toBe(true);
  });
});
