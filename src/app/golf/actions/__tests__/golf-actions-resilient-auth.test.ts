/**
 * @vitest-environment node
 *
 * A5 — deleteShot, updateShot, deleteInProgressRound, getNextQualifierRoundNumber
 * and getPlayerQualifiers all called raw `supabase.auth.getUser()`, which
 * returns `user: null` not only on a genuine sign-out but also when GoTrue is
 * merely rate-limited or briefly unreachable (see
 * src/lib/auth/resilient-get-user.ts's own header — the burst-load mass-logout
 * class of bug). `savePartialRound`/`submitGolfRoundComprehensive` already
 * carry a bespoke transient-vs-real distinction for auto-save; these five
 * reads/writes had none, so a GoTrue blip mid-round surfaced as "You must be
 * signed in" for a validly signed-in player.
 *
 * Pinned here: each of the five calls `getUserResilient`, not
 * `supabase.auth.getUser()` directly — proven by seeding the fake client's
 * raw `auth.getUser()` to answer "signed out" while the (mocked)
 * `getUserResilient` answers with a real, degraded-but-present user. Only a
 * caller that actually goes through `getUserResilient` can see that user.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
let resilientUser: { id: string } | null = { id: 'u-p1' };

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('next/server', () => ({ after: vi.fn((cb: () => unknown) => cb()) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({ postRoundTrigger: vi.fn(async () => {}) }));
vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidateOnRoundComplete: vi.fn(async () => {}),
  invalidateStatsCache: vi.fn(async () => {}),
}));
vi.mock('@/lib/admin-logger', () => ({ logRoundSubmitted: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications', () => ({ notifyQualifierCreated: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications/email', () => ({ sendEmailNotification: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/notifications/push', () => ({ sendBulkPushNotification: vi.fn(async () => {}) }));

// The fake client's OWN raw auth.getUser() (via createFakeSupabase's `user`
// option) answers "signed out" (see `seed()` below, which never passes
// `user`). getUserResilient is mocked separately so only a caller that
// actually routes through it ever sees `resilientUser`.
vi.mock('@/lib/auth/resilient-get-user', () => ({
  getUserResilient: vi.fn(async () => ({ user: resilientUser, degraded: resilientUser != null })),
}));

import {
  deleteShot,
  updateShot,
  deleteInProgressRound,
  getNextQualifierRoundNumber,
  getPlayerQualifiers,
} from '../golf';

const SHOT = '11111111-1111-4111-8111-111111111111';
const ROUND = '22222222-2222-4222-8222-222222222222';
const QUALIFIER = '33333333-3333-4333-8333-333333333333';

function seed() {
  // No `user` option — the fake's raw auth.getUser() answers { user: null }.
  // A caller reading it directly would report "You must be signed in".
  fake = createFakeSupabase({
    tables: {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      golf_rounds: [{ id: ROUND, player_id: 'player-1', status: 'in_progress' }],
      golf_shots: [{ id: SHOT, round_id: ROUND, hole_number: 1, shot_number: 1 }],
      golf_qualifier_entries: [{ id: 'entry-1', qualifier_id: QUALIFIER, player_id: 'player-1' }],
      golf_qualifiers: [{ id: QUALIFIER, num_rounds: 3, status: 'in_progress' }],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resilientUser = { id: 'u-p1' };
  seed();
});

describe.each([
  ['deleteInProgressRound', () => deleteInProgressRound(ROUND)],
  ['getNextQualifierRoundNumber', () => getNextQualifierRoundNumber(QUALIFIER)],
  ['getPlayerQualifiers', () => getPlayerQualifiers()],
  ['deleteShot', () => deleteShot(SHOT)],
  ['updateShot', () => updateShot(SHOT, { result: 'rough' })],
] as const)('%s — auth resilience (A5)', (_name, run) => {
  it('does not treat a resilient (degraded but present) user as signed out', async () => {
    // The raw fake client would answer "signed out" here; only a call that
    // actually goes through the mocked getUserResilient sees this user.
    const result = await run();

    expect(result.success).not.toBe(false);
    if (!result.success) {
      // Fail loudly with the actual message rather than a bare boolean diff.
      throw new Error(`expected success, got failure: ${JSON.stringify(result)}`);
    }
  });

  it('still reports a genuine sign-out (no resilient user either) as "You must be signed in"', async () => {
    resilientUser = null;

    const result = await run();

    expect(result).toEqual({ success: false, error: 'You must be signed in' });
  });
});
