import { beforeEach, describe, expect, it, vi } from 'vitest';

/** saveRoundCoachNote: only a coach of the player's team writes, only on a posted round, and only the note column changes. */

type Round = { id: string; player_id: string; status: string; is_test: boolean } | null;
const state = vi.hoisted(() => ({
  user: { id: 'u-coach' } as { id: string } | null,
  round: null as Round,
  roundError: null as { message: string } | null,
  access: { allowed: true, reason: 'coach' } as { allowed: boolean; reason: string },
  /** The round's review row, or null when CoachHelm has not generated one. */
  existing: { id: 'review-1' } as { id: string } | null,
  updateError: null as { message: string; code?: string } | null,
  insertError: null as { message: string; code?: string } | null,
  /** A review row that appears after the first update found none (a generation racing the note). */
  appearsAfterMiss: false,
  updates: [] as Array<Record<string, unknown>>,
  inserts: [] as Array<Record<string, unknown>>,
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
        update: (row: Record<string, unknown>) => {
          state.updates.push(row);
          return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: state.updateError ? null : state.existing, error: state.updateError }) }) }) };
        },
        insert: (row: Record<string, unknown>) => {
          state.inserts.push(row);
          return {
            select: () => ({
              maybeSingle: async () => {
                if (state.appearsAfterMiss) {
                  state.existing = { id: 'review-2' };
                  return { data: null, error: { message: 'duplicate key', code: '23505' } };
                }
                return state.insertError ? { data: null, error: state.insertError } : { data: { id: 'review-new' }, error: null };
              },
            }),
          };
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
  state.existing = { id: 'review-1' };
  state.updateError = null;
  state.insertError = null;
  state.appearsAfterMiss = false;
  state.updates = [];
  state.inserts = [];
  notify.mockClear();
});

describe('saveRoundCoachNote', () => {
  it('saves the trimmed note on the round’s existing review row, touching only the note, and tells the player', async () => {
    const res = await saveRoundCoachNote('round-1', '  Good lag putting.  ');
    expect(res).toEqual({ success: true, data: { note: 'Good lag putting.' } });
    expect(state.inserts).toHaveLength(0);
    expect(state.updates).toHaveLength(1);
    expect(Object.keys(state.updates[0]!).sort()).toEqual(['coach_notes', 'updated_at']);
    expect(state.updates[0]).toMatchObject({ coach_notes: 'Good lag putting.' });
    expect(notify).toHaveBeenCalledWith({ player_id: 'player-1', round_id: 'round-1', review_id: 'review-1' });
  });

  it('a round with no review gets a row marked pending, so no reader takes the note for a generated review', async () => {
    state.existing = null;
    const res = await saveRoundCoachNote('round-1', 'Work on the wedges.');
    expect(res).toEqual({ success: true, data: { note: 'Work on the wedges.' } });
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({ round_id: 'round-1', player_id: 'player-1', coach_notes: 'Work on the wedges.', patterns_detected: { status: 'pending' } });
    // Nothing else a review holds is set: no summary, no round_stats, no status column override.
    expect(Object.keys(state.inserts[0]!).sort()).toEqual(['coach_notes', 'patterns_detected', 'player_id', 'round_id', 'updated_at']);
    expect(notify).toHaveBeenCalledWith({ player_id: 'player-1', round_id: 'round-1', review_id: 'review-new' });
  });

  it('a review generated between the two writes keeps its content: the note goes on that row', async () => {
    state.existing = null;
    state.appearsAfterMiss = true;
    const res = await saveRoundCoachNote('round-1', 'Nice round.');
    expect(res.success).toBe(true);
    expect(state.updates).toHaveLength(2);
    expect(notify).toHaveBeenCalledWith({ player_id: 'player-1', round_id: 'round-1', review_id: 'review-2' });
  });

  it('refuses an empty note and one over 2,000 characters, without reading anything', async () => {
    expect((await saveRoundCoachNote('round-1', '   ')).success).toBe(false);
    const long = await saveRoundCoachNote('round-1', 'x'.repeat(2001));
    expect(long.success).toBe(false);
    expect(long.error).toMatch(/2000/);
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });

  it('refuses a signed-out caller', async () => {
    state.user = null;
    const res = await saveRoundCoachNote('round-1', 'Hi');
    expect(res.success).toBe(false);
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });

  it('gives one answer for a missing round and a test round', async () => {
    state.round = null;
    const missing = await saveRoundCoachNote('round-1', 'Hi');
    state.round = { id: 'round-1', player_id: 'player-1', status: 'completed', is_test: true };
    const test = await saveRoundCoachNote('round-1', 'Hi');
    expect(missing.error).toBe(test.error);
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });

  it('waits for a posted round', async () => {
    state.round = { id: 'round-1', player_id: 'player-1', status: 'in_progress', is_test: false };
    const res = await saveRoundCoachNote('round-1', 'Hi');
    expect(res.success).toBe(false);
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
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
    expect(state.updates).toHaveLength(0);
    expect(state.inserts).toHaveLength(0);
  });

  it('CH-11023 reports a failed write as a failure and does not notify the player', async () => {
    state.updateError = { message: 'boom', code: '42501' };
    const res = await saveRoundCoachNote('round-1', 'Hi');
    expect(res.success).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('treats an insert that fails as a failure and does not notify the player', async () => {
    state.existing = null;
    state.insertError = { message: 'boom', code: '42501' };
    expect((await saveRoundCoachNote('round-1', 'Hi')).success).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('treats a write that returns no row (RLS filtered it) as a failure', async () => {
    state.existing = null;
    state.insertError = { message: 'no row', code: '23505' };
    state.appearsAfterMiss = false;
    expect((await saveRoundCoachNote('round-1', 'Hi')).success).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });
});
