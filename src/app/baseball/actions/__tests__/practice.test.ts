// =============================================================================
// src/app/baseball/actions/__tests__/practice.test.ts
//
// Action-level coverage for src/app/baseball/actions/practice.ts. Before this
// file, savePractice / publishPractice / recordPracticeAttendance /
// getPlayerPractices had ZERO action-level tests (only an unrelated
// hub-visibility gating test + one gated e2e render existed) — see
// docs/operations/BASEBALLHELM_FEATURE_READINESS_MATRIX.md:65-66,142.
//
// Mocking approach mirrors dev-plans-coach-gating.test.ts: createFakeSupabase
// for @/lib/supabase/server, a direct mock of getActiveBaseballContext (so
// withBaseballAction's CONTEXT step never touches real cookies), plus the
// demo/sentry/next-cache/server-error-logger stack every withBaseballAction
// call needs.
//
// DEVIATION FROM THE SPEC'S SUGGESTED APPROACH: the spec's risk note suggested
// a bespoke makeChain-stub (documents.test.ts style) for the nested-embed reads
// (getTeamPractices / getPlayerPractices) because createFakeSupabase's model is
// "flat per-table". In practice, createFakeSupabase's QueryBuilder never
// projects columns from `.select(...)` — it returns full stored rows regardless
// of the select string — so a fake `baseball_practices` row can simply carry
// its `blocks` / `attendance` / `event` keys PRE-JOINED (exactly like
// documents.test.ts's `documentSingleRow.versions` inline-embed trick), and the
// action's own `.map` over `p.blocks` / `p.event` / `p.attendance` works
// unmodified. This avoids hand-rolling a second bespoke chain stub for every
// read in this file and keeps one mocking idiom for the whole suite.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

// Mutable per-test active context — coach by default; individual tests swap in
// a player context for the player-facing reads.
let mockContext: {
  userId: string;
  activeTeamId: string;
  activeRole: 'coach' | 'player';
  activeCoachId: string | null;
  activePlayerId: string | null;
  fellBackFromStale: boolean;
} = {
  userId: 'user-1',
  activeTeamId: 'team-1',
  activeRole: 'coach',
  activeCoachId: 'coach-1',
  activePlayerId: null,
  fellBackFromStale: false,
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => mockContext),
}));

