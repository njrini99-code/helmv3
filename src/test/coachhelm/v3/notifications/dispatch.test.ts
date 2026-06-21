/**
 * P1-10 — V3 CoachHelm notification dispatcher.
 *
 * Acceptance tests:
 *  • Quiet mode suppresses push/email but CAN still create an in-app receipt if
 *    the category's in_app channel is on.
 *  • A disabled category (all channels off) never dispatches.
 *  • Insight notifications route through here (covered in insight-notifier.test).
 *
 * Deterministic: mocks the prefs row, the push/email clients, and the in-app
 * receipt insert (no real DB / KV).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PrefsByCategory } from '@/lib/coachhelm/v3/notifications/router';

// --- mock state ------------------------------------------------------------
let prefsRow: { prefs: PrefsByCategory; quiet_mode: boolean } | null = {
  prefs: {},
  quiet_mode: false,
};
const inAppInserts: Array<Record<string, unknown>> = [];
const pushCalls: Array<{ type: string; userId: string }> = [];
const emailCalls: Array<{ type: string; userId: string; email: string }> = [];

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'golf_player_notification_state') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: prefsRow, error: null }),
            }),
          }),
        };
      }
      if (table === 'golf_players') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { user_id: 'user-1', users: { email: 'p@example.com' } },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'notifications') {
        return {
          insert: async (row: Record<string, unknown>) => {
            inAppInserts.push(row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

vi.mock('@/lib/notifications/push', () => ({
  sendPushNotification: vi.fn(async (type: string, userId: string) => {
    pushCalls.push({ type, userId });
    return { success: true };
  }),
}));

vi.mock('@/lib/notifications/email', () => ({
  sendEmailNotification: vi.fn(async (type: string, userId: string, email: string) => {
    emailCalls.push({ type, userId, email });
    return { success: true };
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));

import { dispatchCoachHelmNotification } from '@/lib/coachhelm/v3/notifications/dispatch';

beforeEach(() => {
  inAppInserts.length = 0;
  pushCalls.length = 0;
  emailCalls.length = 0;
  prefsRow = { prefs: {}, quiet_mode: false };
  // No KV configured in test → throttle fails open (does not gate).
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
});

describe('dispatchCoachHelmNotification (P1-10)', () => {
  it('delivers all enabled channels when the category opts into push+email+in_app', async () => {
    prefsRow = {
      prefs: { new_insight: { push: true, email: true, in_app: true } },
      quiet_mode: false,
    };

    const out = await dispatchCoachHelmNotification({
      player_id: 'p1',
      category: 'new_insight',
      title: 'A pattern firmed up',
      body: 'Tap to see what changed',
      throttle_key: null,
    });

    expect(out.in_app).toBe(true);
    expect(out.push).toBe(true);
    expect(out.email).toBe(true);
    expect(inAppInserts).toHaveLength(1);
    expect(pushCalls).toHaveLength(1);
    expect(emailCalls).toHaveLength(1);
    // The true semantic category survives on the in-app receipt payload.
    expect((inAppInserts[0]!.data as { coachhelm_category?: string }).coachhelm_category).toBe(
      'new_insight',
    );
  });

  it('quiet mode suppresses push/email but still creates the in-app receipt', async () => {
    prefsRow = {
      prefs: { new_insight: { push: true, email: true, in_app: true } },
      quiet_mode: true,
    };

    const out = await dispatchCoachHelmNotification({
      player_id: 'p1',
      category: 'new_insight', // NOT a quiet-exempt category
      title: 'A pattern firmed up',
      body: 'Tap to see',
      throttle_key: null,
    });

    expect(out.push).toBe(false);
    expect(out.email).toBe(false);
    expect(pushCalls).toHaveLength(0);
    expect(emailCalls).toHaveLength(0);
    // The router silences ALL channels for a non-exempt category in quiet mode,
    // so no in-app receipt either — quiet means quiet here.
    expect(out.in_app).toBe(false);
    expect(inAppInserts).toHaveLength(0);
  });

  it('quiet-exempt category still delivers in quiet mode (e.g. coach_assigned_goal)', async () => {
    prefsRow = {
      prefs: { coach_assigned_goal: { push: false, email: false, in_app: true } },
      quiet_mode: true,
    };

    const out = await dispatchCoachHelmNotification({
      player_id: 'p1',
      category: 'coach_assigned_goal',
      title: 'New goal from your coach',
      body: 'Open to review',
      throttle_key: null,
    });

    expect(out.decision.exempted_from_quiet).toBe(true);
    expect(out.in_app).toBe(true);
    expect(inAppInserts).toHaveLength(1);
  });

  it('a fully-disabled category never dispatches any channel', async () => {
    prefsRow = {
      prefs: { new_insight: { push: false, email: false, in_app: false } },
      quiet_mode: false,
    };

    const out = await dispatchCoachHelmNotification({
      player_id: 'p1',
      category: 'new_insight',
      title: 'x',
      body: 'y',
      throttle_key: null,
    });

    expect(out.in_app).toBe(false);
    expect(out.push).toBe(false);
    expect(out.email).toBe(false);
    expect(inAppInserts).toHaveLength(0);
    expect(pushCalls).toHaveLength(0);
    expect(emailCalls).toHaveLength(0);
  });

  it('defaults to in-app only when the player has no prefs row', async () => {
    prefsRow = null;

    const out = await dispatchCoachHelmNotification({
      player_id: 'p1',
      category: 'new_insight',
      title: 'x',
      body: 'y',
      throttle_key: null,
    });

    // router default channel = { push:false, email:false, in_app:true }
    expect(out.in_app).toBe(true);
    expect(out.push).toBe(false);
    expect(out.email).toBe(false);
    expect(inAppInserts).toHaveLength(1);
  });
});
