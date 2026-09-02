import { describe, expect, it, vi } from 'vitest';
import {
  createHelmFlightRecorder,
  recordRescuedStepOutcome,
  PERSIST_START_TIMEOUT_MS,
  type FlightRecorderDependencies,
} from '../helm-flight-recorder';

function fakeDependencies(
  overrides: Partial<FlightRecorderDependencies> = {},
): { dependencies: FlightRecorderDependencies; calls: Array<{ kind: string; payload: Record<string, unknown> }> } {
  const calls: Array<{ kind: string; payload: Record<string, unknown> }> = [];
  const dependencies: FlightRecorderDependencies = {
    newTraceId: () => '4a6c6b2e-2b0a-4a6b-9b2e-2b0a4a6b9b2e',
    startSpan: () => ({ traceId: 'sentry-trace', spanId: 'sentry-span', end: vi.fn(), setStatus: vi.fn() }),
    persistStart: async (payload) => { calls.push({ kind: 'start', payload }); },
    persistStep: async (payload) => { calls.push({ kind: 'step', payload }); },
    persistFinalize: async (payload) => { calls.push({ kind: 'finalize', payload }); },
    onRecorderFailure: vi.fn(),
    ...overrides,
  };
  return { dependencies, calls };
}

describe('Helm flight recorder', () => {
  it('is fail-open while still recording the failed required step after a database failure', async () => {
    const calls: Array<{ kind: string; payload: Record<string, unknown> }> = [];
    const dependencies: FlightRecorderDependencies = {
      newTraceId: () => '28f3c4cc-845c-4e4d-8d45-c5a996b0f5f5',
      startSpan: () => ({
        traceId: 'sentry-trace',
        spanId: 'sentry-span',
        end: vi.fn(),
        setStatus: vi.fn(),
      }),
      persistStart: async (payload) => { calls.push({ kind: 'start', payload }); },
      persistStep: async (payload) => { calls.push({ kind: 'step', payload }); },
      persistFinalize: async (payload) => { calls.push({ kind: 'finalize', payload }); },
      onRecorderFailure: vi.fn(),
    };

    const recorder = await createHelmFlightRecorder({
      workflow: 'golf.round.submit',
      roundId: 'bfaaa40f-9211-414a-aee9-a4dcd1d57159',
      playerId: '9a0833a2-ec38-4190-8082-af40ac00fa22',
    }, dependencies);

    await recorder.complete('server.validation');
    await recorder.complete('server.auth');
    await recorder.complete('server.player');
    await recorder.fail('db.submit_round_atomic', {
      errorCode: '23503',
      errorSummary: 'foreign key violation',
    });
    await recorder.finalize('failure');

    const final = calls.at(-1);
    // verify.round/holes/shots are 'best_effort' (2026-09-02), so a submit
    // that never reaches them because the write itself failed does not ALSO
    // report them missing — missing_required_step_count reflects only
    // server.validation/auth/player and db.submit_round_atomic, all of
    // which ran (the last one to failure) above.
    expect(final).toMatchObject({
      kind: 'finalize',
      payload: {
        traceId: '28f3c4cc-845c-4e4d-8d45-c5a996b0f5f5',
        status: 'failure',
        metadata: {
          missing_required_step_count: 0,
          failure_step: 'db.submit_round_atomic',
          failure_code: '23503',
        },
      },
    });
    expect(calls.filter((call) => call.kind === 'step').map((call) => call.payload.stepKey))
      .toContain('db.submit_round_atomic');
  });

  it('never turns a recorder write outage into a business-operation failure', async () => {
    const onRecorderFailure = vi.fn();
    const dependencies: FlightRecorderDependencies = {
      newTraceId: () => '152b95ff-0d54-4b43-9787-ff9998d30182',
      startSpan: () => ({ traceId: 'sentry-trace', spanId: 'sentry-span', end: vi.fn(), setStatus: vi.fn() }),
      persistStart: async () => { throw new Error('debug store unavailable'); },
      persistStep: async () => { throw new Error('debug store unavailable'); },
      persistFinalize: async () => { throw new Error('debug store unavailable'); },
      onRecorderFailure,
    };

    const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.autosave' }, dependencies);
    await expect(recorder.complete('server.validation')).resolves.toBeUndefined();
    await expect(recorder.finalize('success')).resolves.toBeUndefined();
    expect(onRecorderFailure).toHaveBeenCalled();
  });

  describe('span.setStatus()/.end() can never reject finalize() or createHelmFlightRecorder()', () => {
    // golf.ts calls `void flightRecorder.finalize(...)` with no `.catch()`.
    // Before this fix, span.setStatus()/.end() ran AFTER failOpen's own
    // try/catch, so a throw there escaped as an unhandled rejection on the
    // round-save hot path instead of a caught, reported one.
    it('reports the span failure via onRecorderFailure instead of rejecting finalize()', async () => {
      const onRecorderFailure = vi.fn();
      const dependencies: FlightRecorderDependencies = {
        newTraceId: () => '2e158c0f-46f0-4a8f-9c1e-9f6c2a9f0b1a',
        startSpan: () => ({
          traceId: 'sentry-trace',
          spanId: 'sentry-span',
          setStatus: () => { throw new Error('span backend unavailable'); },
          end: vi.fn(),
        }),
        persistStart: async () => {},
        persistStep: async () => {},
        persistFinalize: async () => {},
        onRecorderFailure,
      };

      const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.submit' }, dependencies);
      await expect(recorder.finalize('success')).resolves.toBeUndefined();
      expect(onRecorderFailure).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({ operation: 'span_close' }),
      );
    });

    it('reports the span failure via onRecorderFailure instead of rejecting the timeout-degrade path', async () => {
      vi.useFakeTimers();
      try {
        const onRecorderFailure = vi.fn();
        const dependencies: FlightRecorderDependencies = {
          newTraceId: () => 'b1f2a3c4-5d6e-7f80-9102-030405060708',
          startSpan: () => ({
            traceId: 'sentry-trace',
            spanId: 'sentry-span',
            setStatus: () => { throw new Error('span backend unavailable'); },
            end: vi.fn(),
          }),
          persistStart: () => new Promise(() => {}),
          persistStep: async () => {},
          persistFinalize: async () => {},
          onRecorderFailure,
        };

        const pending = createHelmFlightRecorder({ workflow: 'golf.round.submit' }, dependencies);
        await vi.advanceTimersByTimeAsync(PERSIST_START_TIMEOUT_MS + 50);

        await expect(pending).resolves.toBeDefined();
        expect(onRecorderFailure).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({ operation: 'span_close' }),
        );
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('degrades to a no-op recorder when persistStart hangs', () => {
    it('never lets the caller hang, and never leaves the Sentry span open', async () => {
      vi.useFakeTimers();
      try {
        const spanEnd = vi.fn();
        const spanSetStatus = vi.fn();
        const onRecorderFailure = vi.fn();
        const persistStep = vi.fn(async () => {});
        const dependencies: FlightRecorderDependencies = {
          newTraceId: () => '7c9e6679-7425-40de-944b-e07fc1f90ae7',
          startSpan: () => ({ traceId: 'sentry-trace', spanId: 'sentry-span', end: spanEnd, setStatus: spanSetStatus }),
          // Never settles — models a hung admin-client RPC, exactly the
          // incident-time condition this bound exists for.
          persistStart: () => new Promise(() => {}),
          persistStep,
          persistFinalize: async () => {},
          onRecorderFailure,
        };

        const pending = createHelmFlightRecorder({ workflow: 'golf.round.submit' }, dependencies);
        await vi.advanceTimersByTimeAsync(PERSIST_START_TIMEOUT_MS + 50);

        // Without the bound this await would hang the test the same way it
        // would have hung the round-submit caller.
        const recorder = await pending;

        expect(onRecorderFailure).toHaveBeenCalled();
        expect(spanSetStatus).toHaveBeenCalledWith('internal_error');
        expect(spanEnd).toHaveBeenCalled();

        // The degraded recorder is the same inert shape as the disabled-mode
        // no-op: every method resolves immediately and writes nothing.
        await expect(recorder.start('server.validation')).resolves.toBeUndefined();
        await expect(recorder.fail('db.submit_round_atomic', { errorCode: 'X' })).resolves.toBeUndefined();
        await expect(recorder.finalize('failure')).resolves.toBeUndefined();
        expect(persistStep).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('still records normally when persistStart settles well inside the bound', async () => {
      vi.useFakeTimers();
      try {
        // persistStart resolves on the next microtask here, with the fake
        // clock never advanced — proving the race resolves on the write's
        // own completion rather than needing the timer to fire at all.
        const { dependencies, calls } = fakeDependencies();
        const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.submit' }, dependencies);

        expect(calls.some((c) => c.kind === 'start')).toBe(true);
        await expect(recorder.complete('server.validation')).resolves.toBeUndefined();
        expect(calls.some((c) => c.kind === 'step')).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe('recordRescuedStepOutcome', () => {
  it('reports the trace as a success — not a failure — when the fallback rescued the write', async () => {
    const { dependencies, calls } = fakeDependencies();
    const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.submit' }, dependencies);

    await recordRescuedStepOutcome(recorder, {
      failedStepKey: 'db.submit_round_atomic',
      fallbackStepKey: 'db.direct_submit_fallback',
      rescued: true,
      stepInput: { errorCode: '57014', errorSummary: 'statement timeout' },
      fallbackStepInput: { observed: { round_id: 'r-1' } },
    });

    // THE ASSERTION THAT MATTERS: this is the real, non-mocked finalize()
    // logic — the same `trace.steps().find(s => s.status === 'failure')`
    // override that caused the original bug. If the RPC step had been
    // marked `fail()` at any point, this would persist 'failure' regardless
    // of the `status` argument passed to finalize(). It must not.
    const final = calls.at(-1);
    expect(final).toMatchObject({ kind: 'finalize', payload: { status: 'success' } });

    // The RPC step itself is a warning, not a failure — the trace should
    // never claim the primary path silently succeeded.
    const rpcStepCalls = calls.filter((c) => c.kind === 'step' && c.payload.stepKey === 'db.submit_round_atomic');
    expect(rpcStepCalls.at(-1)).toMatchObject({ payload: { status: 'warning' } });
    expect(rpcStepCalls.some((c) => c.payload.status === 'failure')).toBe(false);

    // The fallback path is recorded as its own completed step.
    const fallbackStepCalls = calls.filter((c) => c.kind === 'step' && c.payload.stepKey === 'db.direct_submit_fallback');
    expect(fallbackStepCalls.map((c) => c.payload.status)).toEqual(['started', 'success']);
  });

  it('still reports failure when the fallback did not rescue the write', async () => {
    const { dependencies, calls } = fakeDependencies();
    const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.submit' }, dependencies);

    await recordRescuedStepOutcome(recorder, {
      failedStepKey: 'db.submit_round_atomic',
      fallbackStepKey: 'db.direct_submit_fallback',
      rescued: false,
      stepInput: { errorCode: '57014', errorSummary: 'statement timeout' },
    });

    const final = calls.at(-1);
    expect(final).toMatchObject({ kind: 'finalize', payload: { status: 'failure' } });

    const rpcStepCalls = calls.filter((c) => c.kind === 'step' && c.payload.stepKey === 'db.submit_round_atomic');
    expect(rpcStepCalls.at(-1)).toMatchObject({ payload: { status: 'failure' } });

    // The fallback step was never attempted — no fallback ran.
    expect(calls.some((c) => c.kind === 'step' && c.payload.stepKey === 'db.direct_submit_fallback')).toBe(false);
  });
});