vi.mock('@/lib/demo/baseball-config.server', () => ({
  isCurrentSessionBaseballDemo: vi.fn(async () => false),
  isBaseballDemoCoachEmail: vi.fn(() => false),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => undefined),
  logServerError: vi.fn(async () => undefined),
  logServerEvent: vi.fn(async () => undefined),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const attachPracticeToCalendarMock = vi.fn(async (_input: unknown) => ({
  success: true,
  data: { eventId: 'evt-generated' },
}));
vi.mock('@/app/baseball/actions/calendar', () => ({
  attachPracticeToCalendar: (input: unknown) => attachPracticeToCalendarMock(input),
}));

import {
  savePractice,
  publishPractice,
  recordPracticeAttendance,
  getPlayerPractices,
} from '@/app/baseball/actions/practice';

// A full-authority (primary) coach staff row — grants every capability,
// including this file's `can_manage_practice`, without needing to enumerate
// the boolean capability columns individually.
function seedCoachAuthority(teamId = 'team-1', coachId = 'coach-1', userId = 'user-1') {
  return {
    baseball_coaches: [{ id: coachId, user_id: userId, full_name: 'Coach Rini' }],
    baseball_team_coach_staff: [
      { id: 'staff-1', team_id: teamId, coach_id: coachId, is_primary: true, is_head_coach: false, status: 'active' },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  attachPracticeToCalendarMock.mockResolvedValue({ success: true, data: { eventId: 'evt-generated' } });
  mockContext = {
    userId: 'user-1',
    activeTeamId: 'team-1',
    activeRole: 'coach',
    activeCoachId: 'coach-1',
    activePlayerId: null,
    fellBackFromStale: false,
  };
});

// -----------------------------------------------------------------------------
// (1) savePractice — stage-then-swap never deletes before the new insert lands.
// -----------------------------------------------------------------------------

describe('savePractice — stage-then-swap block replacement', () => {
  it('on success, the full old block set is replaced by the new one', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        ...seedCoachAuthority(),
        baseball_practices: [
          { id: 'practice-1', team_id: 'team-1', title: 'Old title', focus: null, status: 'draft' },
        ],
        baseball_practice_blocks: [
          { id: 'old-block-1', team_id: 'team-1', practice_id: 'practice-1', activity: 'Old drill', start_offset_min: 0, duration_min: 10 },
        ],
      },
    });

    const result = await savePractice({
      practiceId: 'practice-1',
      title: 'Updated title',
      blocks: [{ startOffsetMin: 0, durationMin: 20, activity: 'New drill' }],
    });

    expect(result.success).toBe(true);

    const { data } = await fake.from('baseball_practice_blocks').select('*').eq('practice_id', 'practice-1');
    const rows = data as Array<{ id: string; activity: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).not.toBe('old-block-1');
    expect(rows[0]!.activity).toBe('New drill');
  });

  it('when the staged insert of new blocks fails, the old blocks are left untouched (never deleted)', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        ...seedCoachAuthority(),
        baseball_practices: [
          { id: 'practice-1', team_id: 'team-1', title: 'Old title', focus: null, status: 'draft' },
        ],
        baseball_practice_blocks: [
          { id: 'old-block-1', team_id: 'team-1', practice_id: 'practice-1', activity: 'Old drill', start_offset_min: 0, duration_min: 10 },
        ],
      },
    });

    // Force the INSERT of the staged (new) blocks to fail — the stage-then-swap
    // contract requires the old rows to survive when this happens.
    const originalFrom = fake.from.bind(fake);
    fake.from = ((table: string) => {
      const chain = originalFrom(table);
      if (table === 'baseball_practice_blocks') {
        return {
          ...chain,
          insert: () => Promise.resolve({ data: null, error: { message: 'insert failed' } }),
        };
      }
      return chain;
    }) as typeof fake.from;

    const result = await savePractice({
      practiceId: 'practice-1',
      title: 'Updated title',
      blocks: [{ startOffsetMin: 0, durationMin: 20, activity: 'New drill' }],
    });

    expect(result.success).toBe(false);

    // Read through the ORIGINAL (un-overridden) select path to confirm the old
    // block was never deleted.
    const { data } = await originalFrom('baseball_practice_blocks').select('*').eq('practice_id', 'practice-1');
    const rows = data as Array<{ id: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe('old-block-1');
  });

  it('creates a new practice when no practiceId is supplied, then attaches its blocks', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority() },
    });

    const result = await savePractice({
      title: 'Brand new practice',
      blocks: [{ startOffsetMin: 0, durationMin: 30, activity: 'Bullpen' }],
    });

    expect(result.success).toBe(true);
    const practiceId = result.data?.practiceId;
    expect(practiceId).toBeTruthy();

    const { data: blockRows } = await fake
      .from('baseball_practice_blocks')
      .select('*')
      .eq('practice_id', practiceId as string);
    expect((blockRows as unknown[]).length).toBe(1);
  });
});

// -----------------------------------------------------------------------------
// (2) publishPractice — server-side validation gate.
// -----------------------------------------------------------------------------

