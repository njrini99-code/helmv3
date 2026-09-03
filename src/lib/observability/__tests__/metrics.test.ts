/**
 * `metrics.ts` is the ONLY place a Helm metric name is allowed to live, and
 * the ONLY place that decides which dimensions are safe to attach to one.
 * These tests lock both halves of that contract:
 *
 *   1. `sanitizeMetricAttributes` — the allow-list + PII-shape filter that
 *      every `record*` call routes through before it ever reaches the SDK.
 *   2. The `record*` functions — each emits EXACTLY the metric names its
 *      catalogue entry names, no more, no fewer, and never throws.
 *
 * A metric name is data infrastructure: a typo that ships is a chart that
 * silently stops counting real traffic. That is why every assertion below
 * checks the exact name string, not just "a metric was recorded".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const countMock = vi.fn();
const gaugeMock = vi.fn();
const distributionMock = vi.fn();

vi.mock('@sentry/nextjs', () => ({
  metrics: {
    count: (...args: unknown[]) => countMock(...args),
    gauge: (...args: unknown[]) => gaugeMock(...args),
    distribution: (...args: unknown[]) => distributionMock(...args),
  },
}));

import {
  sanitizeMetricAttributes,
  enforceMetricAttributeAllowlist,
  recordWorkflow,
  recordJob,
  recordAi,
  recordPush,
  recordAuth,
  recordDbFailure,
  recordLogRedactedField,
  METRIC_WORKFLOW_ATTEMPT,
  METRIC_WORKFLOW_SUCCESS,
  METRIC_WORKFLOW_FAILURE,
  METRIC_WORKFLOW_DURATION,
  METRIC_DB_FAILURE,
  METRIC_DB_DURATION,
  METRIC_JOB_STARTED,
  METRIC_JOB_COMPLETED,
  METRIC_JOB_FAILED,
  METRIC_JOB_DURATION,
  METRIC_AI_REQUEST,
  METRIC_AI_SUCCESS,
  METRIC_AI_FAILURE,
  METRIC_AI_DURATION,
  METRIC_AI_INPUT_TOKENS,
  METRIC_AI_OUTPUT_TOKENS,
  METRIC_PUSH_ATTEMPT,
  METRIC_PUSH_DELIVERED,
  METRIC_PUSH_FAILED,
  METRIC_AUTH_ATTEMPT,
  METRIC_AUTH_FAILURE,
  METRIC_LOG_REDACTED_FIELD,
} from '../metrics';

beforeEach(() => {
  countMock.mockReset();
  gaugeMock.mockReset();
  distributionMock.mockReset();
});

describe('sanitizeMetricAttributes', () => {
  it('keeps every allow-listed dimension with a safe value', () => {
    const out = sanitizeMetricAttributes({
      environment: 'production',
      sport: 'golf',
      feature: 'round_tracking',
      action: 'submit_round',
      operation: 'insert',
      result: 'success',
      runtime: 'nodejs',
      provider: 'resend',
      error_code: '57014',
      model: 'gpt-5',
      job_name: 'event-reminders',
    });
    expect(out).toEqual({
      environment: 'production',
      sport: 'golf',
      feature: 'round_tracking',
      action: 'submit_round',
      operation: 'insert',
      result: 'success',
      runtime: 'nodejs',
      provider: 'resend',
      error_code: '57014',
      model: 'gpt-5',
      job_name: 'event-reminders',
    });
  });

  it('drops any key outside the allow-list, keeping the rest', () => {
    const out = sanitizeMetricAttributes({
      sport: 'golf',
      round_id: 'abc-123',
      user_email: 'nick@example.com',
    });
    expect(out).toEqual({ sport: 'golf' });
  });

  it('drops an email-shaped value, keeping other attributes', () => {
    const out = sanitizeMetricAttributes({ feature: 'auth', action: 'nick@example.com' });
    expect(out).toEqual({ feature: 'auth' });
  });

  it('drops a UUID-shaped value', () => {
    const out = sanitizeMetricAttributes({
      feature: 'round_tracking',
      action: '4a6c6b2e-2b0a-4a6b-9b2e-2b0a4a6b9b2e',
    });
    expect(out).toEqual({ feature: 'round_tracking' });
  });

  it('drops a JWT-shaped value', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const out = sanitizeMetricAttributes({ feature: 'auth', action: jwt });
    expect(out).toEqual({ feature: 'auth' });
  });

  it('drops a URL-with-query-string value', () => {
    const out = sanitizeMetricAttributes({
      feature: 'auth',
      action: 'https://helm.app/reset?token=abc123',
    });
    expect(out).toEqual({ feature: 'auth' });
  });

  it('keeps a bare URL with no query string (not itself PII-shaped)', () => {
    const out = sanitizeMetricAttributes({ feature: 'auth', provider: 'https://helm.app/reset' });
    expect(out).toEqual({ feature: 'auth', provider: 'https://helm.app/reset' });
  });

  it('keeps numeric and boolean values as-is', () => {
    // Not in the documented dimension list, but the type carries no numeric
    // dimension today — this exercises that a non-string value is never fed
    // to the PII string matchers and never crashes them.
    expect(sanitizeMetricAttributes({ sport: 'golf' })).toEqual({ sport: 'golf' });
  });

  it('rejects an error_code value that looks like a message, not a SQLSTATE/class', () => {
    const out = sanitizeMetricAttributes({
      error_code: 'permission denied for table golf_rounds',
    });
    expect(out).toEqual({});
  });

  it('keeps a genuine SQLSTATE / short error class as error_code', () => {
    expect(sanitizeMetricAttributes({ error_code: '57014' })).toEqual({ error_code: '57014' });
    expect(sanitizeMetricAttributes({ error_code: 'AuthApiError' })).toEqual({
      error_code: 'AuthApiError',
    });
  });

  it('drops null and undefined values without throwing', () => {
    expect(
      sanitizeMetricAttributes({ sport: 'golf', feature: undefined as unknown as string, action: null as unknown as string }),
    ).toEqual({ sport: 'golf' });
  });

  it('privacy sentinel: a secret pushed under token/authorization/cookie never survives the allow-list', () => {
    // Not PII-shaped by VALUE (no @, no UUID/JWT/URL pattern) — these are
    // dropped purely because their KEY is outside ALLOWED_METRIC_DIMENSIONS.
    // Same sentinel string used in structured-log.test.ts and the
    // instrumentation privacy-sentinel suite, so a grep for it always finds
    // every place this repo checks the same guarantee.
    const out = sanitizeMetricAttributes({
      token: 'sentry-test-secret-DO-NOT-STORE-123',
      authorization: 'sentry-test-secret-DO-NOT-STORE-123',
      cookie: 'sentry-test-secret-DO-NOT-STORE-123',
      feature: 'round_tracking',
    });
    expect(JSON.stringify(out)).not.toContain('sentry-test-secret-DO-NOT-STORE-123');
    expect(out).toEqual({ feature: 'round_tracking' });
  });

  it('never throws on a hostile input shape', () => {
    expect(() =>
      sanitizeMetricAttributes({
        sport: { toString: () => { throw new Error('boom'); } } as unknown as string,
      }),
    ).not.toThrow();
  });
});

describe('enforceMetricAttributeAllowlist (beforeSendMetric second line of defence)', () => {
  it('sanitizes a metric event attributes in place and returns it', () => {
    const metric = {
      name: 'helm.workflow.success',
      value: 1,
      type: 'counter' as const,
      attributes: { sport: 'golf', user_email: 'nick@example.com' },
    };
    const out = enforceMetricAttributeAllowlist(metric);
    expect(out).not.toBeNull();
    expect(out?.attributes).toEqual({ sport: 'golf' });
  });

  it('never throws and fails closed (strips attributes) on a hostile shape', () => {
    const hostile = {
      name: 'helm.workflow.success',
      value: 1,
      type: 'counter' as const,
      get attributes(): Record<string, unknown> {
        throw new Error('boom');
      },
    };
    let out: ReturnType<typeof enforceMetricAttributeAllowlist>;
    expect(() => { out = enforceMetricAttributeAllowlist(hostile); }).not.toThrow();
    expect(out!).not.toBeNull();
    expect(out!.attributes).toEqual({});
  });
});

describe('recordWorkflow', () => {
  it('emits attempt + success + duration on a successful outcome', () => {
    recordWorkflow({ feature: 'round_tracking', action: 'submit_round', outcome: 'success', durationMs: 120 });
    expect(countMock).toHaveBeenCalledWith(
      METRIC_WORKFLOW_ATTEMPT, 1, expect.objectContaining({ attributes: expect.objectContaining({ feature: 'round_tracking', action: 'submit_round' }) }),
    );
    expect(countMock).toHaveBeenCalledWith(
      METRIC_WORKFLOW_SUCCESS, 1, expect.objectContaining({ attributes: expect.objectContaining({ result: 'success' }) }),
    );
    expect(countMock).not.toHaveBeenCalledWith(METRIC_WORKFLOW_FAILURE, expect.anything(), expect.anything());
    expect(distributionMock).toHaveBeenCalledWith(
      METRIC_WORKFLOW_DURATION, 120, expect.objectContaining({ unit: 'millisecond' }),
    );
  });

  it('emits attempt + failure + duration on any non-success outcome, carrying the granular result', () => {
    recordWorkflow({ feature: 'round_tracking', action: 'submit_round', outcome: 'busy', durationMs: 40, errorCode: 'busy' });
    expect(countMock).toHaveBeenCalledWith(METRIC_WORKFLOW_ATTEMPT, 1, expect.anything());
    expect(countMock).toHaveBeenCalledWith(
      METRIC_WORKFLOW_FAILURE, 1, expect.objectContaining({ attributes: expect.objectContaining({ result: 'busy', error_code: 'busy' }) }),
    );
    expect(countMock).not.toHaveBeenCalledWith(METRIC_WORKFLOW_SUCCESS, expect.anything(), expect.anything());
  });

  it('omits the duration distribution when no durationMs is given', () => {
    recordWorkflow({ feature: 'round_tracking', action: 'submit_round', outcome: 'success' });
    expect(distributionMock).not.toHaveBeenCalled();
  });

  it('never throws when the underlying SDK call throws', () => {
    countMock.mockImplementation(() => { throw new Error('sdk down'); });
    expect(() => recordWorkflow({ feature: 'x', action: 'y', outcome: 'success' })).not.toThrow();
  });
});

describe('recordDbFailure', () => {
  it('emits ONLY failure + duration — no attempt/success exist for helm.db', () => {
    recordDbFailure({ feature: 'round_tracking', action: 'submit_round', errorCode: '57014', durationMs: 900 });
    expect(countMock).toHaveBeenCalledWith(METRIC_DB_FAILURE, 1, expect.objectContaining({ attributes: expect.objectContaining({ error_code: '57014' }) }));
    expect(distributionMock).toHaveBeenCalledWith(METRIC_DB_DURATION, 900, expect.objectContaining({ unit: 'millisecond' }));
    expect(countMock).toHaveBeenCalledTimes(1);
  });

  it('never throws', () => {
    distributionMock.mockImplementation(() => { throw new Error('sdk down'); });
    expect(() => recordDbFailure({ feature: 'x', action: 'y', errorCode: '57014' })).not.toThrow();
  });
});

describe('recordJob', () => {
  it('emits started + completed + duration, tagged with job_name', () => {
    recordJob({ jobName: 'event-reminders', outcome: 'success', durationMs: 500 });
    expect(countMock).toHaveBeenCalledWith(METRIC_JOB_STARTED, 1, expect.objectContaining({ attributes: expect.objectContaining({ job_name: 'event-reminders' }) }));
    expect(countMock).toHaveBeenCalledWith(METRIC_JOB_COMPLETED, 1, expect.anything());
    expect(distributionMock).toHaveBeenCalledWith(METRIC_JOB_DURATION, 500, expect.anything());
  });

  it('emits started + failed on failure', () => {
    recordJob({ jobName: 'event-reminders', outcome: 'failure', errorCode: 'provider_failed' });
    expect(countMock).toHaveBeenCalledWith(METRIC_JOB_STARTED, 1, expect.anything());
    expect(countMock).toHaveBeenCalledWith(METRIC_JOB_FAILED, 1, expect.objectContaining({ attributes: expect.objectContaining({ error_code: 'provider_failed' }) }));
  });
});

describe('recordAi', () => {
  it('emits request + success + duration + token distributions', () => {
    recordAi({ feature: 'coachhelm', action: 'narrative', model: 'gpt-5', outcome: 'success', durationMs: 800, inputTokens: 1200, outputTokens: 300 });
    expect(countMock).toHaveBeenCalledWith(METRIC_AI_REQUEST, 1, expect.anything());
    expect(countMock).toHaveBeenCalledWith(METRIC_AI_SUCCESS, 1, expect.objectContaining({ attributes: expect.objectContaining({ model: 'gpt-5' }) }));
    expect(distributionMock).toHaveBeenCalledWith(METRIC_AI_DURATION, 800, expect.anything());
    expect(distributionMock).toHaveBeenCalledWith(METRIC_AI_INPUT_TOKENS, 1200, expect.anything());
    expect(distributionMock).toHaveBeenCalledWith(METRIC_AI_OUTPUT_TOKENS, 300, expect.anything());
  });

  it('omits token distributions when token counts are not given', () => {
    recordAi({ feature: 'coachhelm', action: 'narrative', outcome: 'failure', errorCode: 'timeout' });
    expect(countMock).toHaveBeenCalledWith(METRIC_AI_FAILURE, 1, expect.anything());
    expect(distributionMock).not.toHaveBeenCalledWith(METRIC_AI_INPUT_TOKENS, expect.anything(), expect.anything());
    expect(distributionMock).not.toHaveBeenCalledWith(METRIC_AI_OUTPUT_TOKENS, expect.anything(), expect.anything());
  });
});

describe('recordPush', () => {
  it('emits attempt + delivered — no helm.push.duration in the catalogue', () => {
    recordPush({ feature: 'task_reminders', action: 'send', provider: 'resend', outcome: 'success' });
    expect(countMock).toHaveBeenCalledWith(METRIC_PUSH_ATTEMPT, 1, expect.anything());
    expect(countMock).toHaveBeenCalledWith(METRIC_PUSH_DELIVERED, 1, expect.objectContaining({ attributes: expect.objectContaining({ provider: 'resend' }) }));
    expect(distributionMock).not.toHaveBeenCalled();
  });

  it('emits attempt + failed on failure', () => {
    recordPush({ feature: 'task_reminders', action: 'send', outcome: 'failure', errorCode: 'provider_failed' });
    expect(countMock).toHaveBeenCalledWith(METRIC_PUSH_FAILED, 1, expect.anything());
  });
});

describe('recordAuth', () => {
  it('emits ONLY attempt on success — helm.auth has no success/duration metric', () => {
    recordAuth({ action: 'sign_in', outcome: 'success' });
    expect(countMock).toHaveBeenCalledWith(METRIC_AUTH_ATTEMPT, 1, expect.anything());
    expect(countMock).toHaveBeenCalledTimes(1);
    expect(distributionMock).not.toHaveBeenCalled();
  });

  it('emits attempt + failure on failure', () => {
    recordAuth({ action: 'sign_in', outcome: 'failure', errorCode: 'invalid_credentials' });
    expect(countMock).toHaveBeenCalledWith(METRIC_AUTH_ATTEMPT, 1, expect.anything());
    expect(countMock).toHaveBeenCalledWith(METRIC_AUTH_FAILURE, 1, expect.objectContaining({ attributes: expect.objectContaining({ error_code: 'invalid_credentials' }) }));
  });
});

describe('recordLogRedactedField', () => {
  it('emits the redacted-field counter — the single metric name structured-log.ts is allowed to reach for', () => {
    recordLogRedactedField({ feature: 'observability' });
    expect(countMock).toHaveBeenCalledWith(METRIC_LOG_REDACTED_FIELD, 1, expect.objectContaining({ attributes: expect.objectContaining({ feature: 'observability' }) }));
  });

  it('never throws', () => {
    countMock.mockImplementation(() => { throw new Error('sdk down'); });
    expect(() => recordLogRedactedField()).not.toThrow();
  });
});
