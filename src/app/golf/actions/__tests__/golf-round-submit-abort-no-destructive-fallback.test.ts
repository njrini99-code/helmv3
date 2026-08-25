/**
 * Regression test for the 2026-08-20 round-destruction incident.
 * See docs/audits/ROUND_SUBMIT_TIMEOUT_INVERSION_2026-08-20.md.
 *
 * WHAT HAPPENED: `src/lib/supabase/server.ts` aborted the HTTP request at 10s,
 * but `submit_round_atomic` grants itself `statement_timeout=30s`. Aborting a
 * fetch does not cancel the Postgres backend — the RPC kept running and
 * COMMITTED the round in full. The server action saw only a `TimeoutError`,
 * concluded the submit had failed, and ran `submitRoundDirectFallback`, which
 * DELETEs holes+shots and re-inserts them. The re-insert timed out too, the
 * rollback's re-insert timed out as well, and a real player's round
 * (`8e89c73e`, 18 holes / 72 shots) ended up at 0 holes and 0 shots while still
 * marked `status='completed'`.
 *
 * THE INVARIANT: when a write fails in a way that leaves the transaction's
 * outcome UNKNOWN — a client-side abort, which carries no SQLSTATE — the
 * destructive rebuild must NOT run. A DB-returned error (57014, a constraint,
 * a deadlock) is a different case: Postgres rolled back and a rebuild is safe.
 *
 * Both tests below fail against the pre-fix code, because the pre-fix code
 * called the fallback unconditionally on any `rpcError`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
// The fake mutates the table map it is handed but does not expose it, so the
// test holds its own reference — that map IS the database for these tests.
let tables: Record<string, Record<string, unknown>[]>;
let writes: { table: string; op: string }[] = [];

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));

vi.mock('next/server', () => ({
  after: vi.fn(() => {}),
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

vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidateOnRoundComplete: vi.fn(async () => ({ warnings: [] })),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/admin-logger', () => ({
  logRoundSubmitted: vi.fn(async () => {}),
}));

vi.mock('@/lib/notifications', () => ({
  notifyQualifierCreated: vi.fn(async () => {}),
}));

vi.mock('@/lib/notifications/email', () => ({
  sendEmailNotification: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/notifications/push', () => ({
  sendBulkPushNotification: vi.fn(async () => {}),
}));

import { submitGolfRoundComprehensive } from '../golf';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const ROUND_ID = '8e89c73e-5047-4658-85b4-380250dc6245';
const HOLE_COUNT = 9;

/** The exact error shape a client-side `AbortSignal.timeout` produces: a
 *  message with no SQLSTATE. That absence is the discriminator. */
const ABORT_ERROR = {
  message: 'TimeoutError: The operation was aborted due to timeout',
  code: '',
  hint: '',
  details: 'TimeoutError: The operation was aborted due to timeout',
};

// A database failure is determinate from PostgreSQL's perspective, but it is
// still not safe for application code to emulate the protected transaction by
// deleting and rebuilding a player's saved graph. The atomic RPC is the only
// submission path permitted by the lifecycle guard.
const DATABASE_ERROR = {
  message: 'database transaction failed',
  code: 'XX000',
  hint: '',
  details: '',
};

function makeShot(shotNumber: number) {
  return {
    shotNumber,
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
  };
}

function makeHole(holeNumber: number) {
  return {
    holeNumber,
    par: 4,
    yardage: 380,
    score: 4,
    putts: 2,
    fairwayHit: true,
    greenInRegulation: true,
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
    shots: [makeShot(1)],
  };
}

function makeRoundInput() {
  return {
    courseName: 'Bryan Park Champs',
    courseId: COURSE_ID,
    roundType: 'practice' as const,
    roundDate: new Date().toISOString().slice(0, 10),
    holes: Array.from({ length: HOLE_COUNT }, (_, i) => makeHole(i + 1)),
  };
}

/** Rows standing in for the round the player actually played. If these are
 *  gone at the end of a test, the round was destroyed. */
function existingHoleRows() {
  return Array.from({ length: HOLE_COUNT }, (_, i) => ({
    id: `hole-${i + 1}`,
    round_id: ROUND_ID,
    hole_number: i + 1,
    par: 4,
    score: 4,
    putts: 2,
  }));
}

function existingShotRows() {
  return Array.from({ length: HOLE_COUNT }, (_, i) => ({
    id: `shot-${i + 1}`,
    round_id: ROUND_ID,
    hole_id: `hole-${i + 1}`,
    hole_number: i + 1,
    shot_number: 1,
  }));
}