describe('publishPractice — server-side publish validation', () => {
  it('rejects a plan that fails validatePracticeForPublish and never flips status', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        ...seedCoachAuthority(),
        baseball_practices: [
          { id: 'practice-1', team_id: 'team-1', title: 'Empty plan', status: 'draft', event_id: null },
        ],
        baseball_practice_blocks: [], // no blocks -> 'no_blocks' hard error
      },
    });

    const result = await publishPractice({ practiceId: 'practice-1', publish: true });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Add at least one block before publishing.');

    const { data } = await fake.from('baseball_practices').select('*').eq('id', 'practice-1').single();
    expect((data as { status: string }).status).toBe('draft');
  });

  // -----------------------------------------------------------------------------
  // (3) publish success: calendar attach only when event_id absent + one
  //     notification per rostered player, only on publish (not unpublish).
  // -----------------------------------------------------------------------------

  function seedPublishablePractice(eventId: string | null) {
    return {
      baseball_practices: [
        { id: 'practice-1', team_id: 'team-1', title: 'Game plan', status: 'draft', event_id: eventId },
      ],
      baseball_practice_blocks: [
        { id: 'block-1', team_id: 'team-1', practice_id: 'practice-1', activity: 'Warmup', start_offset_min: 0, duration_min: 15, coach_owner_id: 'coach-1', is_measured: false, measurement_target: null },
      ],
      baseball_team_members: [
        { team_id: 'team-1', player_id: 'player-1', baseball_players: { id: 'player-1', user_id: 'user-A' } },
        { team_id: 'team-1', player_id: 'player-2', baseball_players: { id: 'player-2', user_id: 'user-B' } },
      ],
    };
  }

  it('attaches a calendar event when publishing with no existing event_id, and notifies every rostered player', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority(), ...seedPublishablePractice(null) },
    });

    const result = await publishPractice({
      practiceId: 'practice-1',
      publish: true,
      calendar: { date: '2026-07-20', startTime: '15:00', endTime: '16:00', location: 'Field 2' },
    });

    expect(result.success).toBe(true);
    expect(attachPracticeToCalendarMock).toHaveBeenCalledTimes(1);
    expect(result.data?.eventId).toBe('evt-generated');

    const { data: practiceRow } = await fake.from('baseball_practices').select('*').eq('id', 'practice-1').single();
    expect((practiceRow as { event_id: string | null }).event_id).toBe('evt-generated');

    const { data: notifications } = await fake.from('baseball_notifications').select('*');
    const rows = notifications as Array<{ user_id: string; type: string }>;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.user_id).sort()).toEqual(['user-A', 'user-B']);
    expect(rows.every((r) => r.type === 'practice_published')).toBe(true);
  });

  it('does NOT attach a calendar event when the practice already has one', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority(), ...seedPublishablePractice('evt-existing') },
    });

    const result = await publishPractice({
      practiceId: 'practice-1',
      publish: true,
      calendar: { date: '2026-07-20', startTime: '15:00', endTime: '16:00', location: 'Field 2' },
    });

    expect(result.success).toBe(true);
    expect(attachPracticeToCalendarMock).not.toHaveBeenCalled();

    const { data: practiceRow } = await fake.from('baseball_practices').select('*').eq('id', 'practice-1').single();
    // event_id must remain the pre-existing one, untouched.
    expect((practiceRow as { event_id: string | null }).event_id).toBe('evt-existing');
  });

  it('does NOT insert notifications when unpublishing (publish: false)', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        ...seedCoachAuthority(),
        baseball_practices: [
          { id: 'practice-1', team_id: 'team-1', title: 'Game plan', status: 'published', event_id: 'evt-existing' },
        ],
        baseball_practice_blocks: [],
        baseball_team_members: [
          { team_id: 'team-1', player_id: 'player-1', baseball_players: { id: 'player-1', user_id: 'user-A' } },
        ],
      },
    });

    const result = await publishPractice({ practiceId: 'practice-1', publish: false });

    expect(result.success).toBe(true);
    const { data } = await fake.from('baseball_notifications').select('*');
    expect((data as unknown[]).length).toBe(0);
    expect(attachPracticeToCalendarMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// (4) recordPracticeAttendance — pure UPSERT, never delete-then-reinsert.
// -----------------------------------------------------------------------------

describe('recordPracticeAttendance — idempotent upsert', () => {
  it('upserts on (practice_id, player_id) and never calls .delete() on the attendance table', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        ...seedCoachAuthority(),
        baseball_practice_attendance: [
          { id: 'att-1', team_id: 'team-1', practice_id: 'practice-1', player_id: 'player-1', status: 'present', reason: null },
        ],
      },
    });

    // Guard: fail loudly if recordPracticeAttendance ever calls .delete() on
    // this table — that would be a regression to delete-then-reinsert.
    const originalFrom = fake.from.bind(fake);
    fake.from = ((table: string) => {
      const chain = originalFrom(table);
      if (table === 'baseball_practice_attendance') {
        return {
          ...chain,
          delete: () => {
            throw new Error('recordPracticeAttendance must never call .delete() on baseball_practice_attendance');
          },
        };
      }
      return chain;
    }) as typeof fake.from;

    const result = await recordPracticeAttendance({
      practiceId: 'practice-1',
      entries: [
        { playerId: 'player-1', status: 'limited', reason: 'sore hamstring' }, // update existing
        { playerId: 'player-2', status: 'absent' }, // brand new row
      ],
    });

    expect(result.success).toBe(true);

    const { data } = await originalFrom('baseball_practice_attendance').select('*');
    const rows = data as Array<{ player_id: string; status: string }>;
    expect(rows).toHaveLength(2);
    const byPlayer = Object.fromEntries(rows.map((r) => [r.player_id, r.status]));
    expect(byPlayer['player-1']).toBe('limited'); // updated in place, not duplicated
    expect(byPlayer['player-2']).toBe('absent');
  });

  it('is a no-op success when given zero entries', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { ...seedCoachAuthority() },
    });

    const result = await recordPracticeAttendance({ practiceId: 'practice-1', entries: [] });
    expect(result.success).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// (5) getPlayerPractices — visibility filtering + anchor-dependent class
