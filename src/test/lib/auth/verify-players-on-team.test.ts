import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

// A supabase arg is always passed here, so this must never be reached.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => {
    throw new Error('createClient must not be called when a client is injected');
  }),
}));

import { verifyPlayersOnTeam, verifyRoundBelongsToPlayer } from '@/lib/auth/verify-player-access';

/** Mock of the `golf_team_members` roster probe. */
function makeRoster(
  memberIds: string[] | null,
  error: { message: string; code?: string } | null = null,
) {
  const inSpy = vi.fn().mockResolvedValue({
    data: memberIds === null ? null : memberIds.map((player_id) => ({ player_id })),
    error,
  });
  return {
    client: {
      from: vi.fn().mockReturnValue({
        select: () => ({ eq: () => ({ in: inSpy }) }),
      }),
    },
    inSpy,
  };
}

describe('verifyPlayersOnTeam', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes an empty list without touching the database', async () => {
    const { client, inSpy } = makeRoster([]);
    const r = await verifyPlayersOnTeam('team-1', [], client as never);
    expect(r).toEqual({ ok: true, reason: 'empty' });
    expect(client.from).not.toHaveBeenCalled();
    expect(inSpy).not.toHaveBeenCalled();
  });

  it('treats a list of only null/undefined as empty', async () => {
    const { client } = makeRoster([]);
    const r = await verifyPlayersOnTeam('team-1', [null, undefined], client as never);
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('empty');
    expect(client.from).not.toHaveBeenCalled();
  });

  it('allows the happy path — every id is on the team', async () => {
    const { client, inSpy } = makeRoster(['p1', 'p2']);
    const r = await verifyPlayersOnTeam('team-1', ['p1', 'p2'], client as never);
    expect(r).toEqual({ ok: true, reason: 'members' });
    expect(inSpy).toHaveBeenCalledWith('player_id', ['p1', 'p2']);
  });

  it('de-duplicates before probing', async () => {
    const { client, inSpy } = makeRoster(['p1']);
    const r = await verifyPlayersOnTeam('team-1', ['p1', 'p1', 'p1'], client as never);
    expect(r.ok).toBe(true);
    expect(inSpy).toHaveBeenCalledWith('player_id', ['p1']);
  });

  it('denies when one id belongs to another team, and names it', async () => {
    const { client } = makeRoster(['p1']);
    const r = await verifyPlayersOnTeam('team-1', ['p1', 'intruder'], client as never);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not-members');
    expect(r.offending).toEqual(['intruder']);
  });

  it('caps the reported offenders at five', async () => {
    const { client } = makeRoster([]);
    const ids = Array.from({ length: 20 }, (_, i) => `x${i}`);
    const r = await verifyPlayersOnTeam('team-1', ids, client as never);
    expect(r.ok).toBe(false);
    expect(r.offending).toHaveLength(5);
  });

  it('fails CLOSED on a hard read error, without naming phantom offenders', async () => {
    const { client } = makeRoster(null, { message: 'boom', code: '42501' });
    const r = await verifyPlayersOnTeam('team-1', ['p1'], client as never);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not-members');
    // A failed probe never learned WHICH ids were missing, so it must not
    // claim any. This is the shape the caller renders into a message.
    expect(r.offending).toBeUndefined();
  });

  it('reports a transport blip as unavailable so the caller can offer a retry', async () => {
    const { client } = makeRoster(null, { message: 'The operation was aborted due to timeout' });
    const r = await verifyPlayersOnTeam('team-1', ['p1'], client as never);
    expect(r.ok).toBe(false);
    // NOT 'not-members' — telling a coach their own player is off the team
    // because the database blinked is the bug this distinction exists for.
    expect(r.reason).toBe('unavailable');
  });

  it('denies when the team id is missing rather than probing with an empty scope', async () => {
    const { client } = makeRoster(['p1']);
    const r = await verifyPlayersOnTeam('', ['p1'], client as never);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('not-members');
    expect(client.from).not.toHaveBeenCalled();
  });
});

function makeRound(playerId: string | null, error: { message: string } | null = null) {
  return {
    from: vi.fn().mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: playerId === null ? null : { player_id: playerId },
            error,
          }),
        }),
      }),
    }),
  };
}

describe('verifyRoundBelongsToPlayer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows a round the player owns', async () => {
    expect(await verifyRoundBelongsToPlayer('r1', 'p1', makeRound('p1') as never)).toBe(true);
  });

  it('denies a round owned by someone else', async () => {
    expect(await verifyRoundBelongsToPlayer('r1', 'p1', makeRound('p2') as never)).toBe(false);
  });

  it('denies a round that does not exist', async () => {
    expect(await verifyRoundBelongsToPlayer('r1', 'p1', makeRound(null) as never)).toBe(false);
  });

  it('denies on a read error', async () => {
    expect(
      await verifyRoundBelongsToPlayer('r1', 'p1', makeRound(null, { message: 'boom' }) as never),
    ).toBe(false);
  });

  it('denies empty ids without probing', async () => {
    const sb = makeRound('p1');
    expect(await verifyRoundBelongsToPlayer('', 'p1', sb as never)).toBe(false);
    expect(sb.from).not.toHaveBeenCalled();
  });
});
