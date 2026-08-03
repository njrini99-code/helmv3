/**
 * #1256 — CoachHelm AI availability readout.
 *
 * The outage this exists for lasted 8 days behind a single amber dot. The dot
 * grid is computed from error counts with 2-window hysteresis, which is right
 * for errors and wrong for this: falling back to a deterministic template is a
 * SUCCESSFUL code path that logs one throttled warning, so a total outage
 * generates almost no error volume. Availability is a rate and needs its own
 * reading.
 *
 * These tests pin the three things that make the readout trustworthy:
 *   1. a fully dark window reports RED immediately — no hysteresis to wait out;
 *   2. no traffic reports NEUTRAL, never green — "no calls" is not "healthy",
 *      and fabricating green here is the exact class of lie this prevents;
 *   3. a failed query reports degraded, not a made-up figure.
 *
 * The live production shape at the time of writing is covered by the first
 * case: 3 calls in 24h, 3 fallbacks, last successful model call 2026-07-26.
 *
 * NOTE on verification: /admin/health is super-admin gated and the only
 * credentials available locally are the golf demo coach, which is not a
 * super-admin (both /admin/health and /admin/billing redirect to
 * /golf/dashboard for it). So this readout was NOT confirmed in a browser —
 * the aggregate was confirmed against production SQL, and the status mapping
 * is pinned here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const windowResult = { data: [] as Array<{ fallback_to_template: boolean }>, error: null as unknown };
const lastOkResult = { data: null as { created_at: string } | null, error: null as unknown };

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        // window query: .gte(...) resolves
        gte: async () => windowResult,
        // last-successful query: .eq().order().limit().maybeSingle()
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => lastOkResult,
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { fetchAiAvailability } from '../ai-availability';

const fallbacks = (n: number) => Array.from({ length: n }, () => ({ fallback_to_template: true }));
const successes = (n: number) => Array.from({ length: n }, () => ({ fallback_to_template: false }));

describe('fetchAiAvailability (#1256)', () => {
  beforeEach(() => {
    windowResult.data = [];
    windowResult.error = null;
    lastOkResult.data = null;
    lastOkResult.error = null;
  });

  it('reports RED at once when every call fell back — no hysteresis', async () => {
    windowResult.data = fallbacks(3);
    const eightDaysAgo = new Date(Date.now() - 8 * 86_400_000).toISOString();
    lastOkResult.data = { created_at: eightDaysAgo };

    const ai = await fetchAiAvailability();

    expect(ai.status).toBe('red');
    expect(ai.availability).toBe(0);
    expect(ai.calls).toBe(3);
    expect(ai.fellBack).toBe(3);
    expect(ai.daysSinceSuccess).toBe(8);
    expect(ai.summary).toContain('0% availability');
    expect(ai.summary).toContain('8 days ago');
  });

  it('reports NEUTRAL, never green, when there was no traffic at all', async () => {
    windowResult.data = [];
    const ai = await fetchAiAvailability();

    expect(ai.status).toBe('neutral');
    expect(ai.availability).toBeNull();
    expect(ai.summary).toMatch(/no signal/i);
  });

  it('reports AMBER on partial degradation', async () => {
    windowResult.data = [...successes(5), ...fallbacks(5)]; // 50%
    const ai = await fetchAiAvailability();

    expect(ai.status).toBe('amber');
    expect(ai.availability).toBe(0.5);
    expect(ai.summary).toContain('5 of 10');
  });

  it('reports GREEN when effectively all calls reached a model', async () => {
    windowResult.data = successes(10);
    const ai = await fetchAiAvailability();

    expect(ai.status).toBe('green');
    expect(ai.availability).toBe(1);
  });

  it('reports degraded rather than a fabricated figure when the query fails', async () => {
    windowResult.error = { message: 'boom' };
    const ai = await fetchAiAvailability();

    expect(ai.degraded).toBe(true);
    expect(ai.status).toBe('neutral');
    expect(ai.availability).toBeNull();
  });
});
