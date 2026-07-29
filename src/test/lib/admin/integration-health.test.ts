import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above every const in this file, so the spy must be
// created inside vi.hoisted() for the factory to be able to close over it.
const { logServerEvent } = vi.hoisted(() => ({ logServerEvent: vi.fn(async () => {}) }));
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
  it('writes one durable event and returns the detail unchanged', () => {
    const detail = 'Sentry issues fetch failed: 500';
    expect(reportIntegrationFault('sentry', 'issues fetch', detail)).toBe(detail);
    expect(logServerEvent).toHaveBeenCalledTimes(1);
  });

  it('emits a stable provider_ error code so one outage collapses to one incident', () => {
    reportIntegrationFault('sentry', 'issues fetch', 'failed: 429');
    const [, context] = logServerEvent.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(context.errorCode).toBe('provider_sentry_rate_limited');
  });

  it('skips Sentry — no code change fixes an expired token or a quota', () => {
    reportIntegrationFault('vercel', 'deployments fetch', 'failed: 401');
    const [, context] = logServerEvent.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(context.skipSentry).toBe(true);
  });

  it('tiers a self-healing rate limit as warning and a dead integration as error', () => {
    reportIntegrationFault('sentry', 'issues fetch', 'failed: 429');
    expect(logServerEvent.mock.calls[0]?.[2]).toBe('warning');

    __resetEmitThrottleForTests();
    logServerEvent.mockClear();
    reportIntegrationFault('sentry', 'issues fetch', 'failed: 401');
    expect(logServerEvent.mock.calls[0]?.[2]).toBe('error');
  });

  it('THROTTLES repeats — these readers run on every render, so an unthrottled report would recreate the noise problem', () => {
    for (let i = 0; i < 25; i++) {
      reportIntegrationFault('sentry', 'issues fetch', 'failed: 500');
    }
    expect(logServerEvent).toHaveBeenCalledTimes(1);
  });

  it('does not collapse DIFFERENT providers into one throttle key', () => {
    reportIntegrationFault('sentry', 'issues fetch', 'failed: 500');
    reportIntegrationFault('vercel', 'deployments fetch', 'failed: 500');
    expect(logServerEvent).toHaveBeenCalledTimes(2);
  });

  it('does not collapse different fault KINDS for one provider', () => {
    reportIntegrationFault('sentry', 'issues fetch', 'failed: 429');
    reportIntegrationFault('sentry', 'issues fetch', 'failed: 401');
    expect(logServerEvent).toHaveBeenCalledTimes(2);
  });

  it('never throws, even if the logger rejects — a dead integration must not break the render that noticed', () => {
    logServerEvent.mockImplementationOnce(() => {
      throw new Error('logger exploded');
    });
    expect(() => reportIntegrationFault('github', 'pr timeline', 'failed: 500')).not.toThrow();
  });

  it('produces rows the classifier maps to the integration kind — closing the loop', () => {
    reportIntegrationFault('sentry', 'issues fetch', 'failed: 429');
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
