import { describe, expect, it, vi } from 'vitest';
import {
  createHelmFlightRecorder,
  type FlightRecorderDependencies,
} from '../helm-flight-recorder';

describe('Helm flight recorder', () => {
  it('is fail-open while still recording missing required work after a database failure', async () => {
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
    expect(final).toMatchObject({
      kind: 'finalize',
      payload: {
        traceId: '28f3c4cc-845c-4e4d-8d45-c5a996b0f5f5',
        status: 'failure',
        metadata: {
          missing_required_step_count: 3,
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
});
