import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

// Mock the underlying trigger before importing postRoundTrigger. postRoundTrigger
// now goes through the server-only bridge (never the 'use server' insights.ts
// export surface — see src/lib/coachhelm/v2/trigger-insights-bridge.ts).
const mockTrigger = vi.fn();
vi.mock('@/lib/coachhelm/v2/trigger-insights-bridge', () => ({
  triggerPlayerInsightsAfterRound: (...args: unknown[]) => mockTrigger(...args),
}));

// post-round-trigger.ts carries a side-effect `import '@/app/golf/actions/insights'`
// (registers the bridge impl at module-init time — the fix for the cold-start
// TDZ cycle). The bridge is fully mocked above, so the registration side effect
// is irrelevant here — stub the whole 4,400-line 'use server' module out.
vi.mock('@/app/golf/actions/insights', () => ({}));

// Spy on the actual severity/skipSentry passed to the two logging entry
// points. postRoundTrigger is a SECOND independent consumer of the
// triggerPlayerInsightsAfterRound result (alongside the withAdminObserved
// path in insights.ts, verified separately in
// src/lib/admin/__tests__/observe-action-result.test.ts) — these tests pin
// that both consumers classify the same `code` identically instead of this
// one always falling through to default 'error' + live Sentry capture.
const mocks = vi.hoisted(() => ({
  logServerError: vi.fn<
    (message: string, context: Record<string, unknown>, severity?: string) => Promise<void>
  >(async () => {}),
  logServerEvent: vi.fn<
    (message: string, context: Record<string, unknown>, severity?: string) => Promise<void>
  >(async () => {}),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: mocks.logServerError,
  logServerEvent: mocks.logServerEvent,
}));

import { postRoundTrigger } from '@/lib/coachhelm/v2/post-round-trigger';

describe('postRoundTrigger', () => {
  beforeEach(() => {
    mockTrigger.mockReset();
    mocks.logServerError.mockClear();
    mocks.logServerEvent.mockClear();
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

  describe('engine-failure severity classification (verdict-softfail-severity)', () => {
    it('code: engine_no_recent_rounds logs via logServerEvent at info + skipSentry, never logServerError', async () => {
      const admin = createFakeSupabase({
        tables: { golf_rounds: [{ id: 'r6', player_id: 'p1', coachhelm_analyzed_at: null }] },
      });
      mockTrigger.mockResolvedValue({
        success: false,
        error: 'No completed rounds in the last 90 days yet — insights will populate after the next round',
        code: 'engine_no_recent_rounds',
      });

      await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r6' });

      expect(mocks.logServerEvent).toHaveBeenCalledWith(
        expect.stringContaining('postRoundTrigger engine failed'),
        expect.objectContaining({ skipSentry: true, errorCode: 'engine_no_recent_rounds' }),
        'info',
      );
      expect(mocks.logServerError).not.toHaveBeenCalledWith(
        expect.stringContaining('postRoundTrigger engine failed'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('code: engine_session_expired logs via logServerError at warning + skipSentry (handled, not a live Sentry exception)', async () => {
      const admin = createFakeSupabase({
        tables: { golf_rounds: [{ id: 'r7', player_id: 'p1', coachhelm_analyzed_at: null }] },
      });
      mockTrigger.mockResolvedValue({
        success: false,
        error: 'Player analysis failed (likely session expired in background context)',
        code: 'engine_session_expired',
      });

      await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r7' });

      expect(mocks.logServerError).toHaveBeenCalledWith(
        expect.stringContaining('postRoundTrigger engine failed'),
        expect.objectContaining({ skipSentry: true, errorCode: 'engine_session_expired' }),
        'warning',
      );
    });

    it('regression guard: an unrecognized code/message still logs at default error severity with no skipSentry', async () => {
      const admin = createFakeSupabase({
        tables: { golf_rounds: [{ id: 'r8', player_id: 'p1', coachhelm_analyzed_at: null }] },
      });
      mockTrigger.mockResolvedValue({ success: false, error: 'team disabled coachhelm' });

      await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r8' });

      const call = mocks.logServerError.mock.calls.find(([msg]) =>
        String(msg).startsWith('postRoundTrigger engine failed'),
      );
      expect(call).toBeTruthy();
      expect(call?.[2]).toBe('error');
      expect((call?.[1] as Record<string, unknown> | undefined)?.skipSentry).toBeUndefined();
    });
  });
});
