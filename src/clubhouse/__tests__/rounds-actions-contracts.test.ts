import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

/**
 * Rounds (P011) 110804: Discard is checked again by deleteInProgressRound, whatever the screen shows. These run the real action
 * the library's Discard calls (LIVE_ROUNDS_WRITES.discard) against a fake database, as callers it must turn away, and assert
 * what was and was not deleted.
 */

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));
vi.mock('@/lib/utils/emergency-save', () => ({ clearEmergencySave: vi.fn(), markRoundDiscarded: vi.fn() }));

import { deleteInProgressRound } from '@/app/golf/actions/round-partial';
import { clearEmergencySave } from '@/lib/utils/emergency-save';
import { LIVE_ROUNDS_WRITES } from '../screens/rounds/writes';

type Row = Record<string, unknown>;

const MINE = 'a0000000-0000-4000-8000-000000000001';
const THEIRS = 'a0000000-0000-4000-8000-000000000002';
const SUBMITTED = 'a0000000-0000-4000-8000-000000000003';
const GONE = 'a0000000-0000-4000-8000-000000000009';

/** Player 1 (user-1) has one round in progress and one posted; player 2 (user-2) has one in progress. user-3 has no player profile. */
function world(callerUserId: string | null) {
  const tables: Record<string, Row[]> = {
    golf_players: [
      { id: 'player-1', user_id: 'user-1' },
      { id: 'player-2', user_id: 'user-2' },
    ],
    golf_rounds: [
      { id: MINE, player_id: 'player-1', status: 'in_progress' },
      { id: THEIRS, player_id: 'player-2', status: 'in_progress' },
      { id: SUBMITTED, player_id: 'player-1', status: 'completed' },
    ],
  };
  fake = createFakeSupabase({ user: callerUserId ? { id: callerUserId } : null, tables });
  return tables;
}
const ids = (t: Record<string, Row[]>) => t.golf_rounds!.map((r) => r.id).sort();
const all = [MINE, THEIRS, SUBMITTED].sort();

beforeEach(() => vi.clearAllMocks());

describe('110804 deleteInProgressRound turns away what the library would never send', () => {
  it('110804 an id that is not a round id', async () => {
    const t = world('user-1');
    expect(await deleteInProgressRound('not-a-uuid')).toEqual({ success: false, error: 'Invalid round ID' });
    expect(ids(t)).toEqual(all);
  });

  it('110804 a caller who is not signed in', async () => {
    const t = world(null);
    expect(await deleteInProgressRound(MINE)).toEqual({ success: false, error: 'You must be signed in' });
    expect(ids(t)).toEqual(all);
  });

  it('110804 a caller with no player profile', async () => {
    const t = world('user-3');
    expect(await deleteInProgressRound(MINE)).toEqual({ success: false, error: 'Player profile not found' });
    expect(ids(t)).toEqual(all);
  });

  it('110804 a round that is no longer in progress (posted) is refused and kept, with words that say retrying cannot help', async () => {
    const t = world('user-1');
    const res = await deleteInProgressRound(SUBMITTED);
    expect(res.success).toBe(false);
    expect(res).toMatchObject({ error: expect.stringMatching(/can no longer be discarded/) });
    expect(ids(t)).toEqual(all);
  });

  it('110804 another player’s round in progress is never deleted by this caller', async () => {
    const t = world('user-1');
    await deleteInProgressRound(THEIRS);
    expect(ids(t)).toEqual(all);
    expect(t.golf_rounds!.find((r) => r.id === THEIRS)).toMatchObject({ player_id: 'player-2', status: 'in_progress' });
  });

  it('110804 the caller’s own round in progress is deleted, and only that one', async () => {
    const t = world('user-1');
    expect(await deleteInProgressRound(MINE)).toEqual({ success: true, data: undefined });
    expect(ids(t)).toEqual([THEIRS, SUBMITTED].sort());
  });

  it('110804 a round that is already gone is the outcome the player wanted: success, and nothing else is touched (a discard is idempotent)', async () => {
    const t = world('user-1');
    expect(await deleteInProgressRound(GONE)).toEqual({ success: true, data: undefined });
    expect(ids(t)).toEqual(all);
  });

  it('110804 the library’s Discard is this action, and keeps the device copy when the action refuses', async () => {
    world('user-1');
    const refused = await LIVE_ROUNDS_WRITES.discard(SUBMITTED, 'player-1');
    expect(refused.success).toBe(false);
    expect(clearEmergencySave).not.toHaveBeenCalled();
    const done = await LIVE_ROUNDS_WRITES.discard(MINE, 'player-1');
    expect(done.success).toBe(true);
    expect(clearEmergencySave).toHaveBeenCalledWith(MINE, 'player-1');
  });
});
