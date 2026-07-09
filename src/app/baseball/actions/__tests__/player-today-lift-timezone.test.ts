// =============================================================================
// getPlayerLiftTodaySummary — team-local "today" regression.
//
// Before the fix, `today` was derived from server-UTC (`new Date().toISOString()
// .slice(0, 10)`), while the player Today feed (player-today.ts:534) and the
// readiness gate both use `todayIsoInTz(resolveTeamTimezone(...))` — the
// TEAM-LOCAL calendar day. A West Coast team checking a late-evening instant
// that has already rolled to the next UTC day would filter
// scheduled_date/checkin_date against the wrong (UTC) day, silently dropping
// today's real session/check-in row (or showing tomorrow's).
//
// This test pins a real evening-US instant (9pm PT, already past midnight UTC
// — same instant used by readiness/__tests__/page.test.tsx) and asserts the
// action resolves sessions/checkin keyed off the SAME team-local date the
// rest of the Today surface uses, by exercising the REAL (unmocked)
// contract-day helpers — only the Supabase rows are faked.
// =============================================================================

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(...args),
}));

// Deliberately NOT mocking '@/lib/baseball/daily-contract/contract-day' —
// this test exercises the REAL todayIsoInTz/resolveTeamTimezone so it fails
// if the action ever regresses to a server-UTC slice.
import { todayIsoInTz } from '@/lib/baseball/daily-contract/contract-day';
import { getPlayerLiftTodaySummary } from '@/app/baseball/actions/player-today-lift';

const TEAM_ID = 'team-1';
const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const PLAYER_ID = 'player-1';
const ATHLETE_ID = 'athlete-1';

interface Ctx {
  user: { id: string };
  activeTeamId: string;
}

const ctx: Ctx = { user: { id: USER_ID }, activeTeamId: TEAM_ID };

const summary = getPlayerLiftTodaySummary as unknown as (
  ctx: Ctx,
) => Promise<{
  success: boolean;
  error?: string;
  sessions: Array<{ id: string; scheduled_date: string | null }>;
  checkin: { id: string; check_date: string } | null;
}>;

function baseTables(teamLocalToday: string, wrongUtcToday: string) {
  return {
    baseball_teams: [{ id: TEAM_ID, organization_id: ORG_ID, timezone: 'America/Los_Angeles' }],
    baseball_players: [{ id: PLAYER_ID, user_id: USER_ID }],
    helm_lifting_athletes: [
      { id: ATHLETE_ID, organization_id: ORG_ID, sport: 'baseball', sport_player_id: PLAYER_ID },
    ],
    helm_lifting_sessions: [
      // Correct team-local "today" — must be returned.
      {
        id: 'session-today',
        title: 'Today lift',
        scheduled_date: teamLocalToday,
        status: 'assigned',
        day_type: null,
        sport_context: null,
        estimated_minutes: 45,
        team_id: TEAM_ID,
        athlete_id: ATHLETE_ID,
        program_assignment_id: null,
        organization_id: ORG_ID,
        sport: 'baseball',
        started_at: null,
        completed_at: null,
        readiness_checkin_id: null,
        coach_review_status: null,
        player_note: null,
        coach_note: null,
        legacy_baseball_id: null,
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
      },
      // The pre-fix server-UTC "today" — must NOT be the only row matched
      // (would only surface here if the code mis-dated to the UTC day).
      {
        id: 'session-wrong-utc-day',
        title: 'Next day lift (server-UTC artifact)',
        scheduled_date: wrongUtcToday,
        status: 'assigned',
        day_type: null,
        sport_context: null,
        estimated_minutes: 45,
        team_id: TEAM_ID,
        athlete_id: ATHLETE_ID,
        program_assignment_id: null,
        organization_id: ORG_ID,
        sport: 'baseball',
        started_at: null,
        completed_at: null,
        readiness_checkin_id: null,
        coach_review_status: null,
        player_note: null,
        coach_note: null,
        legacy_baseball_id: null,
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
      },
    ],
    helm_lifting_readiness_checkins: [
      {
        id: 'checkin-today',
        checkin_date: teamLocalToday,
        sleep_quality: 4,
        energy_level: 4,
        soreness_overall: 2,
        notes: null,
        athlete_id: ATHLETE_ID,
        organization_id: ORG_ID,
        sport: 'baseball',
        stress_level: null,
        lower_body_status: null,
        illness_flag: false,
        mood: null,
        readiness_score: null,
        readiness_band: null,
        lift_session_id: null,
        visibility: 'staff_only',
        legacy_baseball_id: null,
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
      },
    ],
  };
}

describe('getPlayerLiftTodaySummary — team-local today (evening US timestamp)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('filters sessions/checkin against the team-local date, not the server UTC date, for a 9pm PT instant', async () => {
    // 2026-06-24T04:00:00Z is 2026-06-23 21:00 PDT (UTC-7) — 9pm Pacific,
    // already the NEXT day in UTC. The pre-fix `new Date().toISOString()
    // .slice(0,10)` would resolve '2026-06-24'; team-local must be '2026-06-23'.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T04:00:00Z'));

    const teamLocalToday = todayIsoInTz('America/Los_Angeles', new Date());
    expect(teamLocalToday).toBe('2026-06-23');
    const wrongUtcToday = '2026-06-24';

    const tables = baseTables(teamLocalToday, wrongUtcToday);
    fake = createFakeSupabase({ user: { id: USER_ID }, tables });

    const result = await summary(ctx);

    expect(result.success).toBe(true);

    // The team-local-dated session is present...
    const ids = result.sessions.map((s) => s.id);
    expect(ids).toContain('session-today');
    // ...but the server-UTC-dated session is NOT (it's neither "open through
    // today" for the team-local day, nor equal to it) — proves the query
    // used the team-local day, not server UTC.
    expect(ids).not.toContain('session-wrong-utc-day');

    expect(result.checkin?.id).toBe('checkin-today');
    expect(result.checkin?.check_date).toBe(teamLocalToday);
    expect(result.checkin?.check_date).not.toBe(wrongUtcToday);
  });
});
