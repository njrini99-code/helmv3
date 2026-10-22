/**
 * @vitest-environment node
 *
 * P003 invite by email (QUEUE doc-60). emailPlayerInvites mails the team's join link and code to addresses a coach
 * names. The checks: it is the coach's own team (never one the client names), it validates what arrives, it stops when
 * email is paused or the coach has sent a lot, it needs a team code, and it never says whether an address has an account.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  coach: { id: 'coach-1', organization_id: 'org-1', full_name: 'Coach Dana' } as Record<string, unknown> | null,
  teamId: 'team-1' as string | null,
  team: { name: 'Demo University Golf', join_code: 'K7MQ2XPA' } as { name: string | null; join_code: string | null } | null,
  canEmail: true,
  gate: { allowed: true } as { allowed: true } | { allowed: false; error: string },
  send: { status: 'done', sent: 2, failed: [] as string[] } as { status: string; sent?: number; failed?: string[] },
  readError: null as { table: string } | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            state.readError?.table === table
              ? { data: null, error: new Error('connection reset') }
              : { data: table === 'golf_coaches' ? state.coach : state.team, error: null },
        }),
      }),
    }),
  })),
}));
vi.mock('../golf-action-shared', () => ({ getCoachTeamId: vi.fn(async () => state.teamId) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}), logServerException: vi.fn(async () => {}), logServerEvent: vi.fn(async () => {}) }));
const limit = vi.hoisted(() => ({ gateUserAction: vi.fn() }));
vi.mock('@/lib/auth/action-rate-limit', () => limit);
const mail = vi.hoisted(() => ({ canEmailPlayerInvites: vi.fn(), sendGolfPlayerInviteEmails: vi.fn() }));
vi.mock('@/lib/golf/player-invite-email', () => mail);

import { emailPlayerInvites } from '../team-management';

beforeEach(() => {
  state.user = { id: 'user-1' };
  state.coach = { id: 'coach-1', organization_id: 'org-1', full_name: 'Coach Dana' };
  state.teamId = 'team-1';
  state.team = { name: 'Demo University Golf', join_code: 'K7MQ2XPA' };
  state.canEmail = true;
  state.gate = { allowed: true };
  state.send = { status: 'done', sent: 2, failed: [] };
  state.readError = null;
  mail.canEmailPlayerInvites.mockImplementation(() => state.canEmail);
  mail.sendGolfPlayerInviteEmails.mockReset();
  mail.sendGolfPlayerInviteEmails.mockImplementation(async () => state.send);
  limit.gateUserAction.mockReset();
  limit.gateUserAction.mockImplementation(async () => state.gate);
});

describe('emailPlayerInvites', () => {
  it('sends to the coach’s own team with its code, and reports the count', async () => {
    expect(await emailPlayerInvites(['Eli@X.edu', 'mia@x.edu', 'eli@x.edu'])).toEqual({ success: true, data: { sent: 2, failed: [] } });
    expect(mail.sendGolfPlayerInviteEmails).toHaveBeenCalledWith({
      emails: ['eli@x.edu', 'mia@x.edu'],
      coachName: 'Coach Dana',
      teamId: 'team-1',
      teamName: 'Demo University Golf',
      joinCode: 'K7MQ2XPA',
    });
  });

  it('returns the addresses that did not send so the sheet can keep them', async () => {
    state.send = { status: 'done', sent: 1, failed: ['mia@x.edu'] };
    expect(await emailPlayerInvites(['eli@x.edu', 'mia@x.edu'])).toEqual({ success: true, data: { sent: 1, failed: ['mia@x.edu'] } });
  });

  it('refuses nothing, too many, and an address that is not one, before anything else', async () => {
    for (const bad of [[], Array.from({ length: 11 }, (_, i) => `p${i}@x.edu`), ['eli@x.edu', 'nope'], ['eli@x.edu', 'a'.repeat(400)]]) {
      const r = await emailPlayerInvites(bad);
      expect(r).toMatchObject({ success: false, code: 'invalid_emails' });
    }
    expect(mail.sendGolfPlayerInviteEmails).not.toHaveBeenCalled();
    expect(limit.gateUserAction).not.toHaveBeenCalled();
  });

  it('needs a signed-in coach with a team', async () => {
    state.user = null;
    expect(await emailPlayerInvites(['eli@x.edu'])).toMatchObject({ success: false });
    state.user = { id: 'user-1' };
    state.coach = null;
    expect(await emailPlayerInvites(['eli@x.edu'])).toMatchObject({ success: false, error: 'Coach profile not found' });
    state.coach = { id: 'coach-1', organization_id: 'org-1', full_name: null };
    state.teamId = null;
    expect(await emailPlayerInvites(['eli@x.edu'])).toMatchObject({ success: false, error: 'Coach not assigned to a team' });
    expect(mail.sendGolfPlayerInviteEmails).not.toHaveBeenCalled();
  });

  it('does not read a failed lookup as a missing coach or code', async () => {
    for (const table of ['golf_coaches', 'golf_teams']) {
      state.readError = { table };
      const result = await emailPlayerInvites(['eli@x.edu']);
      expect(result).toMatchObject({ success: false });
      expect(result).not.toMatchObject({ error: 'Coach profile not found' });
      expect(result).not.toMatchObject({ code: 'no_code' });
    }
    expect(mail.sendGolfPlayerInviteEmails).not.toHaveBeenCalled();
  });

  it('says email is off, and sends nothing, when the owner’s switch or the transport is off', async () => {
    state.canEmail = false;
    expect(await emailPlayerInvites(['eli@x.edu'])).toMatchObject({ success: false, code: 'email_off' });
    expect(mail.sendGolfPlayerInviteEmails).not.toHaveBeenCalled();
    expect(limit.gateUserAction).not.toHaveBeenCalled();
  });

  it('says email is off when the send itself was paused or unconfigured', async () => {
    state.send = { status: 'paused' };
    expect(await emailPlayerInvites(['eli@x.edu'])).toMatchObject({ success: false, code: 'email_off' });
    state.send = { status: 'unconfigured' };
    expect(await emailPlayerInvites(['eli@x.edu'])).toMatchObject({ success: false, code: 'email_off' });
  });

  it('rate-limits a coach per hour, in its own bucket', async () => {
    state.gate = { allowed: false, error: 'slow down' };
    expect(await emailPlayerInvites(['eli@x.edu'])).toEqual({ success: false, error: 'slow down', code: 'rate_limited' });
    expect(limit.gateUserAction).toHaveBeenCalledWith('golf:player-invite-email', 'user-1', { maxAttempts: 10, windowMs: 3_600_000 }, expect.any(String));
    expect(mail.sendGolfPlayerInviteEmails).not.toHaveBeenCalled();
  });

  it('needs a team code, and does not make one', async () => {
    state.team = { name: 'Demo University Golf', join_code: null };
    expect(await emailPlayerInvites(['eli@x.edu'])).toMatchObject({ success: false, code: 'no_code' });
    state.team = { name: 'Demo University Golf', join_code: 'AB' };
    expect(await emailPlayerInvites(['eli@x.edu'])).toMatchObject({ success: false, code: 'no_code' });
    expect(mail.sendGolfPlayerInviteEmails).not.toHaveBeenCalled();
  });
});
