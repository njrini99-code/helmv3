/**
 * setPlayerAvailabilityCoachNote: the coach-only reason beside Injured or Away. It writes golf_player_availability_coach_notes
 * (never golf_team_members.availability_note, which teammates can read), for a player on the coach's own team, trims it, caps
 * it at 280 characters, removes the row for an empty note, and answers "not available yet" while the held migration is not
 * applied (42P01 / PGRST205) instead of failing loudly.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { table: string; op: string; payload?: unknown; options?: unknown; filters: Array<[string, unknown]> };

const state = vi.hoisted(() => ({
  user: { id: 'user-1' } as { id: string } | null,
  coach: { id: 'coach-1', organization_id: 'org-1' } as { id: string; organization_id: string } | null,
  teamId: 'team-1' as string | null,
  membership: { id: 'm-1' } as { id: string } | null,
  write: { error: null as { code?: string; message: string } | null },
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
      select: () => {
        const call: Call = { table, op: 'select', filters: [] };
        state.calls.push(call);
        return chain(call, () => ({ data: table === 'golf_coaches' ? state.coach : state.membership, error: null }));
      },
      upsert: (payload: unknown, options: unknown) => {
        const call: Call = { table, op: 'upsert', payload, options, filters: [] };
        state.calls.push(call);
        return chain(call, () => ({ error: state.write.error }));
      },
      delete: () => {
        const call: Call = { table, op: 'delete', filters: [] };
        state.calls.push(call);
        return chain(call, () => ({ error: state.write.error }));
      },
    }),
  })),
}));
vi.mock('../golf-action-shared', () => ({ getCoachTeamId: vi.fn(async () => state.teamId) }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('next/cache', () => cache);
const logger = vi.hoisted(() => ({ logServerError: vi.fn(async () => {}), logServerException: vi.fn(async () => {}), logServerEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/server-error-logger', () => logger);

import { setPlayerAvailabilityCoachNote } from '../team-management';

const writes = () => state.calls.filter((c) => c.op === 'upsert' || c.op === 'delete');

beforeEach(() => {
  state.user = { id: 'user-1' };
  state.coach = { id: 'coach-1', organization_id: 'org-1' };
  state.teamId = 'team-1';
  state.membership = { id: 'm-1' };
  state.write = { error: null };
  state.calls = [];
  cache.revalidatePath.mockClear();
  cache.updateTag.mockClear();
  logger.logServerError.mockClear();
});

describe('setPlayerAvailabilityCoachNote', () => {
  it('saves a trimmed note in the coach-only table for the coach’s own team, then refreshes the roster', async () => {
    expect(await setPlayerAvailabilityCoachNote({ playerId: 'p-1', note: '  wrist, back Friday  ' })).toEqual({ success: true });
    const [w] = writes();
    expect(w!.table).toBe('golf_player_availability_coach_notes');
    expect(w!.op).toBe('upsert');
    expect(w!.payload).toEqual({ team_id: 'team-1', player_id: 'p-1', note: 'wrist, back Friday', updated_by: 'user-1', updated_at: expect.any(String) });
    expect(w!.options).toEqual({ onConflict: 'team_id,player_id' });
    // Never the teammate-readable column, and never the team row at all.
    expect(state.calls.some((c) => c.table === 'golf_team_members' && c.op !== 'select')).toBe(false);
    expect(cache.revalidatePath).toHaveBeenCalledWith('/golf/dashboard/roster');
    expect(cache.updateTag).toHaveBeenCalledWith('roster');
  });

  it('removes the row for an empty or null note', async () => {
    for (const note of ['', '   ', null]) {
      state.calls = [];
      expect(await setPlayerAvailabilityCoachNote({ playerId: 'p-1', note })).toEqual({ success: true });
      const [w] = writes();
      expect(w!.op).toBe('delete');
      expect(w!.filters).toEqual([
        ['team_id', 'team-1'],
        ['player_id', 'p-1'],
      ]);
    }
  });

  it('refuses a note over 280 characters before touching the database', async () => {
    expect(await setPlayerAvailabilityCoachNote({ playerId: 'p-1', note: 'x'.repeat(281) })).toEqual({ success: false, error: 'Keep the note to 280 characters' });
    expect(state.calls).toEqual([]);
    expect(await setPlayerAvailabilityCoachNote({ playerId: 'p-1', note: 'x'.repeat(280) })).toEqual({ success: true });
  });

  it('refuses a signed-out caller, a non-coach, a coach with no team and a player who is not on the team, and writes nothing', async () => {
    state.user = null;
    expect((await setPlayerAvailabilityCoachNote({ playerId: 'p-1', note: 'a' })).success).toBe(false);
    state.user = { id: 'user-1' };
    state.coach = null;
    expect(await setPlayerAvailabilityCoachNote({ playerId: 'p-1', note: 'a' })).toEqual({ success: false, error: 'Only coaches can save a note' });
    state.coach = { id: 'coach-1', organization_id: 'org-1' };
    state.teamId = null;
    expect(await setPlayerAvailabilityCoachNote({ playerId: 'p-1', note: 'a' })).toEqual({ success: false, error: 'Coach not assigned to a team' });
    state.teamId = 'team-1';
    state.membership = null;
    expect(await setPlayerAvailabilityCoachNote({ playerId: 'p-1', note: 'a' })).toEqual({ success: false, error: 'Player is not on your team' });
    expect(writes()).toEqual([]);
  });

  it('answers "not available yet" while the held migration is not applied, without logging an error', async () => {
    for (const code of ['42P01', 'PGRST205']) {
      state.write = { error: { code, message: 'relation does not exist' } };
      expect(await setPlayerAvailabilityCoachNote({ playerId: 'p-1', note: 'a' })).toEqual({ success: false, error: 'Notes are not available yet' });
    }
    // Only the wrapper's handled soft-failure note; the action itself logs no "failed" error for an expected missing table.
    expect((logger.logServerError.mock.calls as unknown as string[][]).filter(([m]) => String(m).includes('failed'))).toEqual([]);
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it('logs any other write failure and does not refresh', async () => {
    state.write = { error: { code: '57014', message: 'statement timeout' } };
    expect(await setPlayerAvailabilityCoachNote({ playerId: 'p-1', note: 'a' })).toEqual({ success: false, error: 'Failed to save the note' });
    expect(logger.logServerError).toHaveBeenCalledWith(expect.stringContaining('statement timeout'), expect.objectContaining({ action: 'roster.setPlayerAvailabilityCoachNote' }));
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
