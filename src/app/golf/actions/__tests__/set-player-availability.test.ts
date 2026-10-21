/**
 * @vitest-environment node
 *
 * P003 availability. setPlayerAvailability writes golf_team_members.availability (available | injured | away), its
 * note (≤280) and when it changed, for a player on the signed-in coach's team. It follows updatePlayerStatus: the
 * coach's golf_coaches row, the cookie-aware team, the membership on that team, then the write. Display only: it never
 * touches `status`. A write RLS hides (count 0) is not a save.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Filter = [string, unknown];
type Call = { table: string; op: 'select' | 'update'; payload?: unknown; options?: unknown; filters: Filter[] };

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  coach: { id: 'coach-1', organization_id: 'org-1' } as { id: string; organization_id: string } | null,
  teamId: 'team-1' as string | null,
  membership: { id: 'm-1' } as { id: string } | null,
  update: { error: null as { message: string } | null, count: 1 as number | null },
  calls: [] as Call[],
}));

function chain(call: Call, answer: () => unknown) {
  const c: Record<string, unknown> = {
    eq: (col: string, v: unknown) => {
      call.filters.push([col, v]);
      return c;
    },
    maybeSingle: async () => answer(),
    then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(answer()).then(ok, bad),
  };
  return c;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => ({
      select: (cols: string) => {
        const call: Call = { table, op: 'select', payload: cols, filters: [] };
        state.calls.push(call);
        return chain(call, () => ({ data: table === 'golf_coaches' ? state.coach : state.membership, error: null }));
      },
      update: (payload: unknown, options: unknown) => {
        const call: Call = { table, op: 'update', payload, options, filters: [] };
        state.calls.push(call);
        return chain(call, () => ({ data: null, error: state.update.error, count: state.update.count }));
      },
    }),
  })),
}));
vi.mock('../golf-action-shared', () => ({ getCoachTeamId: vi.fn(async () => state.teamId) }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('next/cache', () => cache);
const logger = vi.hoisted(() => ({ logServerError: vi.fn(async () => {}), logServerException: vi.fn(async () => {}), logServerEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/server-error-logger', () => logger);

import { setPlayerAvailability } from '../team-management';

const updates = () => state.calls.filter((c) => c.op === 'update');

beforeEach(() => {
  state.user = { id: 'user-1' };
  state.coach = { id: 'coach-1', organization_id: 'org-1' };
  state.teamId = 'team-1';
  state.membership = { id: 'm-1' };
  state.update = { error: null, count: 1 };
  state.calls = [];
  cache.revalidatePath.mockClear();
  cache.updateTag.mockClear();
  logger.logServerError.mockClear();
});

describe('setPlayerAvailability', () => {
  it('writes the availability, the trimmed note and when it changed, on the coach’s team only, then refreshes the roster', async () => {
    expect(await setPlayerAvailability({ playerId: 'p-1', availability: 'injured', note: '  wrist · back Nov 2  ' })).toEqual({ success: true });
    const membership = state.calls.find((c) => c.table === 'golf_team_members' && c.op === 'select')!;
    expect(membership.filters).toEqual([
      ['player_id', 'p-1'],
      ['team_id', 'team-1'],
    ]);
    const [write] = updates();
    expect(write!.payload).toEqual({ availability: 'injured', availability_note: 'wrist · back Nov 2', availability_updated_at: expect.any(String), updated_at: expect.any(String) });
    // Display only: team access (status) is never part of the write.
    expect(write!.payload).not.toHaveProperty('status');
    expect(write!.options).toEqual({ count: 'exact' });
    expect(write!.filters).toEqual([
      ['player_id', 'p-1'],
      ['team_id', 'team-1'],
    ]);
    expect(cache.revalidatePath).toHaveBeenCalledWith('/golf/dashboard/roster');
    expect(cache.updateTag).toHaveBeenCalledWith('roster');
  });

  it('refuses a caller who is not a coach, and writes nothing', async () => {
    state.coach = null;
    expect(await setPlayerAvailability({ playerId: 'p-1', availability: 'away' })).toEqual({ success: false, error: 'Only coaches can update player availability' });
    state.coach = { id: 'coach-1', organization_id: 'org-1' };
    state.user = null;
    expect((await setPlayerAvailability({ playerId: 'p-1', availability: 'away' })).success).toBe(false);
    expect(updates()).toHaveLength(0);
  });

  it('refuses a player who is not on the coach’s team, and writes nothing', async () => {
    state.membership = null;
    expect(await setPlayerAvailability({ playerId: 'p-other', availability: 'injured' })).toEqual({ success: false, error: 'Player is not on your team' });
    expect(updates()).toHaveLength(0);
  });

  it('refuses a value that is not available, injured or away', async () => {
    const res = await setPlayerAvailability({ playerId: 'p-1', availability: 'redshirt' as never });
    expect(res.success).toBe(false);
    expect(updates()).toHaveLength(0);
  });

  it('refuses a note over 280 characters, and keeps one of exactly 280', async () => {
    expect(await setPlayerAvailability({ playerId: 'p-1', availability: 'injured', note: 'x'.repeat(281) })).toEqual({ success: false, error: 'Keep the note under 280 characters' });
    expect(updates()).toHaveLength(0);
    expect((await setPlayerAvailability({ playerId: 'p-1', availability: 'injured', note: 'x'.repeat(280) })).success).toBe(true);
    expect((updates()[0]!.payload as { availability_note: string }).availability_note).toHaveLength(280);
  });

  it('available clears the note; a blank note clears it; no note leaves it as it is', async () => {
    await setPlayerAvailability({ playerId: 'p-1', availability: 'available', note: 'still sore' });
    expect(updates()[0]!.payload).toMatchObject({ availability: 'available', availability_note: null });
    await setPlayerAvailability({ playerId: 'p-1', availability: 'away', note: '   ' });
    expect(updates()[1]!.payload).toMatchObject({ availability: 'away', availability_note: null });
    await setPlayerAvailability({ playerId: 'p-1', availability: 'away' });
    expect(updates()[2]!.payload).not.toHaveProperty('availability_note');
  });

  it('a write that changes no row (RLS hid it) fails, and refreshes nothing', async () => {
    state.update = { error: null, count: 0 };
    expect((await setPlayerAvailability({ playerId: 'p-1', availability: 'injured' })).success).toBe(false);
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it('a failed write is logged with the player and team, and says so', async () => {
    state.update = { error: { message: 'boom' }, count: null };
    expect(await setPlayerAvailability({ playerId: 'p-1', availability: 'injured' })).toEqual({ success: false, error: 'Failed to update player availability' });
    expect(logger.logServerError).toHaveBeenCalledWith('setPlayerAvailability failed: boom', { action: 'roster.setPlayerAvailability', playerId: 'p-1', teamId: 'team-1' });
  });
});
