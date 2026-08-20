import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * An assistant coach signing up with the team code lands ON the team, with
 * full access, immediately.
 *
 * WHAT THIS REPLACED
 * ------------------
 * There used to be an approval step: signing up recorded a REQUEST and parked
 * the person on a waiting page until a head coach approved it in Team
 * settings. Removed on the owner's explicit instruction (2026-08-20): "There
 * shouldn't be an approval. The approval is them having the access code, and
 * putting it in when they hit sign up."
 *
 * WHAT ACTUALLY GRANTS ACCESS
 * ---------------------------
 * `golf_team_coach_staff` rows, and nothing else. Both `is_golf_team_coach`
 * and `is_golf_team_head_coach` are EXISTS() over that table and read nothing
 * else — not `golf_coaches.organization_id` — and every coach-side RLS policy
 * routes through one of them. So "did the signup work" is exactly "were those
 * rows written", which is what this file asserts.
 *
 * THE MULTI-TEAM CASE IS NOT AN EDGE CASE
 * ---------------------------------------
 * Shenandoah runs a men's and a women's team under one organization and its
 * head coach is staffed on both. Because the staff table is per-TEAM, an
 * assistant given one team's code and staffed only on that team would silently
 * see half the program. `every team in the program` is the requirement, and it
 * has its own case below.
 */

const NOTIFICATION_TYPES = [
  'profile_view', 'watchlist_add', 'video_view', 'message', 'team_invite',
  'team_join_request', 'team_join_approved', 'event_reminder',
  'dev_plan_assigned', 'team_join', 'team_join_rejected',
] as const;

const TEAM_MENS = '11111111-1111-4111-8111-111111111111';
const TEAM_WOMENS = '33333333-3333-4333-8333-333333333333';
const ORG = '22222222-2222-4222-8222-222222222222';

const fromMock = vi.fn();
const untypedInsert = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: fromMock }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
  logServerEvent: vi.fn(async () => undefined),
  logServerException: vi.fn(async () => undefined),
}));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_n: string, _m: unknown, fn: unknown) => fn,
}));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn() }));
vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn(() => ({ insert: untypedInsert })),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'head-user' } }, error: null })) },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) })),
  })),
}));

const { joinTeamAsAssistantCoach } = await import('../teams');

/** What the admin client was asked to write. */
const writes = {
  coachUpserts: [] as Record<string, unknown>[],
  staffUpserts: [] as Record<string, unknown>[],
};
/** Per-table failure injection. */
const failures = new Map<string, { message: string }>();
/** Teams the org contains, so the multi-team case can vary it. */
let programTeams: Array<{ id: string }>;

beforeEach(() => {
  writes.coachUpserts = [];
  writes.staffUpserts = [];
  failures.clear();
  programTeams = [{ id: TEAM_MENS }, { id: TEAM_WOMENS }];
  untypedInsert.mockClear();
  untypedInsert.mockResolvedValue({ error: null });

  fromMock.mockImplementation((table: string) => {
    if (table === 'golf_teams') {
      return {
        select: () => ({
          // `.eq('join_code', …).maybeSingle()` — resolve the code to a team.
          // `.eq('organization_id', …)` — list every team in the program; it is
          // awaited directly, so the chain node itself must be thenable.
          eq: (column: string) => {
            const node = {
              maybeSingle: async () =>
                failures.has('golf_teams:code')
                  ? { data: null, error: failures.get('golf_teams:code') }
                  : { data: { id: TEAM_MENS, name: "Shenandoah Men's Golf", organization_id: ORG }, error: null },
              then: (res: (v: unknown) => unknown) =>
                Promise.resolve(
                  failures.has('golf_teams:org')
                    ? { data: null, error: failures.get('golf_teams:org') }
                    : { data: programTeams, error: null },
                ).then(res),
            };
            void column;
            return node;
          },
        }),
      };
    }

    if (table === 'golf_coaches') {
      return {
        upsert: (payload: Record<string, unknown>) => {
          writes.coachUpserts.push(payload);
          return {
            select: () => ({
              maybeSingle: async () =>
                failures.has('golf_coaches')
                  ? { data: null, error: failures.get('golf_coaches') }
                  : { data: { id: 'asst-coach' }, error: null },
            }),
          };
        },
      };
    }

    // golf_team_coach_staff — the grant, plus the head-coach lookup for the
    // notification.
    return {
      upsert: async (rows: Record<string, unknown>[]) => {
        writes.staffUpserts.push(...rows);
        return failures.has('golf_team_coach_staff')
          ? { error: failures.get('golf_team_coach_staff') }
          : { error: null };
      },
      select: () => ({
        eq: () => ({
          eq: async () => ({ data: [{ coach_id: 'head-coach', golf_coaches: { user_id: 'head-user' } }], error: null }),
        }),
      }),
    };
  });
});

