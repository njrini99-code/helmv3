/**
 * Tests for the v3 Resend wrapper's outbound customer-email kill switch
 * (owner decision, 2026-09-06). This module is the choke point the weekly
 * coach email (and any future v3 caller) sends through — see
 * src/lib/email/outbound-gate.ts and memory/features/email_outbound.md.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMock = vi.fn(async () => ({ data: { id: 'resend-id-1' }, error: null }));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

describe('coachhelm/v3/foundation/email.sendEmail — outbound gate', () => {
  beforeEach(() => {
    sendMock.mockClear();
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('does not call resend.emails.send when HELM_CUSTOMER_EMAIL_ENABLED is unset', async () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', '');
    const { sendEmail } = await import('@/lib/coachhelm/v3/foundation/email');

    const result = await sendEmail({ to: 'coach@example.com', subject: 'Weekly recap', html: '<p>x</p>' });

    expect(sendMock).not.toHaveBeenCalled();
    expect(result).toEqual({ delivered: false, error: 'customer_email_disabled' });
  });

  it('does not call resend.emails.send when HELM_CUSTOMER_EMAIL_ENABLED is "false"', async () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', 'false');
    const { sendEmail } = await import('@/lib/coachhelm/v3/foundation/email');

    await sendEmail({ to: 'coach@example.com', subject: 'Weekly recap', html: '<p>x</p>' });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('calls resend.emails.send when HELM_CUSTOMER_EMAIL_ENABLED is exactly "true"', async () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', 'true');
    const { sendEmail } = await import('@/lib/coachhelm/v3/foundation/email');

    const result = await sendEmail({ to: 'coach@example.com', subject: 'Weekly recap', html: '<p>x</p>' });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ delivered: true, id: 'resend-id-1' });
  });
});
