import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * "Discard round" reported success when it deleted nothing — and threw away
 * the local recovery snapshot on the way out.
 *
 * `deleteInProgressRoundImpl` filters on three things:
 *
 *     .eq('id', roundId).eq('player_id', player.id).eq('status', 'in_progress')
 *
 * The first two are ownership and are right. The THIRD is semantic: a round
 * that has already been submitted no longer matches. A PostgREST DELETE that
 * matches no rows resolves `{ data: null, error: null }` — identical to one
 * that deleted a row — and the action only checked `error`, so it returned
 * `{ success: true }`.
 *
 * The caller acts on that. `continue-round-client.tsx`'s `handleDeleteRound`
 * does, in order:
 *
 *     clearEmergencySave(roundId)   // localStorage.removeItem — irreversible
 *     setShowExitModal(false)
 *     router.push('/golf/dashboard/rounds')
 *
 * So on a no-op delete the player loses their local recovery snapshot, is
 * navigated away, is told nothing, and the round is still on the server. That
 * is strictly worse than "it came back after a refresh".
 *
 * The race is ordinary: a submit that succeeded server-side but errored on the
 * client (or completed in another tab) leaves the row `completed`. Production
 * holds 321 completed rounds against 10 in_progress, so 97% of the table is
 * already in the state where Discard silently does nothing.
 *
 * Same class as #1498's qualifier saves, and the same fix the repo already
 * settled in `recordFocusAreaOutcomeImpl` and `rsvp.ts`: select the affected
 * rows back and treat empty as a failure.
 */

const { logServerError } = vi.hoisted(() => ({ logServerError: vi.fn(async () => {}) }));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Outcome = { data: unknown; error: unknown };
const ok = (data: unknown): Outcome => ({ data, error: null });

/** Rows the DELETE ... RETURNING comes back with. Empty = matched nothing. */
let deleteReturns: unknown[] = [{ id: 'r1' }];
/** The player profile lookup. */
let playerRow: unknown = { id: 'player-1' };

function tableChain() {
  const node: Record<string, unknown> = {};
  const self = () => node;
  let mode: 'select' | 'delete' = 'select';

  const settle = (): Outcome => (mode === 'select' ? ok(playerRow) : ok(deleteReturns));

  Object.assign(node, {
    select: self,
    delete: () => {
      mode = 'delete';
      return node;
    },
    eq: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: () => tableChain(),
  }),
}));

import { deleteInProgressRound } from '@/app/golf/actions/golf';

const ROUND_ID = '11111111-2222-4333-8444-555555555555';

describe('deleteInProgressRound reports failure when it deleted nothing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    playerRow = { id: 'player-1' };
    deleteReturns = [{ id: ROUND_ID }];
  });

  it('does not claim success when the round no longer matches (already submitted)', async () => {
    deleteReturns = [];

    const result = await deleteInProgressRound(ROUND_ID);

    expect(result.success).toBe(false);
  });

  it('says something the player can act on, not a generic failure', async () => {
    deleteReturns = [];

    const result = await deleteInProgressRound(ROUND_ID);

    // The player's local recovery snapshot is about to be cleared on success,
    // so the message has to distinguish "nothing to discard" from "try again".
    // `ActionResult` is a discriminated union — narrow before reading `error`.
    if (result.success) throw new Error('expected the discard to fail');
    expect(result.error).toMatch(/finish|complet|no longer/i);
  });

  it('still succeeds when a row was actually deleted', async () => {
    deleteReturns = [{ id: ROUND_ID }];

    const result = await deleteInProgressRound(ROUND_ID);

    expect(result.success).toBe(true);
  });

  it('still refuses an invalid round id before touching the database', async () => {
    const result = await deleteInProgressRound('not-a-uuid');

    if (result.success) throw new Error('expected an invalid id to be refused');
    expect(result.error).toBe('Invalid round ID');
  });

  it('still refuses when there is no player profile', async () => {
    playerRow = null;

    const result = await deleteInProgressRound(ROUND_ID);

    if (result.success) throw new Error('expected a missing player to be refused');
    expect(result.error).toBe('Player profile not found');
  });
});
