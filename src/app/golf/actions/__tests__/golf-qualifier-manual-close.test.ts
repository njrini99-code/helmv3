/**
 * Qualifier status is coach-owned. A real submitted round may start a
 * qualifier, but neither the calendar date nor every entrant reaching the
 * configured round count may close it. Closing is an explicit coach action.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

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

import { submitGolfRoundComprehensive, updateQualifierStatus } from '../golf';

const COURSE_ID = '11111111-1111-4111-8111-111111111111';
const QUALIFIER_ID = '22222222-2222-4222-8222-222222222222';
const ROUND_ID = '33333333-3333-4333-8333-333333333333';

function input(): Parameters<typeof submitGolfRoundComprehensive>[0] {
  return {
    courseName: 'Qualifier Course',
    courseId: COURSE_ID,
    roundType: 'qualifier' as const,
    roundDate: '2026-08-25',
    qualifierId: QUALIFIER_ID,
    qualifierRoundNumber: 1,
    holes: Array.from({ length: 9 }, (_, index) => ({
      holeNumber: index + 1,
      par: 4,
      yardage: 400,
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
      shots: [{
        shotNumber: 1,
        shotType: 'tee',
        clubType: 'driver',
        lieBefore: 'tee',
        distanceToHoleBefore: 400,
        distanceUnitBefore: 'yards',
        result: 'hole',
        distanceToHoleAfter: 0,
        distanceUnitAfter: 'yards',
        shotDistance: 400,
        isPenalty: false,
      }],
    })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeSupabase({
    user: { id: 'u-player' },
    tables: {
      golf_players: [{ id: 'player-1', user_id: 'u-player' }],
      golf_team_members: [],
      golf_rounds: [{
        id: ROUND_ID,
        player_id: 'player-1',
        status: 'in_progress',
        qualifier_id: QUALIFIER_ID,
        qualifier_round_number: 1,
      }],
      golf_qualifiers: [{ id: QUALIFIER_ID, status: 'upcoming', num_rounds: 1 }],
      golf_qualifier_entries: [{
        id: 'entry-1',
        qualifier_id: QUALIFIER_ID,
        player_id: 'player-1',
        rounds_completed: 1,
      }],
      golf_holes: [],
      golf_shots: [],
    },
    rpc: {
      submit_round_atomic: async () => ({ data: { success: true, warnings: [] }, error: null }),
    },
  });
});

describe('submitGolfRoundComprehensive — manual qualifier closure', () => {
  it('starts an upcoming qualifier but never auto-closes the final configured round', async () => {
    const result = await submitGolfRoundComprehensive(input(), ROUND_ID);

    expect(result).toMatchObject({ success: true });
    const qualifier = await fake
      .from('golf_qualifiers')
      .select('status')
      .eq('id', QUALIFIER_ID)
      .single();
    expect(qualifier.data?.status).toBe('in_progress');
  });

  it('does not claim a manual close succeeded when RLS matched no qualifier row', async () => {
    fake = createFakeSupabase({
      user: { id: 'u-coach' },
      tables: {
        golf_qualifiers: [{ id: QUALIFIER_ID, team_id: 'team-1', status: 'in_progress' }],
        golf_coaches: [{ id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' }],
        golf_teams: [{ id: 'team-1', organization_id: 'org-1' }],
      },
    });

    const originalFrom = fake.from.bind(fake);
    (fake as unknown as {
      from: (table: string) => ReturnType<FakeSupabase['from']>;
    }).from = (table) => {
      const builder = originalFrom(table);
      if (table !== 'golf_qualifiers') return builder;

      return {
        ...builder,
        update: () => ({
          eq: () => ({
            // PostgREST represents an RLS-filtered UPDATE as an empty
            // returned row set with no error. The action must not turn that
            // into a successful manual close.
            select: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      } as unknown as typeof builder;
    };

    await expect(updateQualifierStatus(QUALIFIER_ID, 'completed')).resolves.toEqual({
      success: false,
      error: "Couldn't update this qualifier — it may have been deleted, or you may not have edit access to this team.",
    });
  });
});
