/**
 * @vitest-environment node
 *
 * P003 availability. setPlayerAvailability writes golf_team_members.availability (available | injured | away) and
 * when it changed, for a player on the signed-in coach's team. No note: teammates can read every column of their team's
 * rows (select_v5), so the action never touches availability_note and refuses a note. It follows updatePlayerStatus: the
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
  readError: null as { message: string } | null,
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
        return chain(call, () => ({ data: table === 'golf_coaches' ? state.coach : state.membership, error: state.readError }));
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
  state.readError = null;
  state.update = { error: null, count: 1 };
  state.calls = [];
  cache.revalidatePath.mockClear();
  cache.updateTag.mockClear();
  logger.logServerError.mockClear();
});

describe('setPlayerAvailability', () => {
  it('writes the availability and when it changed, on the coach’s team only, then refreshes the roster', async () => {
    expect(await setPlayerAvailability({ playerId: 'p-1', availability: 'injured' })).toEqual({ success: true });
    const membership = state.calls.find((c) => c.table === 'golf_team_members' && c.op === 'select')!;
    expect(membership.filters).toEqual([
      ['player_id', 'p-1'],
      ['team_id', 'team-1'],
    ]);
    const [write] = updates();
    expect(write!.payload).toEqual({ availability: 'injured', availability_updated_at: expect.any(String), updated_at: expect.any(String) });
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

  it('refuses a note (teammates could read it), writes nothing, and never names availability_note', async () => {
    for (const note of ['wrist · back Nov 2', '', null]) {
      const res = await setPlayerAvailability({ playerId: 'p-1', availability: 'injured', note } as never);
      expect(res).toEqual({ success: false, error: 'Availability notes are not saved' });
    }
    expect(updates()).toHaveLength(0);
    for (const availability of ['available', 'injured', 'away'] as const) {
      await setPlayerAvailability({ playerId: 'p-1', availability });
    }
    expect(updates()).toHaveLength(3);
    for (const c of state.calls) {
      expect(c.payload ?? {}).not.toHaveProperty('availability_note');
      expect(JSON.stringify(c.payload ?? '')).not.toContain('availability_note');
    }
  });

  it('a read that fails is logged and says so, rather than reading as "not a coach" or "not on your team"', async () => {
    state.readError = { message: 'connection reset' };
    expect(await setPlayerAvailability({ playerId: 'p-1', availability: 'injured' })).toEqual({
      success: false,
      error: 'Failed to update player availability',
    });
    expect(logger.logServerError).toHaveBeenCalledWith(expect.stringContaining('read failed: connection reset'), expect.anything());
    expect(updates()).toHaveLength(0);
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
