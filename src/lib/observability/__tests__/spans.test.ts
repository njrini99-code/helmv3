/**
 * `roundStage` and `classifyAutosaveOutcome` are what turns "TimeoutError"
 * into a specific, searchable outcome. These tests exist to lock the
 * taxonomy itself — a silent drift here (e.g. 'busy' starting to read as
 * 'rpc_failed') would make the Sentry dashboard quietly wrong without any
 * test elsewhere catching it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Span } from '@sentry/nextjs';

const startSpanMock = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  startSpan: (...args: unknown[]) => startSpanMock(...args),
}));

import {
  roundStage,
  classifyAutosaveOutcome,
  safeAttributes,
  describeDbErrorForSpan,
  finishWorkflowSpan,
  OP_SERVER_ACTION,
  OP_ROUND_STAGE,
  OP_ROUND_CREATE,
  OP_ROUND_AUTOSAVE,
  OP_ROUND_SUBMIT,
  OP_SHOT_PERSIST,
  OP_ROUND_RECOVER,
  OP_COACHHELM_REQUEST,
  OP_COACHHELM_PERSIST,
  OP_JOB_RUN,
  OP_PUSH_DELIVER,
  OP_AUTH_ATTEMPT,
  type WorkflowOutcome,
} from '../spans';

/** Minimal fake span capturing every setAttribute call for assertions. */
function fakeSpan() {
  const attributes: Record<string, unknown> = {};
  return {
    attributes,
    setAttribute: (key: string, value: unknown) => {
      attributes[key] = value;
    },
  };
}

async function runRoundStage<T>(
  fn: () => Promise<T>,
  classify?: (value: T) => string | undefined,
) {
  const span = fakeSpan();
  startSpanMock.mockImplementation((_opts: unknown, callback: (s: unknown) => unknown) => callback(span));
  let result: T | undefined;
  let thrown: unknown;
  try {
    result = await roundStage('test_stage', { holes_count: 18 }, fn, classify as never);
  } catch (err) {
    thrown = err;
  }
  return { span, result, thrown };
}

describe('roundStage', () => {
  beforeEach(() => {
    startSpanMock.mockReset();
  });

  it('marks a plain resolved value as success', async () => {
    const { span, result } = await runRoundStage(async () => ({ ok: true }));
    expect(result).toEqual({ ok: true });
    expect(span.attributes.result).toBe('success');
  });

  it('marks a resolved {error} shape as rpc_failed and attaches SQLSTATE', async () => {
    const { span, result } = await runRoundStage(async () => ({
      data: null,
      error: { code: '55000', message: 'Completed rounds are permanent history and cannot be changed.' },
    }));
    expect(result).toEqual({ data: null, error: { code: '55000', message: expect.any(String) } });
    expect(span.attributes.result).toBe('rpc_failed');
    expect(span.attributes.error_code).toBe('55000');
  });

  it('does not misclassify a resolved value with error: null as a failure', async () => {
    const { span } = await runRoundStage(async () => ({ data: { success: true }, error: null }));
    expect(span.attributes.result).toBe('success');
  });

  it('classifies a thrown timeout as timeout, not a generic error', async () => {
    const { span, thrown } = await runRoundStage(async () => {
      throw new Error('The operation was aborted due to timeout');
    });
    expect(thrown).toBeInstanceOf(Error);
    expect(span.attributes.result).toBe('timeout');
  });

  it('classifies a thrown AbortError-style message as timeout', async () => {
    const { span } = await runRoundStage(async () => {
      throw new Error('AbortError: signal is aborted');
    });
    expect(span.attributes.result).toBe('timeout');
  });

  it('classifies an unrelated thrown error as network_failed', async () => {
    const { span, thrown } = await runRoundStage(async () => {
      throw new Error('fetch failed');
    });
    expect(thrown).toBeInstanceOf(Error);
    expect(span.attributes.result).toBe('network_failed');
  });

  it('rethrows the original error unchanged', async () => {
    const original = new Error('boom');
    const { thrown } = await runRoundStage(async () => {
      throw original;
    });
    expect(thrown).toBe(original);
  });

  it('lets an explicit classifier override the generic heuristic', async () => {
    const { span } = await runRoundStage(
      async () => ({ data: { success: false, error: 'busy' }, error: null }),
      () => 'busy',
    );
    expect(span.attributes.result).toBe('busy');
  });

  it('falls back to the generic heuristic when the classifier returns undefined', async () => {
    const { span } = await runRoundStage(
      async () => ({ data: null, error: { code: '57014' } }),
      () => undefined,
    );
    expect(span.attributes.result).toBe('rpc_failed');
    expect(span.attributes.error_code).toBe('57014');
  });
});

