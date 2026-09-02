import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above every const in this file, so the spy must be
// created inside vi.hoisted() for the factory to be able to close over it.
const { logServerEvent } = vi.hoisted(() => ({
  // Typed with logServerEvent's real 3-arg shape so `.mock.calls[0][2]`
  // (the severity) is indexable rather than a zero-length tuple.
  logServerEvent: vi.fn(
    async (_message: string, _context: Record<string, unknown>, _severity?: string) => {},
  ),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerEvent }));

import {
  reportIntegrationFault,
  inferIntegrationFaultKind,
} from '@/lib/admin/integration-health';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';
import { classifyIncident } from '@/lib/admin/incident-classification';

beforeEach(() => {
  logServerEvent.mockClear();
  __resetEmitThrottleForTests();
});

describe('inferIntegrationFaultKind', () => {
  it('detects rate limiting', () => {
    expect(inferIntegrationFaultKind('Sentry issues fetch failed: 429')).toBe('rate_limited');
    expect(inferIntegrationFaultKind('too many requests')).toBe('rate_limited');
  });

  it('detects a bad credential', () => {
    expect(inferIntegrationFaultKind('Vercel deployments fetch failed: 401')).toBe('invalid_credential');
    expect(inferIntegrationFaultKind('403 Forbidden')).toBe('invalid_credential');
    expect(inferIntegrationFaultKind('invalid token')).toBe('invalid_credential');
  });

  it('falls back to unavailable', () => {
    expect(inferIntegrationFaultKind('fetch threw: ECONNRESET')).toBe('unavailable');
    expect(inferIntegrationFaultKind('failed: 500')).toBe('unavailable');
  });
});

describe('reportIntegrationFault', () => {
  it('writes one durable event and resolves the detail unchanged', async () => {
    const detail = 'Sentry issues fetch failed: 500';
    await expect(reportIntegrationFault('sentry', 'issues fetch', detail)).resolves.toBe(detail);
    expect(logServerEvent).toHaveBeenCalledTimes(1);
  });

  it('emits a stable provider_ error code so one outage collapses to one incident', async () => {
    await reportIntegrationFault('sentry', 'issues fetch', 'failed: 429');
    const [, context] = logServerEvent.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(context.errorCode).toBe('provider_sentry_rate_limited');
  });

  it('skips Sentry — no code change fixes an expired token or a quota', async () => {
    await reportIntegrationFault('vercel', 'deployments fetch', 'failed: 401');
    const [, context] = logServerEvent.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(context.skipSentry).toBe(true);
  });

  it('tiers a self-healing rate limit as warning and a dead integration as error', async () => {
    await reportIntegrationFault('sentry', 'issues fetch', 'failed: 429');
    expect(logServerEvent.mock.calls[0]?.[2]).toBe('warning');

    __resetEmitThrottleForTests();
    logServerEvent.mockClear();
    await reportIntegrationFault('sentry', 'issues fetch', 'failed: 401');
    expect(logServerEvent.mock.calls[0]?.[2]).toBe('error');
  });

  it('THROTTLES repeats — these readers run on every render, so an unthrottled report would recreate the noise problem', async () => {
    for (let i = 0; i < 25; i++) {
      await reportIntegrationFault('sentry', 'issues fetch', 'failed: 500');
    }
    expect(logServerEvent).toHaveBeenCalledTimes(1);
  });

  it('does not collapse DIFFERENT providers into one throttle key', async () => {
    await reportIntegrationFault('sentry', 'issues fetch', 'failed: 500');
    await reportIntegrationFault('vercel', 'deployments fetch', 'failed: 500');
    expect(logServerEvent).toHaveBeenCalledTimes(2);
  });

  it('does not collapse different fault KINDS for one provider', async () => {
    await reportIntegrationFault('sentry', 'issues fetch', 'failed: 429');
    await reportIntegrationFault('sentry', 'issues fetch', 'failed: 401');
    expect(logServerEvent).toHaveBeenCalledTimes(2);
  });

  it('never rejects, even if the logger throws — a dead integration must not break the render that noticed', async () => {
    logServerEvent.mockImplementationOnce(() => {
      throw new Error('logger exploded');
    });
    await expect(reportIntegrationFault('github', 'pr timeline', 'failed: 500')).resolves.toBe('failed: 500');
  });

  it('produces rows the classifier maps to the integration kind — closing the loop', async () => {
    await reportIntegrationFault('sentry', 'issues fetch', 'failed: 429');
    const [message, context] = logServerEvent.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    const classified = classifyIncident({
      title: message,
      message,
      severity: 'warning',
      source: 'integrity',
      errorCode: context.errorCode as string,
    });
    expect(classified.klass).toBe('integration');
    expect(classified.actionable).toBe(true);
  });
});
