import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

// Mock the underlying trigger before importing postRoundTrigger. postRoundTrigger
// now goes through the server-only bridge (never the 'use server' insights.ts
// export surface — see src/lib/coachhelm/v2/trigger-insights-bridge.ts).
const mockTrigger = vi.fn();
vi.mock('@/lib/coachhelm/v2/trigger-insights-bridge', () => ({
  triggerPlayerInsightsAfterRound: (...args: unknown[]) => mockTrigger(...args),
}));

import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';

describe('postRoundTrigger', () => {
  beforeEach(() => {
    mockTrigger.mockReset();
  });

  it('sets coachhelm_analyzed_at and clears failure fields on success', async () => {
    const admin = createFakeSupabase({
      tables: {
        golf_rounds: [
          { id: 'r1', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
        ],
      },
    });
    mockTrigger.mockResolvedValue({ success: true, insights_created: 3 });

    await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r1' });

    const { data } = await admin.from('golf_rounds').select('*').eq('id', 'r1');
    expect(data?.[0]?.['coachhelm_analyzed_at']).toBeTruthy();
    expect(data?.[0]?.['coachhelm_failed_at']).toBeNull();
    expect(data?.[0]?.['coachhelm_failure_reason']).toBeNull();
  });

  it('sets coachhelm_failed_at + reason when trigger returns success: false', async () => {
    const admin = createFakeSupabase({
      tables: {
        golf_rounds: [{ id: 'r2', player_id: 'p1', coachhelm_analyzed_at: null }],
      },
    });
    mockTrigger.mockResolvedValue({ success: false, error: 'team disabled coachhelm' });

    await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r2' });

    const { data } = await admin.from('golf_rounds').select('*').eq('id', 'r2');
    expect(data?.[0]?.['coachhelm_analyzed_at']).toBeFalsy();
    expect(data?.[0]?.['coachhelm_failed_at']).toBeTruthy();
    // postRoundTrigger now sanitizes free-text reasons into a canonical
    // enum via sanitizeFailureReason() — "team disabled coachhelm" matches
    // the "disabled" branch and becomes 'engine_disabled'.
    expect(String(data?.[0]?.['coachhelm_failure_reason'])).toMatch(/engine_disabled/);
  });

  it('sets coachhelm_failed_at + reason when trigger throws', async () => {
    const admin = createFakeSupabase({
      tables: {
        golf_rounds: [{ id: 'r3', player_id: 'p1', coachhelm_analyzed_at: null }],
      },
    });
    mockTrigger.mockRejectedValue(new Error('engine_boom'));

    await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r3' });

    const { data } = await admin.from('golf_rounds').select('*').eq('id', 'r3');
    expect(data?.[0]?.['coachhelm_failed_at']).toBeTruthy();
    // Free-text "engine_boom" doesn't match any sanitizer branch → falls
    // through to the catch-all 'engine_error' code.
    expect(String(data?.[0]?.['coachhelm_failure_reason'])).toMatch(/engine_error/);
  });

  it('truncates failure reason to 500 chars', async () => {
    const long = 'x'.repeat(2000);
    const admin = createFakeSupabase({
      tables: {
        golf_rounds: [{ id: 'r4', player_id: 'p1' }],
      },
    });
    mockTrigger.mockRejectedValue(new Error(long));

    await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r4' });

    const { data } = await admin.from('golf_rounds').select('*').eq('id', 'r4');
    expect(String(data?.[0]?.['coachhelm_failure_reason']).length).toBeLessThanOrEqual(500);
  });

  it('never throws — fire-and-forget safe from after()', async () => {
    const admin = createFakeSupabase({ tables: { golf_rounds: [{ id: 'r5', player_id: 'p1' }] } });
    mockTrigger.mockRejectedValue(new Error('boom'));

    await expect(postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r5' })).resolves.not.toThrow();
  });
});