//     conflict detection.
// -----------------------------------------------------------------------------

describe('getPlayerPractices — block visibility + class conflicts', () => {
  beforeEach(() => {
    mockContext = {
      userId: 'user-1',
      activeTeamId: 'team-1',
      activeRole: 'player',
      activeCoachId: null,
      activePlayerId: 'player-1',
      fellBackFromStale: false,
    };
  });

  it('excludes staff_only and restricted blocks from the player view (allow-list, not deny-list)', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_practices: [
          {
            id: 'practice-1',
            team_id: 'team-1',
            title: 'Tuesday plan',
            focus: null,
            status: 'published',
            event_id: null,
            published_at: '2026-07-10T00:00:00.000Z',
            created_at: '2026-07-10T00:00:00.000Z',
            event: null,
            attendance: [],
            blocks: [
              { id: 'blk-visible', start_offset_min: 0, duration_min: 20, activity: 'Hitting', description: null, location: null, station_type: null, group_label: null, equipment: null, is_measured: false, coach_owner_id: null, visibility: 'player_visible', coach_owner: null },
              { id: 'blk-staff', start_offset_min: 20, duration_min: 20, activity: 'Staff huddle', description: null, location: null, station_type: null, group_label: null, equipment: null, is_measured: false, coach_owner_id: null, visibility: 'staff_only', coach_owner: null },
              { id: 'blk-restricted', start_offset_min: 40, duration_min: 20, activity: 'Discipline talk', description: null, location: null, station_type: null, group_label: null, equipment: null, is_measured: false, coach_owner_id: null, visibility: 'restricted', coach_owner: null },
            ],
          },
        ],
      },
    });

    const result = await getPlayerPractices();
    expect(result.success).toBe(true);
    const views = result.data ?? [];
    expect(views).toHaveLength(1);
    const blockIds = views[0]!.blocks.map((b) => b.id);
    expect(blockIds).toEqual(['blk-visible']);
  });

  it('flags a class conflict only when BOTH the practice wall-clock start AND the class times are known', async () => {
    // Non-Z timestamp so isoToClock's local-time read matches the literal
    // HH:mm written here regardless of the CI machine's timezone.
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_practices: [
          {
            id: 'practice-with-conflict',
            team_id: 'team-1',
            title: 'Conflict plan',
            focus: null,
            status: 'published',
            event_id: 'evt-1',
            published_at: '2026-07-10T00:00:00',
            created_at: '2026-07-10T00:00:00',
            event: { start_time: '2026-07-14T08:00:00', end_time: '2026-07-14T09:00:00', location: 'Field 1' },
            attendance: [],
            blocks: [
              { id: 'blk-conflict', start_offset_min: 0, duration_min: 60, activity: 'Hitting', description: null, location: null, station_type: null, group_label: null, equipment: null, is_measured: false, coach_owner_id: null, visibility: 'player_visible', coach_owner: null },
            ],
          },
        ],
        baseball_player_classes: [
          { id: 'class-1', team_id: 'team-1', player_id: 'player-1', class_name: 'Chemistry', days: ['Tue'], start_time: '08:30', end_time: '09:15' },
        ],
      },
    });

    const result = await getPlayerPractices();
    const view = (result.data ?? []).find((v) => v.id === 'practice-with-conflict');
    expect(view).toBeDefined();
    expect(view!.blocks[0]!.hasClassConflict).toBe(true);
    expect(view!.blocks[0]!.conflictingClasses).toEqual(['Chemistry']);
  });

  it('does NOT flag a conflict when the practice has no linked calendar event (no wall-clock anchor)', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_practices: [
          {
            id: 'practice-no-event',
            team_id: 'team-1',
            title: 'Unanchored plan',
            focus: null,
            status: 'published',
            event_id: null,
            published_at: '2026-07-10T00:00:00',
            created_at: '2026-07-10T00:00:00',
            event: null, // no linked calendar event -> no wall-clock start time
            attendance: [],
            blocks: [
              { id: 'blk-unanchored', start_offset_min: 0, duration_min: 60, activity: 'Hitting', description: null, location: null, station_type: null, group_label: null, equipment: null, is_measured: false, coach_owner_id: null, visibility: 'player_visible', coach_owner: null },
            ],
          },
        ],
        baseball_player_classes: [
          { id: 'class-1', team_id: 'team-1', player_id: 'player-1', class_name: 'Chemistry', days: ['Tue'], start_time: '08:30', end_time: '09:15' },
        ],
      },
    });

    const result = await getPlayerPractices();
    const view = (result.data ?? []).find((v) => v.id === 'practice-no-event');
    expect(view).toBeDefined();
    expect(view!.blocks[0]!.hasClassConflict).toBe(false);
    expect(view!.blocks[0]!.conflictingClasses).toEqual([]);
  });

  it('does NOT flag a conflict when the class has no start_time/end_time on record (unknown class anchor)', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_practices: [
          {
            id: 'practice-partial-class',
            team_id: 'team-1',
            title: 'Anchored plan, unknown class time',
            focus: null,
            status: 'published',
            event_id: 'evt-1',
            published_at: '2026-07-10T00:00:00',
            created_at: '2026-07-10T00:00:00',
            event: { start_time: '2026-07-14T08:00:00', end_time: '2026-07-14T09:00:00', location: 'Field 1' },
            attendance: [],
            blocks: [
              { id: 'blk-known-start', start_offset_min: 0, duration_min: 60, activity: 'Hitting', description: null, location: null, station_type: null, group_label: null, equipment: null, is_measured: false, coach_owner_id: null, visibility: 'player_visible', coach_owner: null },
            ],
          },
        ],
        baseball_player_classes: [
          { id: 'class-1', team_id: 'team-1', player_id: 'player-1', class_name: 'Chemistry', days: ['Tue'], start_time: null, end_time: null },
        ],
      },
    });

    const result = await getPlayerPractices();
    const view = (result.data ?? []).find((v) => v.id === 'practice-partial-class');
    expect(view).toBeDefined();
    expect(view!.blocks[0]!.hasClassConflict).toBe(false);
  });
});
