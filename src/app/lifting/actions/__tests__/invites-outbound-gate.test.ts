/**
 * Outbound customer-email kill switch (owner decision, 2026-09-06) for the
 * Lift Lab invite email — see src/lib/email/outbound-gate.ts and
 * memory/features/email_outbound.md. The email leg lives in
 * src/lib/lifting/invite-email.ts (NOT the `'use server'` actions file: a
 * non-function export there broke every action reachable from it, incident
 * 2026-10-13 d9ed17ef), so this test doesn't need to drive the full
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
    const { sendLiftingInviteEmail } = await import('@/lib/lifting/invite-email');

    await sendLiftingInviteEmail({
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
    const { sendLiftingInviteEmail } = await import('@/lib/lifting/invite-email');

    await sendLiftingInviteEmail({
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

describe('lifting invites — accept URL', () => {
  it('uses NEXT_PUBLIC_APP_URL when set (not the scheme-less VERCEL_URL)', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://helmsportslabs.com');
    vi.stubEnv('VERCEL_URL', 'helmv3-abc123.vercel.app');
    const { buildLiftingInviteAcceptUrl } = await import('@/lib/lifting/invite-email');
    expect(buildLiftingInviteAcceptUrl('tok')).toBe('https://helmsportslabs.com/lifting/join/tok');
  });

  it('adds https:// to a bare VERCEL_URL and falls back to production', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_URL', 'helmv3-abc123.vercel.app');
    const { buildLiftingInviteAcceptUrl } = await import('@/lib/lifting/invite-email');
    expect(buildLiftingInviteAcceptUrl('tok')).toBe('https://helmv3-abc123.vercel.app/lifting/join/tok');
    vi.stubEnv('VERCEL_URL', '');
    expect(buildLiftingInviteAcceptUrl('tok')).toBe('https://helmsportslabs.com/lifting/join/tok');
  });
});
