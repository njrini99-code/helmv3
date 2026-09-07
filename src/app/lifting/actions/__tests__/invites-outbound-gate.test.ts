/**
 * Outbound customer-email kill switch (owner decision, 2026-09-06) for the
 * Lift Lab invite email — see src/lib/email/outbound-gate.ts and
 * memory/features/email_outbound.md. `sendInviteEmail` is a private helper
 * exercised here through `__testables` (mirrors src/lib/notifications
 * /email.ts's pattern) so this test doesn't need to drive the full
 * head-coach-authority + DB flow of `inviteLiftingCoach`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const sendMock = vi.fn(async () => ({ data: { id: 'resend-id' }, error: null }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => {}),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => {
    throw new Error('not needed for sendInviteEmail');
  }),
}));

beforeEach(() => {
  sendMock.mockClear();
  vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
});
afterEach(() => vi.unstubAllEnvs());

describe('lifting invites — outbound gate', () => {
  it('does not call resend.emails.send when HELM_CUSTOMER_EMAIL_ENABLED is off', async () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', '');
    const { __testables } = await import('@/app/lifting/actions/invites');

    await __testables.sendInviteEmail({
      toEmail: 'coach@example.com',
      inviterName: 'Head Coach',
      orgName: 'Example U',
      roleTitle: null,
      token: 'tok-123',
      expiresAt: new Date().toISOString(),
    });

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('calls resend.emails.send when HELM_CUSTOMER_EMAIL_ENABLED is "true"', async () => {
    vi.stubEnv('HELM_CUSTOMER_EMAIL_ENABLED', 'true');
    const { __testables } = await import('@/app/lifting/actions/invites');

    await __testables.sendInviteEmail({
      toEmail: 'coach@example.com',
      inviterName: 'Head Coach',
      orgName: 'Example U',
      roleTitle: null,
      token: 'tok-123',
      expiresAt: new Date().toISOString(),
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});
