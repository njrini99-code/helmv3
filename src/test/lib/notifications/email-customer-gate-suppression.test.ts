/**
 * Database Plan D6 / email-off interaction: with HELM_CUSTOMER_EMAIL_ENABLED
 * unset (default off), both the direct send path and the queued send path
 * must suppress the email and log it, never call Resend. See
 * src/lib/notifications/email.ts's sendEmailNotificationDirect header for
 * why this is a local fallback of the interface agent/email-off's
 * src/lib/email/outbound-gate.ts (gateCustomerEmail) is expected to own —
 * that file is not on main at the time this test was written.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const maybeSingleSpy = vi.fn(async () => ({ data: null, error: null }));
const eqSpy = vi.fn(() => ({ maybeSingle: maybeSingleSpy }));
const selectSpy = vi.fn(() => ({ eq: eqSpy }));
const fromSpy = vi.fn(() => ({ select: selectSpy }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: fromSpy })),
}));

vi.mock('@/lib/jobs/enqueue', () => ({
  enqueueJob: vi.fn(),
  isHelmQueueEnabled: vi.fn(() => false),
}));

import { sendEmailNotificationDirect, sendEmailNotification } from '@/lib/notifications/email';

describe('email send — HELM_CUSTOMER_EMAIL_ENABLED gate', () => {
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);

  beforeEach(() => {
    delete process.env.HELM_CUSTOMER_EMAIL_ENABLED;
    delete process.env.RESEND_API_KEY;
    infoSpy.mockClear();
  });

  afterEach(() => {
    delete process.env.HELM_CUSTOMER_EMAIL_ENABLED;
  });

  it('suppresses and logs a direct send when the switch is unset', async () => {
    const result = await sendEmailNotificationDirect('new_message', 'user-1', 'user@example.com', {});
    expect(result).toEqual({ success: true });
    expect(infoSpy).toHaveBeenCalledWith(
      '[email] suppressed — HELM_CUSTOMER_EMAIL_ENABLED is off',
      expect.objectContaining({ action: 'notifications.email.suppressed' }),
    );
  });

  it('suppresses and logs a queued-path send identically (queue disabled, falls through to direct)', async () => {
    const result = await sendEmailNotification('new_message', 'user-1', 'user@example.com', {});
    expect(result).toEqual({ success: true });
    expect(infoSpy).toHaveBeenCalledWith(
      '[email] suppressed — HELM_CUSTOMER_EMAIL_ENABLED is off',
      expect.objectContaining({ action: 'notifications.email.suppressed' }),
    );
  });

  it('does not suppress once HELM_CUSTOMER_EMAIL_ENABLED=true (falls through to "no Resend key" instead)', async () => {
    process.env.HELM_CUSTOMER_EMAIL_ENABLED = 'true';
    const result = await sendEmailNotificationDirect('new_message', 'user-1', 'user@example.com', {});
    // No RESEND_API_KEY in test env, so it fails for a DIFFERENT reason —
    // proving the gate itself, not Resend availability, was what suppressed
    // the send in the tests above.
    expect(result).toEqual({ success: false, error: 'Email service not configured' });
  });
});
