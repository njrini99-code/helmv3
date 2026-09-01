/**
 * @vitest-environment node
 *
 * A GoTrue round trip that dies in transit is NOT a sign-out — on the
 * shot-editing surface too.
 *
 * `isTransientAuthCheckFailure` exists because on 2026-08-19 six auth checks
 * across four Guilford rounds were logged as "session expired mid-round" while
 * every affected player held a valid, unexpired token: GoTrue shares the
 * contended Postgres, and the client abort was killing /auth/v1/user. The fix
 * reached submitGolfRoundComprehensive and savePartialRound — the two paths
 * that carry data — and stopped there.
 *
 * It did not reach deleteShot, updateShot or getRoundShotDetails. A player
 * correcting a shot mid-round during the same blip was told "You must be
 * signed in", which is false and costs them the edit. No data is lost (the
 * shot survives, the round is untouched), but it is the same wrong sentence
 * on the surface a player uses WHILE the round is open.
 *
 * The discriminator is the status code, and that is what these tests pin:
 * a 4xx is GoTrue ruling against the session; status 0 / 5xx / abort shapes
 * mean GoTrue never ruled at all.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));
vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void> | void) => cb()),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { deleteShot, updateShot, getRoundShotDetails } from '../golf';

// updateShot validates its payload BEFORE it checks auth — correct ordering,
// and it means the payload here must be genuinely valid or the test never
// reaches the branch under test. club_type is an enum of
// driver | non_driver | putter.
const VALID_UPDATE = { club_type: 'non_driver' } as never;

const SHOT_ID = '00000000-0000-4000-8000-000000000001';
const ROUND_ID = '00000000-0000-4000-8000-000000000002';

/** Make auth.getUser() answer the way a failed round trip does. */
function authFails(error: { status?: number; name?: string; message?: string }) {
  fake = createFakeSupabase({ tables: {} }) as FakeSupabase;
  (fake as unknown as { auth: { getUser: () => Promise<unknown> } }).auth.getUser =
    async () => ({ data: { user: null }, error });
}

// GoTrue never answered. AuthRetryableFetchError carries status 0.
const TRANSIT = { status: 0, name: 'AuthRetryableFetchError', message: 'Failed to fetch' };
// GoTrue answered, and the answer was no.
const REJECTED = { status: 401, name: 'AuthApiError', message: 'invalid claim: missing sub claim' };

describe('shot editing — a transit failure is reported as retryable, not as a sign-out', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deleteShot: transit failure says retry and states the shot was NOT deleted', async () => {
    authFails(TRANSIT);
    const r = await deleteShot(SHOT_ID);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/check your connection/i);
    // The claim that matters to a player mid-round.
    expect(r.error).toMatch(/not deleted/i);
    expect(r.error).not.toMatch(/must be signed in/i);
  });

  it('updateShot: transit failure says retry and states the change was NOT saved', async () => {
    authFails(TRANSIT);
    const r = await updateShot(SHOT_ID, VALID_UPDATE);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/check your connection/i);
    expect(r.error).toMatch(/not saved/i);
    expect(r.error).not.toMatch(/must be signed in/i);
  });

  it('getRoundShotDetails: transit failure says retry, not "Not authenticated"', async () => {
    authFails(TRANSIT);
    const r = await getRoundShotDetails(ROUND_ID);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/check your connection/i);
    expect(r.error).not.toMatch(/not authenticated/i);
  });
});

describe('shot editing — a real rejection still reads as a sign-out', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deleteShot: a 401 keeps the sign-in message', async () => {
    authFails(REJECTED);
    const r = await deleteShot(SHOT_ID);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/must be signed in/i);
  });

  it('updateShot: a 401 keeps the sign-in message', async () => {
    authFails(REJECTED);
    const r = await updateShot(SHOT_ID, VALID_UPDATE);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/must be signed in/i);
  });

  it('getRoundShotDetails: a 401 keeps its original message', async () => {
    authFails(REJECTED);
    const r = await getRoundShotDetails(ROUND_ID);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/not authenticated/i);
  });
});
