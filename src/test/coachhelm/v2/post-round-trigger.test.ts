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

function createPostRoundFake(rounds: Array<Record<string, unknown>>) {
  return createFakeSupabase({
    tables: { golf_rounds: rounds },
    rpc: {
      record_round_coachhelm_terminal_state: async (rawArgs) => {
        const args = rawArgs as {
          p_round_id: string;
          p_analyzed_at: string | null;
          p_failed_at: string | null;
          p_failure_reason: string | null;
        };
        const round = rounds.find((row) => row.id === args.p_round_id);
        if (!round) return { data: null, error: null };

        Object.assign(round, {
          coachhelm_analyzed_at: args.p_analyzed_at,
          coachhelm_failed_at: args.p_failed_at,
          coachhelm_failure_reason: args.p_failure_reason,
        });
        return { data: args.p_round_id, error: null };
      },
    },
  });
}

describe('postRoundTrigger', () => {
  beforeEach(() => {
    mockTrigger.mockReset();
    mocks.logServerError.mockClear();
    mocks.logServerEvent.mockClear();
  });

  it('sets coachhelm_analyzed_at and clears failure fields on success', async () => {
    const admin = createPostRoundFake([
      { id: 'r1', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
    ]);
    mockTrigger.mockResolvedValue({ success: true, insights_created: 3 });

    await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r1' });

    const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r1');

    expect(error).toBeNull();
    expect(data?.[0]?.['coachhelm_analyzed_at']).toBeTruthy();
    expect(data?.[0]?.['coachhelm_failed_at']).toBeNull();
    expect(data?.[0]?.['coachhelm_failure_reason']).toBeNull();
  });

  it('an uncoded success:false is a permanent failure — nothing is read off the text', async () => {
    const admin = createPostRoundFake([
      { id: 'r2', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
    ]);
    mockTrigger.mockResolvedValue({ success: false, error: 'team disabled coachhelm' });

    const result = await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r2' });

    const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r2');

    expect(error).toBeNull();
    expect(data?.[0]?.['coachhelm_analyzed_at']).toBeFalsy();
    expect(data?.[0]?.['coachhelm_failed_at']).toBeTruthy();
    // The old sanitizer would have sniffed "disabled" out of the message and
    // stamped engine_disabled. An envelope that names no state is a failure.
    expect(data?.[0]?.['coachhelm_failure_reason']).toBe('engine_error');
    expect(result.outcome.kind).toBe('permanent_failure');
  });

  it('a thrown exception stamps failed with the code and keeps the exception in the log', async () => {
    const admin = createPostRoundFake([
      { id: 'r3', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
    ]);
    const boom = new RangeError('engine_boom');
    mockTrigger.mockRejectedValue(boom);

    await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r3' });

    const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r3');

    expect(error).toBeNull();
    expect(data?.[0]?.['coachhelm_failed_at']).toBeTruthy();
    expect(data?.[0]?.['coachhelm_failure_reason']).toBe('engine_error');
    const call = mocks.logServerError.mock.calls.find(([msg]) => String(msg).startsWith('postRoundTrigger outcome'));
    expect(call?.[2]).toBe('error');
    const extra = (call?.[1] as { extra?: Record<string, unknown> })?.extra;
    expect(extra).toMatchObject({ causeName: 'RangeError', causeMessage: 'engine_boom', roundId: 'r3' });
    expect(extra?.stack).toBe(boom.stack);
  });

  it('persists only the stable code — never the message — to the player-readable reason column', async () => {
    const long = 'x'.repeat(2000);
    const admin = createPostRoundFake([{ id: 'r4', player_id: 'p1', status: 'completed' }]);
    mockTrigger.mockRejectedValue(new Error(long));

    await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r4' });

    const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r4');

    expect(error).toBeNull();
    expect(data?.[0]?.['coachhelm_failure_reason']).toBe('engine_error');
  });

  it('never throws — fire-and-forget safe from after()', async () => {
    const admin = createPostRoundFake([{ id: 'r5', player_id: 'p1', status: 'completed' }]);
    mockTrigger.mockRejectedValue(new Error('boom'));

    await expect(postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r5' })).resolves.not.toThrow();
  });

  describe('typed outcomes (repair plan R3)', () => {
    it('rounds under the coach floor park: no analyzed stamp, NO failure stamp, waiting code recorded', async () => {
      const admin = createPostRoundFake([
        { id: 'r6', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
      ]);
      mockTrigger.mockResolvedValue({
        success: false,
        error: '2 completed rounds so far — CoachHelm speaks after 3',
        code: 'engine_below_round_floor',
        details: { completedRounds: 2, floor: 3 },
      });

      const result = await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r6' });

      const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r6');

      expect(error).toBeNull();
      expect(data?.[0]?.['coachhelm_analyzed_at']).toBeNull();
      expect(data?.[0]?.['coachhelm_failed_at']).toBeNull();
      expect(data?.[0]?.['coachhelm_failure_reason']).toBe('engine_below_round_floor');
      expect(result).toMatchObject({ success: false, code: 'engine_below_round_floor' });
      expect(result.outcome.kind).toBe('waiting_for_data');
      expect(mocks.logServerEvent).toHaveBeenCalledWith(
        expect.stringContaining('postRoundTrigger outcome waiting_for_data'),
        expect.objectContaining({
          skipSentry: true,
          errorCode: 'engine_below_round_floor',
          extra: expect.objectContaining({ details: { completedRounds: 2, floor: 3 } }),
        }),
        'info',
      );
      expect(mocks.logServerError).not.toHaveBeenCalled();
    });

    it('no completed rounds in the window parks the round the same way', async () => {
      const admin = createPostRoundFake([
        { id: 'r6b', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
      ]);
      mockTrigger.mockResolvedValue({
        success: false,
        error: 'No completed rounds in the last 90 days yet — insights will populate after the next round',
        code: 'engine_no_recent_rounds',
      });

      await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r6b' });

      const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r6b');

      expect(error).toBeNull();
      expect(data?.[0]?.['coachhelm_failed_at']).toBeNull();
      expect(data?.[0]?.['coachhelm_failure_reason']).toBe('engine_no_recent_rounds');
      expect(mocks.logServerError).not.toHaveBeenCalled();
    });

    it('an un-rostered player parks quietly at warning + skipSentry — a roster state, not an incident', async () => {
      const admin = createPostRoundFake([
        { id: 'r9', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
      ]);
      mockTrigger.mockResolvedValue({
        success: false,
        error: 'No active team membership for player',
        code: 'engine_no_team_membership',
      });

      const result = await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r9' });

      const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r9');

      expect(error).toBeNull();
      expect(data?.[0]?.['coachhelm_failed_at']).toBeNull();
      expect(data?.[0]?.['coachhelm_failure_reason']).toBe('engine_no_team_membership');
      expect(result.outcome.kind).toBe('not_applicable');
      expect(mocks.logServerError).toHaveBeenCalledWith(
        expect.stringContaining('postRoundTrigger outcome not_applicable'),
        expect.objectContaining({ skipSentry: true, errorCode: 'engine_no_team_membership' }),
        'warning',
      );
    });

    it('a team or coach switch-off parks quietly at info', async () => {
      const admin = createPostRoundFake([
        { id: 'r12', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
      ]);
      mockTrigger.mockResolvedValue({
        success: false,
        error: 'CoachHelm disabled for team',
        code: 'engine_disabled',
        details: { scope: 'team' },
      });

      const result = await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r12' });

      const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r12');

      expect(error).toBeNull();
      expect(data?.[0]?.['coachhelm_failed_at']).toBeNull();
      expect(data?.[0]?.['coachhelm_failure_reason']).toBe('engine_disabled');
      expect(result.outcome.kind).toBe('disabled');
      expect(mocks.logServerError).not.toHaveBeenCalled();
    });

    it('a transient fault stamps failed with a retryable code at warning, Sentry-visible', async () => {
      const admin = createPostRoundFake([
        { id: 'r13', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
      ]);
      mockTrigger.mockResolvedValue({
        success: false,
        error: 'Player analysis threw: canceling statement due to statement timeout',
        code: 'engine_timeout',
        cause: { name: 'Error', message: 'canceling statement due to statement timeout', code: '57014' },
      });

      const result = await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r13' });

      const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r13');

      expect(error).toBeNull();
      expect(data?.[0]?.['coachhelm_failed_at']).toBeTruthy();
      expect(data?.[0]?.['coachhelm_failure_reason']).toBe('engine_timeout');
      expect(result.outcome.kind).toBe('retryable_failure');
      expect(mocks.logServerError).toHaveBeenCalledWith(
        expect.stringContaining('postRoundTrigger outcome retryable_failure'),
        expect.objectContaining({
          errorCode: 'engine_timeout',
          extra: expect.objectContaining({ causeCode: '57014' }),
        }),
        'warning',
      );
      const call = mocks.logServerError.mock.calls[0];
      expect((call?.[1] as Record<string, unknown>).skipSentry).toBeUndefined();
    });

    it('a session-context failure is a permanent failure, not a retry loop', async () => {
      const admin = createPostRoundFake([
        { id: 'r7', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
      ]);
      mockTrigger.mockResolvedValue({
        success: false,
        error: 'Player analysis threw: Auth session missing!',
        code: 'engine_session_expired',
      });

      const result = await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r7' });

      const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r7');

      expect(error).toBeNull();
      expect(data?.[0]?.['coachhelm_failed_at']).toBeTruthy();
      expect(result.outcome.kind).toBe('permanent_failure');
      expect(mocks.logServerError).toHaveBeenCalledWith(
        expect.stringContaining('postRoundTrigger outcome permanent_failure'),
        expect.objectContaining({ errorCode: 'engine_session_expired' }),
        'error',
      );
    });

    it('zero findings is a success with a reason, not a failure', async () => {
      const admin = createPostRoundFake([
        { id: 'r14', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
      ]);
      mockTrigger.mockResolvedValue({ success: true, insights_created: 0 });

      const result = await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r14' });

      const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r14');

      expect(error).toBeNull();
      expect(data?.[0]?.['coachhelm_analyzed_at']).toBeTruthy();
      expect(data?.[0]?.['coachhelm_failure_reason']).toBeNull();
      expect(result).toMatchObject({ success: true, code: 'engine_succeeded' });
      expect(mocks.logServerError).not.toHaveBeenCalled();
      expect(mocks.logServerEvent).not.toHaveBeenCalled();
    });

    it('a partial run is analyzed with the partial marker and logged at warning + skipSentry', async () => {
      const admin = createPostRoundFake([
        { id: 'r15', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
      ]);
      mockTrigger.mockResolvedValue({ success: true, partial: true });

      const result = await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r15' });

      const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r15');

      expect(error).toBeNull();
      expect(data?.[0]?.['coachhelm_analyzed_at']).toBeTruthy();
      expect(data?.[0]?.['coachhelm_failed_at']).toBeNull();
      expect(data?.[0]?.['coachhelm_failure_reason']).toBe('engine_partial_failure');
      expect(result).toMatchObject({ success: true, partial: true, code: 'engine_partial_failure' });
      expect(mocks.logServerError).toHaveBeenCalledWith(
        expect.stringContaining('postRoundTrigger outcome partial'),
        expect.objectContaining({ skipSentry: true }),
        'warning',
      );
    });

    it('a parked round is not stuck — a later trigger for the round that clears the ' +
       'floor is analyzed normally, §15.2 "third eligible round arrives"', async () => {
      const admin = createPostRoundFake([
        { id: 'r16', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
      ]);
      mockTrigger.mockResolvedValue({
        success: false,
        error: '2 completed rounds so far — CoachHelm speaks after 3',
        code: 'engine_below_round_floor',
        details: { completedRounds: 2, floor: 3 },
      });
      const parked = await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r16' });
      expect(parked.outcome.kind).toBe('waiting_for_data');
      {
        const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r16');
        expect(error).toBeNull();
        expect(data?.[0]?.['coachhelm_analyzed_at']).toBeNull();
        expect(data?.[0]?.['coachhelm_failure_reason']).toBe('engine_below_round_floor');
      }

      // The third round completes and re-triggers analysis for the SAME
      // round row — the engine now sees enough evidence and wakes.
      mockTrigger.mockResolvedValue({ success: true, insights_created: 4 });
      const woke = await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r16' });
      expect(woke.outcome.kind).toBe('succeeded');

      const { data, error } = await admin.from('golf_rounds').select('*').eq('id', 'r16');
      expect(error).toBeNull();
      expect(data?.[0]?.['coachhelm_analyzed_at']).toBeTruthy();
      expect(data?.[0]?.['coachhelm_failed_at']).toBeNull();
      expect(data?.[0]?.['coachhelm_failure_reason']).toBeNull();
    });

    it('hands the engine code back so the safety net and queue consumer reach the same verdict', async () => {
      const admin = createPostRoundFake([
        { id: 'r10', player_id: 'p1', status: 'completed', coachhelm_analyzed_at: null },
      ]);
      mockTrigger.mockResolvedValue({
        success: false,
        error: 'No active team membership for player',
        code: 'engine_no_team_membership',
      });

      const result = await postRoundTrigger(admin as never, { playerId: 'p1', roundId: 'r10' });

      expect(result).toMatchObject({ success: false, code: 'engine_no_team_membership' });
      expect(result.outcome).toMatchObject({ kind: 'not_applicable', code: 'engine_no_team_membership' });
    });
  });
});