const join = () => joinTeamAsAssistantCoach('asst-user', 'sph5l4hu', 'Michael Allen', 'ma@su.edu');

describe('joinTeamAsAssistantCoach — access is granted at signup, not later', () => {
  it('writes a staff row, which IS the access', async () => {
    const result = await join();

    expect(result.success).toBe(true);
    // The single assertion that means "it worked". Without this row the coach
    // signs in and every RLS policy returns nothing — the exact experience the
    // approval flow produced while looking successful.
    expect(writes.staffUpserts.length).toBeGreaterThan(0);
    expect(writes.staffUpserts[0]).toMatchObject({ coach_id: 'asst-coach', role: 'assistant_coach' });
  });

  it('staffs EVERY team in the program, not just the one whose code was typed', async () => {
    await join();

    const teamIds = writes.staffUpserts.map((r) => r.team_id).sort();
    // Shenandoah's men's AND women's teams. Staffing only the code's team would
    // hand the assistant half a program and look, from inside the app, like
    // data that had gone missing.
    expect(teamIds).toEqual([TEAM_MENS, TEAM_WOMENS].sort());
  });

  it('marks onboarding complete, so no entry point offers new-program setup', async () => {
    await join();

    // `/golf/coach` inserts a fresh organization and team and re-points
    // organization_id at them. For this account that is the phantom-duplicate
    // program — and when the school name collides, the "An organization named
    // X already exists" dead end an assistant hit on 2026-08-19.
    expect(writes.coachUpserts[0]).toMatchObject({
      organization_id: ORG,
      onboarding_completed: true,
    });
  });

  it('never mints a head coach', async () => {
    await join();
    for (const row of writes.staffUpserts) {
      expect(row.role).toBe('assistant_coach');
      expect(row.role).not.toBe('head_coach');
    }
  });

  it('tells the head coach somebody joined, with a real enum type', async () => {
    await join();

    const rows = untypedInsert.mock.calls.flat().flat() as Record<string, unknown>[];
    const toHead = rows.find((n) => n?.user_id === 'head-user');
    expect(toHead).toBeTruthy();
    expect(String(toHead?.body)).toContain('Michael Allen');
    // `notification_type` is a Postgres ENUM and `fromUntyped` bypasses the
    // generated types at exactly this call, so an invented label compiles,
    // fails at runtime with 22P02, and vanishes into a swallowed catch.
    for (const n of rows) expect(NOTIFICATION_TYPES).toContain(n?.type);
  });
});

describe('joinTeamAsAssistantCoach — failures must not look like success', () => {
  it('REPORTS a failed staff write instead of returning success', async () => {
    failures.set('golf_team_coach_staff', { message: 'deadlock detected' });

    const result = await join();

    // The old flow could afford to swallow this: the row was only a request.
    // Now it is the grant, so swallowing it would hand somebody an account
    // that signs in to an empty app with no error anywhere.
    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/could not add you to the team/i);
  });

  it('refuses cleanly when the code matches no team', async () => {
    failures.set('golf_teams:code', { message: 'not found' });

    const result = await join();

    expect(result.success).toBe(false);
    expect(writes.staffUpserts).toHaveLength(0);
  });

  it('still gets the assistant onto the code’s team when the program list fails', async () => {
    failures.set('golf_teams:org', { message: 'statement timeout' });

    const result = await join();

    // Degrades to partial access rather than none: being on one team beats
    // being on zero while a transient read recovers.
    expect(result.success).toBe(true);
    expect(writes.staffUpserts.map((r) => r.team_id)).toEqual([TEAM_MENS]);
  });

  it('does not fail the signup when only the notification fails', async () => {
    untypedInsert.mockResolvedValue({ error: { message: 'notifications unavailable' } });

    const result = await join();

    // They are on the team; telling the head coach is courtesy, not the grant.
    expect(result.success).toBe(true);
    expect(writes.staffUpserts.length).toBeGreaterThan(0);
  });
});
