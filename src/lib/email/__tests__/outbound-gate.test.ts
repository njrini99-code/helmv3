import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const logEmailSuppressedMock = vi.fn(async (_params: Record<string, unknown>) => 'event-id-1');
vi.mock('@/lib/admin-logger', () => ({
  logEmailSuppressed: (params: Record<string, unknown>) => logEmailSuppressedMock(params),
}));

import { isCustomerEmailEnabled, gateCustomerEmail } from '@/lib/email/outbound-gate';
import { __resetEmitThrottleForTests } from '@/lib/admin/emit-throttle';

describe('isCustomerEmailEnabled', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is OFF when the var is unset', () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', '');
    delete process.env.HELM_CUSTOMER_EMAIL_ENABLED;
    expect(isCustomerEmailEnabled()).toBe(false);
  });

  it('is OFF for "false"', () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', 'false');
    expect(isCustomerEmailEnabled()).toBe(false);
  });

  it('is OFF for "TRUE" (case-sensitive exact match only)', () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', 'TRUE');
    expect(isCustomerEmailEnabled()).toBe(false);
  });

  it('is OFF for "1"', () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', '1');
    expect(isCustomerEmailEnabled()).toBe(false);
  });

  it('is ON only for the exact string "true"', () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', 'true');
    expect(isCustomerEmailEnabled()).toBe(true);
  });
});

describe('gateCustomerEmail', () => {
  beforeEach(() => {
    logEmailSuppressedMock.mockClear();
    __resetEmitThrottleForTests();
  });
  afterEach(() => vi.unstubAllEnvs());

  it('allows when the switch is on', () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', 'true');
    const result = gateCustomerEmail({ kind: 'task_reminder', recipientCount: 1, source: 'test' });
    expect(result).toEqual({ allowed: true });
    expect(logEmailSuppressedMock).not.toHaveBeenCalled();
  });

  it('disallows when the switch is off and logs one admin event with no address fields', () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', '');
    const result = gateCustomerEmail({ kind: 'task_reminder', recipientCount: 3, source: 'test.site' });

    expect(result).toEqual({ allowed: false, reason: 'customer_email_disabled' });
    expect(logEmailSuppressedMock).toHaveBeenCalledTimes(1);
    const payload = logEmailSuppressedMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toMatchObject({ kind: 'task_reminder', source: 'test.site', recipientCount: 3 });
    // No address-shaped fields anywhere in the logged payload.
    expect(JSON.stringify(payload)).not.toMatch(/@/);
  });

  it('collapses repeated suppressions from the same kind/source into one log write', () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', '');
    gateCustomerEmail({ kind: 'team_announcement', recipientCount: 1, source: 'golf.ts' });
    gateCustomerEmail({ kind: 'team_announcement', recipientCount: 1, source: 'golf.ts' });
    gateCustomerEmail({ kind: 'team_announcement', recipientCount: 1, source: 'golf.ts' });

    expect(logEmailSuppressedMock).toHaveBeenCalledTimes(1);
  });

  it('does not throw when the logging write rejects (fail-open)', () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', '');
    logEmailSuppressedMock.mockRejectedValueOnce(new Error('bridge down'));

    expect(() =>
      gateCustomerEmail({ kind: 'task_reminder', recipientCount: 1, source: 'test' }),
    ).not.toThrow();
  });
});
