// =============================================================================
// src/app/lifting/actions/__tests__/weight-checkins.test.ts
//
// GUARD (fix-backlog regression tests):
//
// 1. materializeWeightCheckInRequests called `.insert(chunk, { count: 'exact',
//    ignoreDuplicates: true })`. `ignoreDuplicates` is only honored by
//    `.upsert()` — passing it to `.insert()` is silently dropped (no Prefer/
//    on_conflict header), so a re-materialize of an overlapping window hits
//    the real unique constraint (uq_helm_lifting_weight_request on
//    (schedule_id, athlete_id, due_date)) and throws 23505, aborting the
//    whole chunk. Fixed to `.upsert(chunk, { onConflict:
//    'schedule_id,athlete_id,due_date', ignoreDuplicates: true })`, matching
//    the correctly-written soreness sibling.
//
// 2. Nothing ever transitioned a 'pending' weight check-in request to
//    'missed' once its due_date passed — the Missed compliance tile and the
//    Rule 6 overuse flag could never fire. Fixed via a sweep run at the top
//    of getCoachWeightDashboard.
//
// 3. getCoachWeightDashboard's request query used `.limit(1000)`, which caps
//    the requested page size but never raises PostgREST's server-side
//    max-rows ceiling — a single unpaginated call silently truncates once an
//    org's daily due-count crosses 1000. Fixed via fetchAllRowsResult
//    (.order('id').range() loop), matching the codebase's documented golf
//    PostgREST-cap pattern.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

interface FinalResult {
  data: unknown;
  error: unknown;
  count?: number | null;
}

function makeQueryBuilder(finalResult: FinalResult) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {};
  const passthrough = ['select', 'eq', 'order', 'limit', 'in', 'gte', 'lte', 'lt', 'or', 'is'];
  for (const m of passthrough) {
    builder[m] = vi.fn(() => builder);
  }
  // `.range()` terminates a fetchAllRowsResult page — default single-page
  // behavior returns the fixed finalResult; the pagination test below
  // overrides this per-table with a from/to-aware handler.
  builder.range = vi.fn(() => ({ then: (resolve: (v: FinalResult) => void) => resolve(finalResult) }));
  builder.upsertArgs = null as [unknown, unknown] | null;
  builder.upsert = vi.fn((payload: unknown, opts: unknown) => {
    builder.upsertArgs = [payload, opts];
    return builder;
  });
  builder.insertArgs = null as unknown;
  builder.insert = vi.fn((payload: unknown, opts?: unknown) => {
    builder.insertArgs = [payload, opts];
    return builder;
  });
  builder.updateArgs = null as unknown;
  builder.update = vi.fn((patch: unknown) => {
    builder.updateArgs = patch;
    return builder;
  });
  builder.single = vi.fn(async () => finalResult);
  builder.maybeSingle = vi.fn(async () => finalResult);
  builder.then = (resolve: (v: FinalResult) => void) => resolve(finalResult);
  return builder;
}

const SCHEDULE_ID = '11111111-1111-4111-8111-111111111111';
const ATHLETE_ID = '22222222-2222-4222-8222-222222222222';
const ORG_ID = '33333333-3333-4333-8333-333333333333';

let tableBuilders: Record<string, ReturnType<typeof makeQueryBuilder>>;

function resetTables() {
  tableBuilders = {
    helm_lifting_weight_checkin_schedules: makeQueryBuilder({
      data: {
        id: SCHEDULE_ID,
        organization_id: ORG_ID,
        sport: 'baseball',
        team_id: null,
        assignment_type: 'athlete',
        group_id: null,
        athlete_id: ATHLETE_ID,
        frequency_type: 'once',
        days_of_week: null,
        start_date: '2026-07-04',
        end_date: null,
        status: 'published',
      },
      error: null,
    }),
    helm_lifting_weight_checkin_requests: makeQueryBuilder({ data: [], error: null, count: 0 }),
    helm_lifting_athletes: makeQueryBuilder({ data: [], error: null }),
    helm_lifting_bodyweight_entries: makeQueryBuilder({ data: [], error: null }),
  };
}
resetTables();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));

vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn((_client: unknown, table: string) => tableBuilders[table]),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/lifting/with-lifting-action', () => ({
  withLiftingAction:
    (_name: string, _opts: unknown, fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) => {
      const ctx = {
        user: { id: 'user-1' },
        orgId: ORG_ID,
        access: { isCoach: true, canEdit: true, canView: true, coachRow: { id: 'coach-1' } },
      };
      return fn(ctx, ...args);
    },
  LiftingActionError: class LiftingActionError extends Error {},
}));

import { materializeWeightCheckInRequests, getCoachWeightDashboard } from '@/app/lifting/actions/weight-checkins';

describe('materializeWeightCheckInRequests upsert target', () => {
  beforeEach(() => {
    resetTables();
    vi.clearAllMocks();
    resetTables();
  });

  it('upserts (not inserts) on the real 3-column constraint, with ignoreDuplicates honored', async () => {
    const res = await materializeWeightCheckInRequests({
      orgId: ORG_ID,
      scheduleId: SCHEDULE_ID,
      fromDate: '2026-07-04',
      toDate: '2026-07-04',
    });

    expect(res.success).toBe(true);
    const requestsBuilder = tableBuilders.helm_lifting_weight_checkin_requests;
    // CRITICAL: must call .upsert(), never the old .insert() (which silently
    // drops ignoreDuplicates and throws 23505 on any overlapping re-run).
    expect(requestsBuilder.insert).not.toHaveBeenCalled();
    expect(requestsBuilder.upsert).toHaveBeenCalledTimes(1);
    const [, opts] = requestsBuilder.upsertArgs as [unknown, { onConflict?: string; ignoreDuplicates?: boolean }];
    expect(opts).toMatchObject({
      onConflict: 'schedule_id,athlete_id,due_date',
      ignoreDuplicates: true,
    });
  });
});

