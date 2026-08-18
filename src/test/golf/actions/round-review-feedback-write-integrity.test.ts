import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `saveCoachFeedback` tells the coach "saved" when the write changed nothing.
 *
 * A PostgREST UPDATE that matches no rows resolves `{ data: null, error: null }`
 * — the same shape as one that matched. The action checks only `error`, so it
 * returns `{ success: true }`, revalidates, and the coach's notes, rating,
 * highlights and focus areas are gone. They find out on reload.
 *
 * Fourth instance of a class this repo has already settled three times, with
 * the reasoning written down each time:
 *
 *   development.ts recordFocusAreaOutcomeImpl — "Select the updated row back so
 *     a 0-row update … surfaces as a failure rather than a false
 *     {success:true}".
 *   rsvp.ts — `.select('id')` + WriteIntegrityError, closing a 2026-05-17 audit
 *     finding where "RLS denials and constraint violations returned
 *     success: true to the user with zero rows persisted".
 *   golf.ts updateGolfQualifierDetails / setQualifierRoundCourses (#1498).
 *
 * BEING STRAIGHT ABOUT EXPOSURE. For an ordinary coach this is LATENT, not
 * live: checked 2026-08-18, `round_reviews_select_coach` and
 * `round_reviews_write_coach` carry the identical predicate, so a review a
 * coach can read is one they can write. Two paths reach it anyway —
 *
 *   - `admin_read_all` grants SELECT on every review via `is_admin()` and has
 *     NO matching UPDATE policy, so that population reads then silently
 *     no-ops;
 *   - a review deleted between the read and the write matches nothing, with no
 *     policy change required at all.
 *
 * And the read/write predicates agreeing today is a fact about today. #1498's
 * qualifier hole opened exactly this way, by the two drifting apart.
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

/** Rows an UPDATE ... RETURNING comes back with. Empty = matched nothing. */
let updateReturns: unknown[] = [{ id: 'rev-1' }];
let selectRows: Record<string, unknown> = {};

function tableChain(table: string) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  let mode: 'select' | 'update' | 'upsert' | 'delete' = 'select';

  const settleSelect = (): Outcome => ok(selectRows[table] ?? null);
  const settleUpdate = (): Outcome => ok(updateReturns);

  Object.assign(node, {
    select: () => node,
    update: () => { mode = 'update'; return node; },
    upsert: () => { mode = 'upsert'; return node; },
    delete: () => { mode = 'delete'; return node; },
    eq: self, neq: self, in: self, gt: self, order: self, limit: self,
    single: async () => (mode === 'select' ? settleSelect() : settleUpdate()),
    maybeSingle: async () => (mode === 'select' ? settleSelect() : settleUpdate()),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(mode === 'select' ? settleSelect() : settleUpdate()).then(resolve, reject),
  });
  return node;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => tableChain(table),
  }),
}));

import { saveCoachFeedback } from '@/app/golf/actions/round-reviews';

const REVIEW_ID = '11111111-1111-4111-8111-111111111111';

/** The reads the action makes before writing — coach found, review editable. */
function authorisedReads() {
  selectRows = {
    golf_coaches: { id: 'coach-1' },
    golf_round_reviews: {
      id: REVIEW_ID,
      player_id: 'p1',
      patterns_detected: { status: 'coach_review' },
    },
  };
}

describe('saveCoachFeedback reports failure when the write matched no rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorisedReads();
    updateReturns = [{ id: REVIEW_ID }];
  });

  it('does not claim success on a 0-row update', async () => {
    updateReturns = [];

    const result = await saveCoachFeedback(REVIEW_ID, { coach_notes: 'Work the 5-footers.' });

    expect(result.success).toBe(false);
  });

  it('says what might actually be wrong rather than a bare failure', async () => {
    updateReturns = [];

    const result = await saveCoachFeedback(REVIEW_ID, { coach_notes: 'Work the 5-footers.' });

    // The coach can act on "deleted / no access"; they cannot act on "failed".
    expect(result.error).toMatch(/deleted|access/i);
  });

  it('logs the review id so a silent no-op is diagnosable after the fact', async () => {
    updateReturns = [];

    await saveCoachFeedback(REVIEW_ID, { coach_notes: 'Work the 5-footers.' });

    expect(logServerError).toHaveBeenCalled();
    const logged = logServerError.mock.calls.map((c) => JSON.stringify(c)).join(' ');
    expect(logged).toContain(REVIEW_ID);
  });

  it('still succeeds when a row was updated', async () => {
    updateReturns = [{ id: REVIEW_ID }];

    const result = await saveCoachFeedback(REVIEW_ID, { coach_notes: 'Work the 5-footers.' });

    expect(result.success).toBe(true);
  });

  it('still succeeds on an approve with no notes', async () => {
    // Control: approving without notes writes only patterns_detected, and must
    // not start failing merely because the shape of the patch changed.
    updateReturns = [{ id: REVIEW_ID }];

    const result = await saveCoachFeedback(REVIEW_ID, {}, true);

    expect(result.success).toBe(true);
  });
});
