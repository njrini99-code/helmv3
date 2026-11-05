import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ read: { data: null as unknown, error: null as unknown }, upsert: vi.fn(async () => ({ error: null })), adminThrows: false }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    if (db.adminThrows) throw new Error('no service key');
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => db.read, upsert: db.upsert };
    return { from: () => chain };
  },
}));

import { readBucket, recordPlayerSpend } from '../player-allowance';

/** W-ASK-25, S-ASK.player.out: the player's meter is a word and only a word; a missing table is off, and a failed read never resets the week. */

const ZONE = 'America/New_York';

beforeEach(() => {
  db.read = { data: null, error: null };
  db.adminThrows = false;
  db.upsert.mockClear();
});

describe('readBucket', () => {
  it('returns the word alone, with no amount a player could read', async () => {
    db.read = { data: { cost_micros: 4_500_000, cap_micros: 5_000_000 }, error: null };
    await expect(readBucket('p1', ZONE)).resolves.toBe('low');
  });

  it('a row cap wins over the default', async () => {
    db.read = { data: { cost_micros: 1_000_000, cap_micros: 1_000_000 }, error: null };
    await expect(readBucket('p1', ZONE)).resolves.toBe('out');
  });

  it('no row this week is plenty', async () => {
    await expect(readBucket('p1', ZONE)).resolves.toBe('plenty');
  });

  it('a missing table or no service key is null, so player Ask stays off', async () => {
    db.read = { data: null, error: { code: '42P01' } };
    await expect(readBucket('p1', ZONE)).resolves.toBeNull();
    db.adminThrows = true;
    await expect(readBucket('p1', ZONE)).resolves.toBeNull();
  });
});

describe('recordPlayerSpend', () => {
  it('adds to this week, in micros', async () => {
    db.read = { data: { cost_micros: 1_000_000 }, error: null };
    await recordPlayerSpend({ playerId: 'p1', teamId: 't1', zone: ZONE, usd: 0.25 });
    expect(db.upsert).toHaveBeenCalledTimes(1);
    expect(db.upsert).toHaveBeenCalledWith(expect.objectContaining({ player_id: 'p1', team_id: 't1', cost_micros: 1_250_000 }));
  });

  it('a failed read writes nothing: the upsert would start the week over', async () => {
    db.read = { data: null, error: { message: 'down' } };
    await recordPlayerSpend({ playerId: 'p1', teamId: 't1', zone: ZONE, usd: 0.25 });
    expect(db.upsert).not.toHaveBeenCalled();
  });
});