describe('getCoachWeightDashboard overdue sweep', () => {
  beforeEach(() => {
    resetTables();
    vi.clearAllMocks();
    resetTables();
  });

  it('flips overdue pending requests to missed before reading dashboard counts', async () => {
    await getCoachWeightDashboard({ orgId: ORG_ID, date: '2026-07-04' });

    const requestsBuilder = tableBuilders.helm_lifting_weight_checkin_requests;
    // The sweep issues an .update({ status: 'missed', ... }) scoped to
    // status='pending' AND due_date < today, before the main read.
    const missedUpdateCall = requestsBuilder.update.mock.calls.find(
      ([patch]: [{ status?: string }]) => patch?.status === 'missed',
    );
    expect(missedUpdateCall).toBeDefined();
    expect(requestsBuilder.eq).toHaveBeenCalledWith('status', 'pending');
    expect(requestsBuilder.lt).toHaveBeenCalledWith('due_date', expect.any(String));
  });
});

describe('getCoachWeightDashboard pagination past the PostgREST 1000-row cap', () => {
  beforeEach(() => {
    resetTables();
    vi.clearAllMocks();
    resetTables();
  });

  it('paginates via .range() and aggregates more than 1000 rows instead of truncating at .limit(1000)', async () => {
    const DATE = '2026-07-04';
    // 1001 total rows for the requested date: page 1 returns exactly 1000
    // (the old .limit(1000) ceiling), page 2 returns 1 more. A regression
    // back to a bare `.limit(1000)` would only ever see the first 1000.
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      id: `req-${i}`,
      athlete_id: ATHLETE_ID,
      due_date: DATE,
      status: 'completed',
      bodyweight_entry_id: null,
      completed_at: null,
      schedule_id: null,
      organization_id: ORG_ID,
    }));
    const page2 = [
      {
        id: 'req-1000',
        athlete_id: ATHLETE_ID,
        due_date: DATE,
        status: 'completed',
        bodyweight_entry_id: null,
        completed_at: null,
        schedule_id: null,
        organization_id: ORG_ID,
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const requestsBuilder: any = makeQueryBuilder({ data: [], error: null });
    const rangeMock = vi.fn((from: number, _to: number) => {
      const page = from === 0 ? page1 : from === 1000 ? page2 : [];
      return { then: (resolve: (v: FinalResult) => void) => resolve({ data: page, error: null }) };
    });
    requestsBuilder.range = rangeMock;
    tableBuilders.helm_lifting_weight_checkin_requests = requestsBuilder;
    tableBuilders.helm_lifting_athletes = makeQueryBuilder({
      data: [{ id: ATHLETE_ID, first_name: 'Test', last_name: 'Athlete', sport: 'baseball' }],
      error: null,
    });

    const dashboard = await getCoachWeightDashboard({ orgId: ORG_ID, date: DATE });

    // Two pages fetched (from=0 and from=1000) — proves the range loop ran
    // past a single 1000-row page.
    expect(rangeMock).toHaveBeenCalledWith(0, 999);
    expect(rangeMock).toHaveBeenCalledWith(1000, 1999);
    expect(dashboard.totals.completed).toBe(1001);
  });
});

/**
 * The coach weight-check-in board reads today's requests, and that read
 * discarded its error.
 *
 * A failure left `requests` null, the `if (!requests || requests.length === 0)`
 * guard fired, and the board returned all-zero totals — completed 0, pending 0,
 * missed 0, excused 0, every list empty. A coach opening the compliance screen
 * therefore saw "nothing outstanding" when the read had simply failed and any
 * number of athletes might not have weighed in.
 *
 * That is the same confident-wrong-answer shape as the golf leak maps rendering
 * a clean scorecard: the honest zero and the unreadable one were the same
 * screen.
 *
 * withLiftingAction already captures an unexpected throw to admin_events with a
 * fingerprint and rethrows a sanitized LiftingActionError, so raising here
 * routes the failure somewhere honest rather than inventing a new channel.
 */
// dashboardSchema requires a uuid orgId (the file's existing ORG_ID); without
// it Zod throws and every assertion below passes or fails for a reason
// unrelated to the read under test.
describe('getCoachWeightDashboard — a failed request read is not an empty board', () => {
  beforeEach(() => {
    resetTables();
    vi.clearAllMocks();
    resetTables();
  });

  it('does not report an all-clear board when the request read failed', async () => {
    const requestsBuilder = tableBuilders.helm_lifting_weight_checkin_requests;
    requestsBuilder.range = vi.fn(() => ({
      then: (resolve: (v: FinalResult) => void) =>
        resolve({ data: null, error: { message: 'statement timeout', code: '57014' }, count: 0 }),
    }));

    await expect(
      getCoachWeightDashboard({ orgId: ORG_ID, date: '2026-08-09' } as never),
    ).rejects.toThrow();
  });

  it('still reports an honest empty board when nobody is due today', async () => {
    // data: [] with no error — a real answer, and the board legitimately shows
    // zeros for it.
    const board = await getCoachWeightDashboard({ orgId: ORG_ID, date: '2026-08-09' } as never);

    expect(board.totals).toEqual({ completed: 0, pending: 0, missed: 0, excused: 0 });
  });
});

