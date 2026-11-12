import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const m = vi.hoisted(() => ({
  isCoachHelmEnabledForPlayer: vi.fn(),
  resolvePlayerChatContext: vi.fn(),
  readBucket: vi.fn(),
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForPlayer: m.isCoachHelmEnabledForPlayer }));
vi.mock('../player-context', () => ({ resolvePlayerChatContext: m.resolvePlayerChatContext }));
vi.mock('../player-allowance', () => ({ readBucket: m.readBucket, recordPlayerSpend: vi.fn() }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit: m.checkRateLimit, RATE_LIMITS: { API_GENERAL: {} } }));
vi.mock('../registry', () => ({ toolsFor: vi.fn(() => []) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('../instructions', () => ({ instructionBlocks: vi.fn(() => ({ policy: '', team: '' })) }));

import { CoachContextError, resolveCoachChatContext } from '../context';
import { runPlayerTurn } from '../player-turn';

const sb = {} as never;
const signal = new AbortController().signal;

describe('the player turn’s gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.resolvePlayerChatContext.mockResolvedValue({ player_id: 'me', team_id: 't', team_name: 'Team', timezone: 'UTC', roster: [{ id: 'me', name: 'Me' }] });
  });

  it('CoachHelm off for the team answers nothing: 403, before the allowance is read or a model is called', async () => {
    m.isCoachHelmEnabledForPlayer.mockResolvedValue({ effectivelyEnabled: false });
    m.readBucket.mockResolvedValue(null);
    const res = await runPlayerTurn(sb, { text: 'How am I putting?', clientTurnId: 't1' }, signal, () => ({}));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'CoachHelm is off for your team.', kind: 'off' });
    expect(m.isCoachHelmEnabledForPlayer).toHaveBeenCalledWith('me');
    expect(m.readBucket).not.toHaveBeenCalled();
  });

  it('someone who is not a player stays denied', async () => {
    m.resolvePlayerChatContext.mockRejectedValue(new CoachContextError('This surface is for players', 403));
    const res = await runPlayerTurn(sb, { text: 'How am I putting?', clientTurnId: 't1' }, signal, () => ({}));
    expect(res.status).toBe(403);
    expect(m.isCoachHelmEnabledForPlayer).not.toHaveBeenCalled();
  });
});

describe('the coach context says why it denied', () => {
  const client = (coach: { data: unknown; error: unknown }) =>
    ({
      auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => coach }) }) }),
    }) as never;

  it('only a read that found no coach row is "not a coach"', async () => {
    await expect(resolveCoachChatContext(client({ data: null, error: null }))).rejects.toMatchObject({ status: 403, reason: 'not_a_coach' });
  });

  it('a failed read is not a denial: a coach is never sent to the player branch by a database error', async () => {
    const err = await resolveCoachChatContext(client({ data: null, error: { message: 'timeout' } })).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(CoachContextError);
  });
});
