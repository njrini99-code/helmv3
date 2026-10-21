import { beforeEach, describe, expect, it, vi } from 'vitest';

/** saveRoundCoachNote: only a coach of the player's team writes, only on a posted round, and only the note column changes. */

type Round = { id: string; player_id: string; status: string; is_test: boolean } | null;
const state = vi.hoisted(() => ({
  user: { id: 'u-coach' } as { id: string } | null,
  round: null as Round,
  roundError: null as { message: string } | null,
  access: { allowed: true, reason: 'coach' } as { allowed: boolean; reason: string },
  upsertError: null as { message: string; code?: string } | null,
  upsertRow: { id: 'review-1' } as { id: string } | null,
  upserts: [] as Array<{ row: Record<string, unknown>; opts: Record<string, unknown> }>,
}));
const notify = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    from: (table: string) => {
      if (table === 'golf_rounds') {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: state.round, error: state.roundError }) };
        return q;
      }
      return {
        upsert: (row: Record<string, unknown>, opts: Record<string, unknown>) => {
          state.upserts.push({ row, opts });
          return { select: () => ({ maybeSingle: async () => ({ data: state.upsertRow, error: state.upsertError }) }) };
        },
      };
    },
  }),
}));
vi.mock('@/lib/auth/verify-player-access', () => ({ verifyPlayerAccess: async () => state.access }));
vi.mock('@/lib/coachhelm/v3/notifications/notify', () => ({ notifyCoachCommented: notify }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: <T extends (...a: never[]) => unknown>(_n: string, _o: unknown, fn: T) => fn }));

import { saveRoundCoachNote } from '../round-coach-note';

beforeEach(() => {
  state.user = { id: 'u-coach' };
  state.round = { id: 'round-1', player_id: 'player-1', status: 'completed', is_test: false };
  state.roundError = null;
  state.access = { allowed: true, reason: 'coach' };
  state.upsertError = null;
  state.upsertRow = { id: 'review-1' };
  state.upserts = [];
  notify.mockClear();
});

describe('saveRoundCoachNote', () => {
  it('saves the trimmed note on the round’s review row, touching only the note, and tells the player', async () => {
    const res = await saveRoundCoachNote('round-1', '  Good lag putting.  ');
    expect(res).toEqual({ success: true, data: { note: 'Good lag putting.' } });
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]!.opts).toEqual({ onConflict: 'round_id' });
    expect(Object.keys(state.upserts[0]!.row).sort()).toEqual(['coach_notes', 'player_id', 'round_id', 'updated_at']);
    expect(state.upserts[0]!.row).toMatchObject({ round_id: 'round-1', player_id: 'player-1', coach_notes: 'Good lag putting.' });
    expect(notify).toHaveBeenCalledWith({ player_id: 'player-1', round_id: 'round-1', review_id: 'review-1' });
  });

  it('refuses an empty note and one over 2,000 characters, without reading anything', async () => {
    expect((await saveRoundCoachNote('round-1', '   ')).success).toBe(false);
    const long = await saveRoundCoachNote('round-1', 'x'.repeat(2001));
    expect(long.success).toBe(false);
    expect(long.error).toMatch(/2000/);
    expect(state.upserts).toHaveLength(0);
  });

  it('refuses a signed-out caller', async () => {
    state.user = null;
    const res = await saveRoundCoachNote('round-1', 'Hi');
    expect(res.success).toBe(false);
    expect(state.upserts).toHaveLength(0);
  });

  it('gives one answer for a missing round and a test round', async () => {
    state.round = null;
    const missing = await saveRoundCoachNote('round-1', 'Hi');
    state.round = { id: 'round-1', player_id: 'player-1', status: 'completed', is_test: true };
    const test = await saveRoundCoachNote('round-1', 'Hi');
    expect(missing.error).toBe(test.error);
    expect(state.upserts).toHaveLength(0);
  });

  it('waits for a posted round', async () => {
    state.round = { id: 'round-1', player_id: 'player-1', status: 'in_progress', is_test: false };
    const res = await saveRoundCoachNote('round-1', 'Hi');
    expect(res.success).toBe(false);
    expect(state.upserts).toHaveLength(0);
  });

  it('refuses the player themselves (reason self), another team’s coach (denied) and a failed access check', async () => {
    for (const access of [
      { allowed: true, reason: 'self' },
      { allowed: false, reason: 'denied' },
    ]) {
      state.access = access;
      const res = await saveRoundCoachNote('round-1', 'Hi');
      expect(res.success, access.reason).toBe(false);
    }
    state.access = { allowed: false, reason: 'unavailable' };
    expect((await saveRoundCoachNote('round-1', 'Hi')).error).toMatch(/try again/i);
    expect(state.upserts).toHaveLength(0);
  });

  it('CH-11023 reports a failed write as a failure and does not notify the player', async () => {
    state.upsertError = { message: 'boom', code: '42501' };
    const res = await saveRoundCoachNote('round-1', 'Hi');
    expect(res.success).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('treats a write that returns no row (RLS filtered it) as a failure', async () => {
    state.upsertRow = null;
    expect((await saveRoundCoachNote('round-1', 'Hi')).success).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});