/**
 * @param committed whether the aborted RPC went on to COMMIT server-side —
 *   the case that actually destroyed a round in production.
 */
function seed(
  committed: boolean,
  rpcError: typeof ABORT_ERROR | typeof DATABASE_ERROR = ABORT_ERROR,
) {
  tables = {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [],
    golf_rounds: [{
      id: ROUND_ID,
      player_id: 'player-1',
      // The round is in progress when the action starts — as it was in
      // production. It only becomes 'completed' if the RPC commits.
      status: 'in_progress',
      draft_data: null,
      total_score: HOLE_COUNT * 4,
    }],
    golf_holes: existingHoleRows(),
    golf_shots: existingShotRows(),
  };
  writes = [];
  const base = createFakeSupabase({
    user: { id: 'u-p1' },
    tables,
    rpc: {
      submit_round_atomic: async () => {
        // The client gave up at its abort deadline. Postgres did not: it ran
        // on and committed. Model that by applying the commit's visible effect
        // BEFORE handing back the abort the caller actually observed.
        if (committed) {
          const round = tables.golf_rounds?.[0];
          if (round) {
            round.status = 'completed';
            round.draft_data = null;
          }
        }
        return { data: null, error: rpcError };
      },
    },
  });

  // Record every DELETE so the test can assert on the ACTION taken, not just
  // on the end state. Asserting end state alone is not enough: the fake's
  // inserts always succeed, so a destructive rebuild that deletes and then
  // re-inserts looks identical to never having deleted at all. In production
  // the re-insert is exactly what timed out, which is why the round was lost.
  fake = {
    ...base,
    from(table: string) {
      const builder = base.from(table);
      return {
        ...builder,
        delete: () => {
          writes.push({ table, op: 'delete' });
          return builder.delete();
        },
      };
    },
  } as unknown as FakeSupabase;
}

function deletesAgainst(table: string): number {
  return writes.filter((w) => w.table === table && w.op === 'delete').length;
}

function holesLeft(): number {
  return (tables.golf_holes ?? []).filter((h) => h.round_id === ROUND_ID).length;
}

function shotsLeft(): number {
  return (tables.golf_shots ?? []).filter((s) => s.round_id === ROUND_ID).length;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('submitGolfRoundComprehensive — abort must not trigger the destructive fallback', () => {
  it('does NOT delete holes/shots when the aborted RPC actually committed', async () => {
    seed(true);

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    // THE ASSERTION THAT MATTERS: the rebuild must never have been attempted.
    // In production these deletes succeeded and the re-inserts then timed out,
    // which is precisely how a player lost 18 holes and 72 shots.
    expect(deletesAgainst('golf_holes')).toBe(0);
    expect(deletesAgainst('golf_shots')).toBe(0);

    expect(holesLeft()).toBe(HOLE_COUNT);
    expect(shotsLeft()).toBe(HOLE_COUNT);

    // The round did commit, so reconciliation should report success rather
    // than telling the player to retry a submit that already landed.
    expect(result.success).toBe(true);
  });

  it('does NOT delete holes/shots when the abort outcome cannot be reconciled', async () => {
    seed(false);

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    // Outcome unknown — the transaction may be mid-commit. Refusing to touch
    // anything is the only safe move: a round needing a retry beats a round
    // that no longer exists.
    expect(deletesAgainst('golf_holes')).toBe(0);
    expect(deletesAgainst('golf_shots')).toBe(0);

    expect(holesLeft()).toBe(HOLE_COUNT);
    expect(shotsLeft()).toBe(HOLE_COUNT);

    expect(result.success).toBe(false);
  });

  it('does NOT delete holes/shots for a database RPC failure', async () => {
    seed(false, DATABASE_ERROR);

    const result = await submitGolfRoundComprehensive(makeRoundInput(), ROUND_ID);

    // A SQLSTATE proves the RPC rolled back, but it does not authorize a
    // second, non-transactional submit implementation. The player must keep
    // the complete saved graph and retry the single protected RPC.
    expect(deletesAgainst('golf_holes')).toBe(0);
    expect(deletesAgainst('golf_shots')).toBe(0);
    expect(holesLeft()).toBe(HOLE_COUNT);
    expect(shotsLeft()).toBe(HOLE_COUNT);
    expect(result.success).toBe(false);
  });
});
