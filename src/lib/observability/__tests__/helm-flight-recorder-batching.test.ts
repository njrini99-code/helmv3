import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { attachHelmTrace, recordWorkflow, helmLog, rpc, captureException } = vi.hoisted(() => ({
  attachHelmTrace: vi.fn(),
  recordWorkflow: vi.fn(),
  helmLog: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  rpc: vi.fn(),
  captureException: vi.fn(),
}));
vi.mock('../correlation', () => ({ attachHelmTrace }));
vi.mock('../metrics', () => ({ recordWorkflow }));
vi.mock('../structured-log', () => ({ helmLog }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock('@sentry/nextjs', () => ({
  startInactiveSpan: () => ({
    spanContext: () => ({ traceId: 'sentry-trace', spanId: 'sentry-span' }),
    end: vi.fn(),
    setStatus: vi.fn(),
  }),
  withScope: (callback: (scope: Record<string, unknown>) => void) =>
    callback({ setLevel: vi.fn(), setTag: vi.fn(), setContext: vi.fn() }),
  captureException,
}));

import {
  STEP_BATCH_MAX,
  STEP_BATCH_WINDOW_MS,
  __resetBatchRpcProbeForTests,
  createHelmFlightRecorder,
  type FlightRecorderDependencies,
} from '../helm-flight-recorder';

const STEP_KEYS = ['server.validation', 'server.auth', 'server.player'];

type Call = { kind: string; payload: Record<string, unknown> | Array<Record<string, unknown>> };

function batchingDependencies(overrides: Partial<FlightRecorderDependencies> = {}) {
  const calls: Call[] = [];
  const dependencies: FlightRecorderDependencies = {
    newTraceId: () => '4a6c6b2e-2b0a-4a6b-9b2e-2b0a4a6b9b2e',
    startSpan: () => ({ traceId: 'sentry-trace', spanId: 'sentry-span', end: vi.fn(), setStatus: vi.fn() }),
    persistStart: async (payload) => { calls.push({ kind: 'start', payload }); },
    persistStep: async (payload) => { calls.push({ kind: 'step', payload }); },
    persistSteps: async (payloads) => { calls.push({ kind: 'steps', payload: payloads }); },
    persistFinalize: async (payload) => { calls.push({ kind: 'finalize', payload }); },
    onRecorderFailure: vi.fn(),
    ...overrides,
  };
  return { dependencies, calls };
}

beforeEach(() => {
  attachHelmTrace.mockClear();
  recordWorkflow.mockClear();
  rpc.mockReset();
  captureException.mockClear();
  __resetBatchRpcProbeForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('flight recorder step batching', () => {
  it('writes a whole round save as one batch, in order, before the finalize write', async () => {
    const { dependencies, calls } = batchingDependencies();
    const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.submit' }, dependencies);

    for (const key of STEP_KEYS) await recorder.start(key);
    for (const key of STEP_KEYS) await recorder.complete(key);
    await recorder.finalize('success');

    expect(calls.filter((c) => c.kind === 'step')).toHaveLength(0);
    const batches = calls.filter((c) => c.kind === 'steps');
    expect(batches).toHaveLength(1);
    const payloads = batches[0]!.payload as Array<Record<string, unknown>>;
    expect(payloads.map((p) => `${p.stepKey}:${p.status}`)).toEqual([
      'server.validation:started', 'server.auth:started', 'server.player:started',
      'server.validation:success', 'server.auth:success', 'server.player:success',
    ]);
    const order = calls.map((c) => c.kind);
    expect(order.indexOf('steps')).toBeLessThan(order.indexOf('finalize'));
  });

  it('does not make a step wait for the database', async () => {
    let releaseBatch: () => void = () => {};
    const { dependencies } = batchingDependencies({
      persistSteps: () => new Promise<void>((resolve) => { releaseBatch = resolve; }),
    });
    const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.submit' }, dependencies);
    await expect(recorder.complete('server.auth')).resolves.toBeUndefined();
    releaseBatch();
  });

  it('flushes on its own once the coalescing window passes, without finalize', async () => {
    vi.useFakeTimers();
    const { dependencies, calls } = batchingDependencies();
    const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.submit' }, dependencies);

    await recorder.complete('server.validation');
    await recorder.complete('server.auth');
    expect(calls.filter((c) => c.kind === 'steps')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(STEP_BATCH_WINDOW_MS + 1);
    const batches = calls.filter((c) => c.kind === 'steps');
    expect(batches).toHaveLength(1);
    expect(batches[0]!.payload).toHaveLength(2);
  });

  it('flushes early when the buffer reaches the size cap', async () => {
    vi.useFakeTimers();
    const { dependencies, calls } = batchingDependencies();
    const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.submit' }, dependencies);

    for (let i = 0; i < STEP_BATCH_MAX; i += 1) {
      await recorder.complete(STEP_KEYS[i % STEP_KEYS.length]!);
    }
    await vi.advanceTimersByTimeAsync(0);
    const batches = calls.filter((c) => c.kind === 'steps');
    expect(batches).toHaveLength(1);
    expect(batches[0]!.payload).toHaveLength(STEP_BATCH_MAX);
  });

  it('stays fail-open: a failed batch is reported and finalize still runs', async () => {
    const onRecorderFailure = vi.fn();
    const { dependencies, calls } = batchingDependencies({
      persistSteps: async () => { throw new Error('debug store unavailable'); },
      onRecorderFailure,
    });
    const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.submit' }, dependencies);
    await recorder.complete('server.auth');
    await expect(recorder.finalize('success')).resolves.toBeUndefined();

    expect(onRecorderFailure).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ operation: 'steps_batch' }),
    );
    expect(calls.some((c) => c.kind === 'finalize')).toBe(true);
  });

  it('keeps one write per step for a dependency set without a batch writer', async () => {
    const { dependencies, calls } = batchingDependencies({ persistSteps: undefined });
    const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.submit' }, dependencies);
    await recorder.complete('server.validation');
    await recorder.complete('server.auth');
    await recorder.finalize('success');
    expect(calls.filter((c) => c.kind === 'step')).toHaveLength(2);
    expect(calls.filter((c) => c.kind === 'steps')).toHaveLength(0);
  });
});

describe('flight recorder default writer', () => {
  it('sends one helm_debug_record_trace_steps call for a whole save', async () => {
    rpc.mockResolvedValue({ error: null });
    const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.submit' });
    await recorder.complete('server.validation');
    await recorder.complete('server.auth');
    await recorder.complete('server.player');
    await recorder.finalize('success');

    const names = rpc.mock.calls.map((call) => call[0]);
    expect(names.filter((n) => n === 'helm_debug_record_trace_step')).toHaveLength(0);
    expect(names.filter((n) => n === 'helm_debug_record_trace_steps')).toHaveLength(1);
    const batchArgs = rpc.mock.calls.find((call) => call[0] === 'helm_debug_record_trace_steps')![1] as {
      p_steps: Array<{ step_key: string }>;
    };
    expect(batchArgs.p_steps.map((s) => s.step_key)).toEqual(['server.validation', 'server.auth', 'server.player']);
  });

  it('tells the database how long ago each buffered step happened, so start and complete keep a real elapsed time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-07T12:00:00.000Z'));
    rpc.mockResolvedValue({ error: null });
    const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.submit' });

    await recorder.start('server.auth');
    await vi.advanceTimersByTimeAsync(300);
    await recorder.complete('server.auth');
    await vi.advanceTimersByTimeAsync(50);
    await recorder.finalize('success');

    const batchArgs = rpc.mock.calls.find((call) => call[0] === 'helm_debug_record_trace_steps')![1] as {
      p_steps: Array<{ status: string; age_ms: number }>;
    };
    expect(batchArgs.p_steps.map((s) => s.status)).toEqual(['started', 'success']);
    expect(batchArgs.p_steps[0]!.age_ms).toBe(350);
    expect(batchArgs.p_steps[1]!.age_ms).toBe(50);
    // started_at - finished_at between the two writes is the real 300 ms.
    expect(batchArgs.p_steps[0]!.age_ms - batchArgs.p_steps[1]!.age_ms).toBe(300);
  });

  it('writes a recorder created after the batch function was found missing one step at a time, as it happens', async () => {
    rpc.mockImplementation(async (name: string) => (
      name === 'helm_debug_record_trace_steps'
        ? { error: { code: 'PGRST202', message: 'Could not find the function public.helm_debug_record_trace_steps' } }
        : { error: null }
    ));
    const first = await createHelmFlightRecorder({ workflow: 'golf.round.submit' });
    await first.complete('server.auth');
    await first.finalize('success');

    rpc.mockClear();
    const second = await createHelmFlightRecorder({ workflow: 'golf.round.submit' });
    await second.complete('server.auth');
    // Written inline, before finalize: no buffering, so no backdating is needed.
    expect(rpc.mock.calls.map((call) => call[0])).toContain('helm_debug_record_trace_step');
  });

  it('falls back to the per-step RPC while the batch function is not deployed, and stops probing', async () => {
    rpc.mockImplementation(async (name: string) => (
      name === 'helm_debug_record_trace_steps'
        ? { error: { code: 'PGRST202', message: 'Could not find the function public.helm_debug_record_trace_steps' } }
        : { error: null }
    ));

    const first = await createHelmFlightRecorder({ workflow: 'golf.round.submit' });
    await first.complete('server.validation');
    await first.complete('server.auth');
    await first.finalize('success');

    const names = rpc.mock.calls.map((call) => call[0]);
    expect(names.filter((n) => n === 'helm_debug_record_trace_steps')).toHaveLength(1);
    expect(names.filter((n) => n === 'helm_debug_record_trace_step')).toHaveLength(2);
    expect(captureException).not.toHaveBeenCalled();

    rpc.mockClear();
    const second = await createHelmFlightRecorder({ workflow: 'golf.round.submit' });
    await second.complete('server.validation');
    await second.finalize('success');
    const secondNames = rpc.mock.calls.map((call) => call[0]);
    expect(secondNames).not.toContain('helm_debug_record_trace_steps');
    expect(secondNames).toContain('helm_debug_record_trace_step');
  });

  it('reports any other batch error instead of silently falling back', async () => {
    rpc.mockImplementation(async (name: string) => (
      name === 'helm_debug_record_trace_steps'
        ? { error: { code: '23514', message: 'check constraint violated' } }
        : { error: null }
    ));
    const recorder = await createHelmFlightRecorder({ workflow: 'golf.round.submit' });
    await recorder.complete('server.validation');
    await recorder.finalize('success');
    expect(captureException).toHaveBeenCalled();
    expect(rpc.mock.calls.map((call) => call[0])).not.toContain('helm_debug_record_trace_step');
  });
});
