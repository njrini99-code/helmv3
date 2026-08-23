import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Both qualifier save paths told the coach "saved" when the write changed
 * nothing.
 *
 * A PostgREST UPDATE that matches no rows resolves as `{ data: null, error:
 * null }` — the same shape as a successful one. Neither
 * `updateGolfQualifierDetails` nor `setQualifierRoundCourses` looked at the
 * affected rows, so both returned `{ success: true }` and
 * `FairwayEditQualifier` navigated to the detail page as though the edit had
 * landed. The coach finds out when they reload.
 *
 * The repo already settled how to close this, twice, with the reasoning
 * written down each time:
 *
 *   development.ts recordFocusAreaOutcomeImpl
 *     "Select the updated row back so a 0-row update … surfaces as a failure
 *      rather than a false {success:true} — a PostgREST UPDATE matching no
 *      rows returns error:null."
 *   rsvp.ts
 *     `.select('id')` + WriteIntegrityError, closing audit Finding 4 where
 *     "RLS denials and constraint violations returned success: true to the
 *      user with zero rows persisted."
 *
 * These two are the same gap in a save path that had NO test of any kind.
 *
 * WHY A ROW CAN GO MISSING HERE. The app's own gate and the database's do not
 * agree on who may edit a qualifier. `updateGolfQualifierDetailsImpl` compares
 * ORGANISATIONS (`coach.organization_id === qualifierTeam.organization_id`),
 * while the RLS policy `golf_qualifiers_update_coach` is
 * `is_golf_team_coach(team_id)` — which requires a `golf_team_coach_staff` row
 * for that specific team. Org-membership is the broader set. Production
 * currently holds one coach in exactly that state (an org coach with no staff
 * row for their team), which is what makes the divergence worth closing rather
 * than theoretical; today the SELECT policy happens to filter that same
 * population out one step earlier, so this is a latent hole rather than a live
 * one. It stops being latent the moment a read policy is loosened — and
 * `admin_read_all` already loosens it for admins.
 *
 * Whatever the cause — RLS denial, a concurrently deleted qualifier, a stale
 * id — reporting success for a write that moved nothing is the failure this
 * pins.
 */

// `vi.hoisted` because vi.mock factories are lifted above every top-level
// const; referencing a plain one from inside a factory throws
// "Cannot access 'logServerError' before initialization".
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

/** Rows an UPDATE ... RETURNING should come back with. Empty = matched nothing. */
let updateReturns: unknown[] = [{ id: 'q1' }];
/** Rows a SELECT should return, per table. */
let selectRows: Record<string, unknown> = {};

function tableChain(table: string) {
  const node: Record<string, unknown> = {};
  const self = () => node;
  let mode: 'select' | 'update' | 'upsert' | 'delete' = 'select';

  const settleSelect = (): Outcome => ok(selectRows[table] ?? null);
  // A PostgREST UPDATE with no `.select()` resolves `{ data: null, error: null }`
  // whether it matched 1 row or 0 — that ambiguity is the bug. With `.select()`
  // the caller gets the affected rows and can tell.
  const settleUpdate = (): Outcome => ok(updateReturns);

  Object.assign(node, {
    select: () => {
      if (mode === 'select') return node;
      return node; // update(...).select() — settled by `then` below
    },
    update: () => {
      mode = 'update';
      return node;
    },
    upsert: () => {
      mode = 'upsert';
      return node;
    },
    delete: () => {
      mode = 'delete';
      return node;
    },
    eq: self,
    neq: self,
    in: self,
    gt: self,
    order: self,
    limit: self,
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

import {
  updateGolfQualifierDetails,
  setQualifierRoundCourses,
} from '@/app/golf/actions/golf';

/** The reads both actions make before writing — all authorised, same org. */
function authorisedReads() {
  selectRows = {
    golf_qualifiers: { team_id: 'team-1' },
    golf_coaches: { organization_id: 'org-1' },
    golf_teams: { organization_id: 'org-1' },
  };
}

describe('qualifier saves report failure when the write matched no rows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorisedReads();
    updateReturns = [{ id: 'q1' }];
  });

  it('updateGolfQualifierDetails does not claim success on a 0-row update', async () => {
    updateReturns = [];

    const result = await updateGolfQualifierDetails('q1', { name: 'Fall Qualifier' });

    expect(result.success).toBe(false);
  });

  it('updateGolfQualifierDetails still succeeds when a row was updated', async () => {
    updateReturns = [{ id: 'q1' }];

    const result = await updateGolfQualifierDetails('q1', { name: 'Fall Qualifier' });

    expect(result.success).toBe(true);
  });

  it('setQualifierRoundCourses does not claim success on a 0-row update', async () => {
    // The single-round path FairwayEditQualifier takes: `isMultiRound` false
    // sends an empty roundCourses array, so the num_rounds UPDATE is the only
    // write that happens and there is nothing else to fail loudly.
    updateReturns = [];

    const result = await setQualifierRoundCourses('q1', 1, []);

    expect(result.success).toBe(false);
  });

  it('setQualifierRoundCourses still succeeds when a row was updated', async () => {
    updateReturns = [{ id: 'q1' }];

    const result = await setQualifierRoundCourses('q1', 1, []);

    expect(result.success).toBe(true);
  });

  it('setQualifierRoundCourses rejects an invalid cap instead of silently turning it into one round', async () => {
    const result = await setQualifierRoundCourses('q1', 0, []);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/round count must be between 1 and 50/i);
    }
  });

  it('updateGolfQualifierDetails still short-circuits an empty patch', async () => {
    // No fields sent → nothing to write → success without touching the table.
    // This must NOT start failing just because "no rows were updated".
    updateReturns = [];

    const result = await updateGolfQualifierDetails('q1', {});

    expect(result.success).toBe(true);
  });
});