describe('classifyAutosaveOutcome', () => {
  it('classifies success', () => {
    expect(classifyAutosaveOutcome({ data: { success: true }, error: null })).toBe('success');
  });

  it('classifies the single-flight busy guard as busy, not a failure', () => {
    expect(classifyAutosaveOutcome({ data: { success: false, error: 'busy' }, error: null })).toBe('busy');
  });

  it('classifies an optimistic-lock conflict as busy (expected coalescing, not an error)', () => {
    expect(classifyAutosaveOutcome({ data: { success: false, error: 'conflict' }, error: null })).toBe('busy');
  });

  it('classifies "already been completed" races as busy', () => {
    expect(
      classifyAutosaveOutcome({
        data: { success: false, error: 'Round has already been completed. Auto-save skipped.' },
        error: null,
      }),
    ).toBe('busy');
  });

  it('classifies a permission-shaped business error as auth_expired', () => {
    expect(
      classifyAutosaveOutcome({
        data: { success: false, error: 'Round not found or you do not have permission to update it.' },
        error: null,
      }),
    ).toBe('auth_expired');
  });

  it('classifies an unrecognized business error as rpc_failed', () => {
    expect(
      classifyAutosaveOutcome({ data: { success: false, error: 'something new' }, error: null }),
    ).toBe('rpc_failed');
  });

  it('defers to the generic DB-error path when a Postgres-level error is present', () => {
    expect(
      classifyAutosaveOutcome({ data: null, error: { code: '57014', message: 'statement timeout' } }),
    ).toBeUndefined();
  });
});

describe('safeAttributes', () => {
  it('drops null and undefined values', () => {
    expect(safeAttributes({ a: 1, b: null, c: undefined, d: 'x' })).toEqual({ a: 1, d: 'x' });
  });

  it('keeps falsy-but-defined values', () => {
    expect(safeAttributes({ a: 0, b: false, c: '' })).toEqual({ a: 0, b: false, c: '' });
  });
});

describe('describeDbErrorForSpan', () => {
  it('extracts code and error_type from an Error-shaped object', () => {
    const err = Object.assign(new Error('boom'), { code: '40P01' });
    expect(describeDbErrorForSpan(err)).toEqual({ error_code: '40P01', error_type: 'Error' });
  });

  it('returns an empty object for a non-object', () => {
    expect(describeDbErrorForSpan('just a string')).toEqual({});
    expect(describeDbErrorForSpan(null)).toEqual({});
  });
});

/**
 * Phase C's workflow ops. Locked here for the same reason the outcome
 * taxonomy above is locked: a renamed op silently orphans every saved
 * Sentry query and alert built on it, with no compiler or runtime signal.
 */
describe('workflow span ops', () => {
  it('are the exact stable strings Phase C instruments against', () => {
    expect({
      OP_ROUND_CREATE,
      OP_ROUND_AUTOSAVE,
      OP_ROUND_SUBMIT,
      OP_SHOT_PERSIST,
      OP_ROUND_RECOVER,
      OP_COACHHELM_REQUEST,
      OP_COACHHELM_PERSIST,
      OP_JOB_RUN,
      OP_PUSH_DELIVER,
      OP_AUTH_ATTEMPT,
    }).toEqual({
      OP_ROUND_CREATE: 'golf.round.create',
      OP_ROUND_AUTOSAVE: 'golf.round.autosave',
      OP_ROUND_SUBMIT: 'golf.round.submit',
      OP_SHOT_PERSIST: 'golf.shot.persist',
      OP_ROUND_RECOVER: 'golf.round.recover',
      OP_COACHHELM_REQUEST: 'coachhelm.request',
      OP_COACHHELM_PERSIST: 'coachhelm.persist',
      OP_JOB_RUN: 'job.run',
      OP_PUSH_DELIVER: 'push.deliver',
      OP_AUTH_ATTEMPT: 'auth.attempt',
    });
  });

  it('preserves the pre-existing round-stage op unchanged', () => {
    expect(OP_ROUND_STAGE).toBe('golf.round.stage');
    expect(OP_SERVER_ACTION).toBe('function.server_action');
  });
});

describe('finishWorkflowSpan', () => {
  it('sets the result attribute from the outcome', () => {
    const span = fakeSpan();
    finishWorkflowSpan(span as unknown as Span,'success');
    expect(span.attributes.result).toBe('success');
  });

  it('passes extra attributes through safeAttributes, dropping null/undefined', () => {
    const span = fakeSpan();
    finishWorkflowSpan(span as unknown as Span,'rpc_failed', { error_code: '57014', hint: null, detail: undefined });
    expect(span.attributes).toEqual({ result: 'rpc_failed', error_code: '57014' });
  });

  it('is a no-op when no span is active — never throws', () => {
    expect(() => finishWorkflowSpan(undefined, 'timeout', { error_code: 'ETIMEDOUT' })).not.toThrow();
  });

  it('accepts every WorkflowOutcome member, including the ones RoundStageOutcome does not have', () => {
    const extendedOnly: WorkflowOutcome[] = [
      'permission_denied',
      'conflict',
      'provider_failed',
      'not_found',
      'unknown',
    ];
    for (const outcome of extendedOnly) {
      const span = fakeSpan();
      finishWorkflowSpan(span as unknown as Span, outcome);
      expect(span.attributes.result).toBe(outcome);
    }
  });
});
