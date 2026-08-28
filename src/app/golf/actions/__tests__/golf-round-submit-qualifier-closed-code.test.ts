/**
 * Production-derived regression: the completed-qualifier guard in
 * `submitGolfRoundComprehensive` paged Sentry as an `error` for an outcome the
 * codebase already classifies as a routine `warning` everywhere else.
 *
 * EVIDENCE (production, fingerprint analysed 2026-08-27, confidence high):
 * 18 occurrences inside one 32-minute window on 2026-08-23 (01:21–01:53 UTC)
 * across 2 distinct users — one qualifier being marked `completed` by a coach
 * while those players' clients were still mid-submission. The guard is
 * CORRECT; only its telemetry severity was wrong.
 *
 * THE DEFECT, precisely: the guard returned
 *
 *     { success: false, error: 'This qualifier has already been completed. …' }
 *
 * with no `code`. `severityForSoftFailure()` only downgrades a soft failure to
 * 'warning'/skipSentry when it recognises a `code` in EXPECTED_SOFT_FAILURE_CODES
 * (or a message in EXPECTED_SOFT_FAILURE_PATTERNS, which this wording does not
 * match). With neither, it falls through to 'error'.
 *
 * It is an inconsistency between two duplicate guards, not a policy question:
 * the SAME business outcome in this same file already returns
 * `code: 'qualifier_closed'` and is already tiered correctly, and
 * 'qualifier_closed' has been in EXPECTED_SOFT_FAILURE_CODES all along.
 *
 * WHY THIS TEST IS SHAPED THIS WAY. It asserts on the classification of the
 * object the action ACTUALLY returns, rather than on a hand-built
 * `{message, code}` pair. A fixture-built pair would prove only that the
 * allowlist contains the string — which was never in doubt and is already
 * covered in observe-action-result.test.ts. The open question was whether the
 * guard emits a code the allowlist can see, so the action's real return value
 * has to be the input.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

import { submitGolfRoundComprehensive } from '../golf';
import {
  extractActionSoftFailure,
  classifySoftFailure,
} from '@/lib/admin/observe-action-result';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const QUALIFIER_ID = '22222222-2222-4222-8222-222222222222';
const CLOSED_MESSAGE =
  'This qualifier has already been completed. Rounds can no longer be submitted.';

function makeHole(holeNumber: number) {
  return {
    holeNumber,
    par: 4,
    yardage: 380,
    score: 5,
    putts: 2,
    fairwayHit: true,
    greenInRegulation: false,
    drivingDistance: null,
    usedDriver: null,
    driveMissDirection: null,
    approachDistance: null,
    approachLie: null,
    approachProximity: null,
    approachMissDirection: null,
    scrambleAttempt: false,
    scrambleMade: false,
    sandSaveAttempt: false,
    sandSaveMade: false,
    penaltyStrokes: 0,
    firstPuttDistance: null,
    firstPuttLeave: null,
    firstPuttBreak: null,
    firstPuttSlope: null,
    firstPuttMissDirection: null,
    holedOutDistance: null,
    holedOutType: null,
    shots: [
      {
        shotNumber: 1,
        shotType: 'tee' as const,
        clubType: 'driver' as const,
        lieBefore: 'tee' as const,
        distanceToHoleBefore: 380,
        distanceUnitBefore: 'yards' as const,
        result: 'fairway' as const,
        distanceToHoleAfter: 150,
        distanceUnitAfter: 'yards' as const,
        shotDistance: 230,
        isPenalty: false,
      },
    ],
  };
}

function makeQualifierRoundInput() {
  return {
    courseName: 'Test Course',
    courseId: COURSE_ID,
    roundType: 'qualifier' as const,
    qualifierId: QUALIFIER_ID,
    qualifierRoundNumber: 1,
    roundDate: new Date().toISOString().slice(0, 10),
    holes: Array.from({ length: 9 }, (_, i) => makeHole(i + 1)),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeSupabase({
    user: { id: 'u-p1' },
    tables: {
      golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
      golf_team_members: [],
      golf_rounds: [],
      // The exact production condition: a coach closed the qualifier while
      // this player's client was still mid-submission.
      golf_qualifiers: [{ id: QUALIFIER_ID, status: 'completed', num_rounds: 3 }],
    },
  });
});

describe('submitGolfRoundComprehensive — a closed qualifier is a warning, not a Sentry error', () => {
  it('rejects the submission through the completed-qualifier guard', () => {
    // Pins WHICH guard produced the result. Without this, a different soft
    // failure that happens to be warning-tiered would satisfy the assertions
    // below and the test would pass while proving nothing about this fix.
    return submitGolfRoundComprehensive(makeQualifierRoundInput()).then((result) => {
      expect(result.success).toBe(false);
      expect((result as { error?: string }).error).toBe(CLOSED_MESSAGE);
    });
  });

  it('carries code "qualifier_closed", so the allowlist can see it', async () => {
    const result = await submitGolfRoundComprehensive(makeQualifierRoundInput());
    const soft = extractActionSoftFailure(result);

    expect(soft).not.toBeNull();
    expect(soft!.message).toBe(CLOSED_MESSAGE);
    // The defect, stated directly: this was `null`.
    expect(soft!.code).toBe('qualifier_closed');
  });

  it('classifies as warning + skipSentry, matching the identical guard elsewhere in this file', async () => {
    const result = await submitGolfRoundComprehensive(makeQualifierRoundInput());
    const soft = extractActionSoftFailure(result);

    // Classified from the code the ACTION returned — not a literal typed into
    // this test. That is what makes this a regression test for the guard
    // rather than a restatement of the allowlist's contents.
    const { severity, skipSentry } = classifySoftFailure(soft!.message, soft!.code);

    expect(severity).toBe('warning');
    expect(skipSentry).toBe(true);
  });
});
