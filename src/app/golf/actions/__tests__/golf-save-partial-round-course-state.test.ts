/**
 * Regression: a fresh round at a course whose library `state` is a full
 * region name ("Ontario") must start.
 *
 * 2026-09-16 incident (UNCW, Canadian Collegiate at Oviinbyrd GC): both round
 * schemas capped `courseState` at 2 characters while the course library
 * stores free text and the tee picker copies it into the round verbatim.
 * The first save of a new round carries no holes, so the validation failure
 * was "unsalvageable" and `savePartialRound` returned a bare `retry` — the
 * start button just bounced the player back to setup, which they described
 * as "it lets them pick the course but resets when they start the round".
 *
 * Note: validation runs before auth, so the production error logs carried no
 * user id — that is why this test asserts on the action's result rather than
 * on the logger.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: ReturnType<typeof createFakeSupabase>;
let adminFake: ReturnType<typeof createFakeSupabase>;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => adminFake),
}));
vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    void fn();
  },
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
}));
vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  triggerPostRoundAnalysis: vi.fn(async () => undefined),
}));
vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidatePlayerStats: vi.fn(async () => undefined),
  invalidateTeamStats: vi.fn(async () => undefined),
}));
vi.mock('@/lib/admin-logger', () => ({
  logAdminEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async () => undefined),
  notifyCoaches: vi.fn(async () => undefined),
}));
vi.mock('@/lib/notifications/email', () => ({
  sendEmail: vi.fn(async () => undefined),
}));
vi.mock('@/lib/notifications/push', () => ({
  sendPushNotification: vi.fn(async () => undefined),
}));

import { savePartialRound } from '../golf';

const OVIINBYRD = '13d2c110-bee4-496e-b390-e523a4bd0fbb';

type Row = Record<string, unknown>;

function baseTables(): { golf_players: Row[]; golf_team_members: Row[]; golf_rounds: Row[] } {
  return {
    golf_players: [{ id: 'player-1', user_id: 'u-p1' }],
    golf_team_members: [
      { id: 'm-1', team_id: 'team-1', player_id: 'player-1', status: 'active' },
    ],
    golf_rounds: [],
  };
}

function seedAs(userId: string, tables: ReturnType<typeof baseTables>) {
  fake = createFakeSupabase({
    user: { id: userId },
    tables,
    rpc: {
      save_partial_round_atomic: async () => ({
        data: { success: true, updated_at: '2026-09-13T14:00:00Z' },
        error: null,
      }),
    },
  });
  adminFake = fake;
}

function freshTournamentRound(courseState: string) {
  return {
    courseName: 'Oviinbyrd Golf Club',
    courseCity: 'Port Carling',
    courseState,
    courseId: OVIINBYRD,
    roundType: 'tournament' as const,
    roundDate: '2026-09-13',
    currentHole: 1,
    holesToPlay: 18 as const,
    holes: [],
  };
}

describe('savePartialRound — course state length', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts a fresh round when the library state is a full province name', async () => {
    const tables = baseTables();
    seedAs('u-p1', tables);

    const result = await savePartialRound(freshTournamentRound('Ontario'));

    expect(result).not.toMatchObject({ success: false, error: 'retry' });
    expect(result.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(1);
    expect(tables.golf_rounds[0]?.course_state).toBe('Ontario');
  });

  it('still starts a fresh round with a 2-letter state', async () => {
    const tables = baseTables();
    seedAs('u-p1', tables);

    const result = await savePartialRound(freshTournamentRound('ON'));

    expect(result.success).toBe(true);
    expect(tables.golf_rounds).toHaveLength(1);
    expect(tables.golf_rounds[0]?.course_state).toBe('ON');
  });
});
