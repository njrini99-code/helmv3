import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * A MISSING Inngest signing key was invisible to the Bridge; only a mismatched
 * one was diagnosed. In production an absent credential silently turns every
 * durable job off, so it is a fault and it must be written down — throttled,
 * as one incident, naming the variable and never its value.
 */
const mocks = vi.hoisted(() => ({
  logServerError: vi.fn(async (..._args: unknown[]) => {}),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));

import {
  inngestCredentialState,
  describeInngestCredentialFault,
  reportInngestCredentialFault,
  INNGEST_MISSING_CREDENTIAL_CODE,
} from '@/lib/inngest/credentials';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';
import { classifyIncident } from '@/lib/admin/incident-classification';
import { buildIncidentSignature } from '@/lib/admin/incident-grouping';

const GOOD_SIGNING = `signkey-prod-${'0a'.repeat(32)}`;
const GOOD_EVENT = 'A'.repeat(86);

const prod = (over: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({
  VERCEL_ENV: 'production',
  INNGEST_SIGNING_KEY: GOOD_SIGNING,
  INNGEST_EVENT_KEY: GOOD_EVENT,
  ...over,
});

describe('inngestCredentialState', () => {
  it('is usable only when BOTH keys are present and well-formed', () => {
    expect(inngestCredentialState(prod())).toEqual({ signingKey: 'ok', eventKey: 'ok', usable: true });
    expect(inngestCredentialState(prod({ INNGEST_SIGNING_KEY: undefined }))).toMatchObject({
      signingKey: 'missing',
      usable: false,
    });
    expect(inngestCredentialState(prod({ INNGEST_EVENT_KEY: '' }))).toMatchObject({ eventKey: 'missing', usable: false });
  });

  it('an 11-character placeholder is not "configured" — the exact shape that fooled the old check', () => {
    expect(inngestCredentialState(prod({ INNGEST_SIGNING_KEY: 'abcdefghijk' }))).toMatchObject({
      signingKey: 'malformed',
      usable: false,
    });
  });

  it('describes faults by variable name only', () => {
    const clauses = describeInngestCredentialFault(
      inngestCredentialState(prod({ INNGEST_SIGNING_KEY: undefined, INNGEST_EVENT_KEY: 'your-key' })),
    );
    expect(clauses).toEqual(['INNGEST_SIGNING_KEY is missing', 'INNGEST_EVENT_KEY is placeholder']);
  });
});

describe('reportInngestCredentialFault', () => {
  beforeEach(() => {
    mocks.logServerError.mockClear();
    __resetEmitThrottleForTests();
  });
  afterEach(() => __resetEmitThrottleForTests());

  it('writes an error row for feature `integrations` with the provider_ code when the signing key is absent in production', async () => {
    const wrote = await reportInngestCredentialFault('startup', prod({ INNGEST_SIGNING_KEY: undefined }));

    expect(wrote).toBe(true);
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
    const [message, ctx, severity] = mocks.logServerError.mock.calls[0] as [string, Record<string, unknown>, string];
    expect(severity).toBe('error');
    expect(ctx).toMatchObject({
      feature: 'integrations',
      errorCode: INNGEST_MISSING_CREDENTIAL_CODE,
      action: 'inngest.credentials.startup',
      source: 'integrity',
    });
    expect(message).toMatch(/INNGEST_SIGNING_KEY is missing/);
    expect(message).toMatch(/REDEPLOY/);
    // Never the value.
    expect(JSON.stringify([message, ctx])).not.toContain(GOOD_EVENT);
  });

  it('is silent when both keys are usable', async () => {
    expect(await reportInngestCredentialFault('send', prod())).toBe(false);
    expect(mocks.logServerError).not.toHaveBeenCalled();
  });

  it('is silent outside production — preview and local opt out of Inngest legitimately', async () => {
    expect(await reportInngestCredentialFault('send', prod({ VERCEL_ENV: 'preview', INNGEST_SIGNING_KEY: undefined }))).toBe(false);
    expect(await reportInngestCredentialFault('send', { INNGEST_SIGNING_KEY: undefined })).toBe(false);
    expect(mocks.logServerError).not.toHaveBeenCalled();
  });

  it('throttles repeats — a cold start per lambda must not flood the queue', async () => {
    const env = prod({ INNGEST_SIGNING_KEY: undefined });
    for (let i = 0; i < 20; i++) await reportInngestCredentialFault('send', env);
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
  });

  it('never throws when the logger does', async () => {
    mocks.logServerError.mockImplementationOnce(() => {
      throw new Error('logger exploded');
    });
    await expect(reportInngestCredentialFault('inbound', prod({ INNGEST_SIGNING_KEY: undefined }))).resolves.toBe(true);
  });

  it('produces a row the classifier calls an actionable integration fault, folded into ONE incident across triggers', async () => {
    await reportInngestCredentialFault('startup', prod({ INNGEST_SIGNING_KEY: undefined }));
    const [message, ctx] = mocks.logServerError.mock.calls[0] as [string, Record<string, unknown>];
    const classified = classifyIncident({
      title: message,
      message,
      severity: 'error',
      source: 'integrity',
      errorCode: ctx.errorCode as string,
    });
    expect(classified.klass).toBe('integration');
    expect(classified.actionable).toBe(true);

    const sigA = buildIncidentSignature({ severity: 'error', errorCode: INNGEST_MISSING_CREDENTIAL_CODE, route: '/api/inngest', message: 'x' });
    const sigB = buildIncidentSignature({ severity: 'error', errorCode: INNGEST_MISSING_CREDENTIAL_CODE, route: null, message: 'y' });
    expect(sigA).toBe(sigB);
  });
});
