/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sends = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: sends.send }; } }));
const logger = vi.hoisted(() => ({ logServerException: vi.fn(async () => {}) }));
vi.mock('@/lib/server-error-logger', () => logger);
const gate = vi.hoisted(() => ({ gateCustomerEmail: vi.fn(), isCustomerEmailEnabled: vi.fn() }));
vi.mock('@/lib/email/outbound-gate', () => gate);

import { buildGolfJoinUrl, canEmailPlayerInvites, inviteIdempotencyKey, sendGolfPlayerInviteEmails } from '../player-invite-email';

const params = { emails: ['eli@x.edu', 'mia@x.edu'], coachName: 'Coach Dana', teamId: 'team-1', teamName: 'Demo University Golf', joinCode: 'K7MQ2XPA' };

const env = { ...process.env };
beforeEach(() => {
  process.env.RESEND_API_KEY = 're_test';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com/';
  gate.gateCustomerEmail.mockReturnValue({ allowed: true });
  gate.isCustomerEmailEnabled.mockReturnValue(true);
  sends.send.mockReset();
  sends.send.mockResolvedValue({ data: { id: 'e1' }, error: null });
  logger.logServerException.mockClear();
});
afterEach(() => {
  process.env = { ...env };
});

describe('canEmailPlayerInvites', () => {
  it('needs the owner’s switch on and a transport', () => {
    expect(canEmailPlayerInvites()).toBe(true);
    gate.isCustomerEmailEnabled.mockReturnValue(false);
    expect(canEmailPlayerInvites()).toBe(false);
    gate.isCustomerEmailEnabled.mockReturnValue(true);
    delete process.env.RESEND_API_KEY;
    expect(canEmailPlayerInvites()).toBe(false);
  });
});

describe('buildGolfJoinUrl', () => {
  it('uses the app origin without a doubled slash, and encodes the code', () => {
    expect(buildGolfJoinUrl('K7MQ2XPA')).toBe('https://app.example.com/golf/join/K7MQ2XPA');
    expect(buildGolfJoinUrl('a b')).toBe('https://app.example.com/golf/join/a%20b');
  });

  it('falls back to the deployment host, then production', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.VERCEL_URL = 'helm-abc.vercel.app';
    expect(buildGolfJoinUrl('K7')).toBe('https://helm-abc.vercel.app/golf/join/K7');
    delete process.env.VERCEL_URL;
    expect(buildGolfJoinUrl('K7')).toBe('https://helmsportslabs.com/golf/join/K7');
  });
});

describe('inviteIdempotencyKey', () => {
  it('is stable for a team, an address and a day, and does not hold the address', () => {
    const day = new Date('2026-10-22T15:00:00Z');
    const a = inviteIdempotencyKey('team-1', 'Eli@X.edu', day);
    expect(a).toBe(inviteIdempotencyKey('team-1', 'eli@x.edu', new Date('2026-10-22T01:00:00Z')));
    expect(a).not.toContain('eli');
    expect(a).toContain('2026-10-22');
    expect(a).not.toBe(inviteIdempotencyKey('team-1', 'mia@x.edu', day));
    expect(a).not.toBe(inviteIdempotencyKey('team-2', 'eli@x.edu', day));
    expect(a).not.toBe(inviteIdempotencyKey('team-1', 'eli@x.edu', new Date('2026-10-23T00:00:00Z')));
  });
});

describe('sendGolfPlayerInviteEmails', () => {
  it('sends nothing, and says so, when no transport is configured', async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendGolfPlayerInviteEmails(params)).toEqual({ status: 'unconfigured' });
    expect(sends.send).not.toHaveBeenCalled();
  });

  it('sends nothing, and says so, when the owner’s switch is off', async () => {
    gate.gateCustomerEmail.mockReturnValue({ allowed: false, reason: 'customer_email_disabled' });
    expect(await sendGolfPlayerInviteEmails(params)).toEqual({ status: 'paused' });
    expect(gate.gateCustomerEmail).toHaveBeenCalledWith(expect.objectContaining({ kind: 'golf_player_invite', recipientCount: 2 }));
    expect(sends.send).not.toHaveBeenCalled();
  });

  it('mails each player on their own message, with the link, the code and a key per address', async () => {
    expect(await sendGolfPlayerInviteEmails(params)).toEqual({ status: 'done', sent: 2, failed: [] });
    expect(sends.send).toHaveBeenCalledTimes(2);
    const [payload, options] = sends.send.mock.calls[0]!;
    expect(payload.to).toBe('eli@x.edu');
    expect(payload.from).toMatch(/helmsportslabs\.com>$/);
    expect(payload.subject).toBe('Coach Dana invited you to join Demo University Golf on GolfHelm');
    expect(payload.html).toContain('https://app.example.com/golf/join/K7MQ2XPA');
    expect(payload.text).toContain('K7MQ2XPA');
    expect(options.idempotencyKey).toBe(inviteIdempotencyKey('team-1', 'eli@x.edu'));
    expect(sends.send.mock.calls[1]![0].to).toBe('mia@x.edu');
    // One recipient per message: nobody sees another player's address.
    for (const [p] of sends.send.mock.calls) expect(Array.isArray(p.to)).toBe(false);
  });

  it('returns the addresses that did not send, and keeps sending the rest', async () => {
    sends.send.mockResolvedValueOnce({ data: null, error: { name: 'validation_error', message: 'bad' } }).mockResolvedValueOnce({ data: { id: 'e2' }, error: null });
    expect(await sendGolfPlayerInviteEmails(params)).toEqual({ status: 'done', sent: 1, failed: ['eli@x.edu'] });
    sends.send.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ data: { id: 'e3' }, error: null });
    expect(await sendGolfPlayerInviteEmails(params)).toEqual({ status: 'done', sent: 1, failed: ['eli@x.edu'] });
  });

  it('logs a failure by count, never by address', async () => {
    sends.send.mockRejectedValue(new Error('network'));
    await sendGolfPlayerInviteEmails(params);
    expect(logger.logServerException).toHaveBeenCalled();
    expect(JSON.stringify(logger.logServerException.mock.calls)).not.toMatch(/eli@x\.edu|mia@x\.edu/);
  });
});
