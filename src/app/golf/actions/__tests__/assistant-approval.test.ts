import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * The REAL members of the `notification_type` Postgres enum, read from
 * production 2026-08-20.
 *
 * These notification rows go in through `fromUntyped`, which is precisely the
 * call that opts out of the generated types — so an invented label like
 * `'assistant_coach_request'` compiles cleanly, fails at runtime with 22P02,
 * and is then swallowed by the deliberately fire-and-forget error logging.
 * The head coach is never told, which is indistinguishable from the bug the
 * notification was added to fix. Nothing else in the stack catches this, so
 * the check lives here.
 */
const NOTIFICATION_TYPES = [
  'profile_view',
  'watchlist_add',
  'video_view',
  'message',
  'team_invite',
  'team_join_request',
  'team_join_approved',
  'event_reminder',
  'dev_plan_assigned',
  'team_join',
  'team_join_rejected',
] as const;

/**
 * Approving an assistant coach must actually finish the job.
 *
 * `createPendingAssistantCoach` writes `onboarding_completed: false` — correct,
 * because the waiting page is their onboarding. `approvePendingAssistantCoach`
 * then inserted the staff row and stopped.
 *
 * That left the flag false forever, and five separate entry points read
 * `!onboarding_completed` and routed the account to '/golf/coach' — NEW-PROGRAM
 * onboarding, which creates an organization and a team and overwrites
 * `golf_coaches.organization_id`. So a head coach approving an assistant sent
 * that assistant, on their very next login, into a form that detached them from
 * the program that had just accepted them. Being approved was worse than being
 * ignored, and nothing failed anywhere.
 *
 * Two assertions carry this file:
 *   1. approval clears the flag;
 *   2. approval tells the assistant, and the REQUEST tells the head coach.
 *      A request nobody is told about is functionally a request never made —
 *      which is the other half of what "it didn't work" meant.
 */

const fromMock = vi.fn();
// `error` is widened to the Supabase-ish shape rather than inferred as `null`,
// so the failure case below can mock a real error without TS narrowing the mock
// to only ever succeed.
const untypedInsert = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'head-user' } }, error: null })) },
    from: vi.fn((table: string) => {
      if (table === 'golf_coaches') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'head-coach', organization_id: ORG },
                error: null,
              }),
            }),
          }),
        };
      }
      // golf_team_coach_staff — the head-coach gate
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => ({ data: { id: 'staff-head' }, error: null }) }),
            }),
          }),
        }),
      };
    }),
  })),
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

const TEAM = '11111111-1111-4111-8111-111111111111';
const ORG = '22222222-2222-4222-8222-222222222222';

import { approvePendingAssistantCoach, createPendingAssistantCoach } from '../teams';

/** What the admin client was asked to write, so the test can assert on it. */
const writes = {
  coachUpdates: [] as Record<string, unknown>[],
  staffUpserts: [] as Record<string, unknown>[],
  coachUpserts: [] as Record<string, unknown>[],
};

beforeEach(() => {
  writes.coachUpdates = [];
  writes.staffUpserts = [];
  writes.coachUpserts = [];
  untypedInsert.mockClear();
  untypedInsert.mockResolvedValue({ error: null });

  fromMock.mockImplementation((table: string) => {
    if (table === 'golf_coaches') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: 'asst-coach', organization_id: ORG, user_id: 'asst-user' },
              error: null,
            }),
          }),
        }),
        update: (payload: Record<string, unknown>) => {
          writes.coachUpdates.push(payload);
          return { eq: async () => ({ error: null }) };
        },
        upsert: (payload: Record<string, unknown>) => {
          writes.coachUpserts.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    }
    if (table === 'golf_team_coach_staff') {
      return {
        upsert: (payload: Record<string, unknown>) => {
          writes.staffUpserts.push(payload);
          return Promise.resolve({ error: null });
        },
        select: () => ({
          eq: () => ({
            eq: async () => ({
              data: [{ coach_id: 'head-coach', golf_coaches: { user_id: 'head-user' } }],
              error: null,
            }),
          }),
        }),
      };
    }
    if (table === 'golf_teams') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { id: TEAM, name: 'Guilford', organization_id: ORG },
              error: null,
            }),
          }),
        }),
      };
    }
    return {};
  });
});

describe('approvePendingAssistantCoach', () => {
  it('grants the staff row AND clears onboarding_completed', async () => {
    const result = await approvePendingAssistantCoach('asst-coach', TEAM);

    expect(result.success).toBe(true);
    expect(writes.staffUpserts[0]).toMatchObject({
      team_id: TEAM,
      coach_id: 'asst-coach',
      role: 'assistant_coach',
    });
    // Without this the approved assistant is routed into new-program
    // onboarding on their next login and detached from this very team.
    expect(writes.coachUpdates).toContainEqual({ onboarding_completed: true });
  });

  it('never mints a head coach', async () => {
    await approvePendingAssistantCoach('asst-coach', TEAM);
    expect(writes.staffUpserts[0]?.role).toBe('assistant_coach');
    expect(writes.staffUpserts[0]?.role).not.toBe('head_coach');
  });

  it('tells the assistant they are in', async () => {
    await approvePendingAssistantCoach('asst-coach', TEAM);
    const notified = untypedInsert.mock.calls.flat() as Record<string, unknown>[];
    expect(notified.some((n) => n?.user_id === 'asst-user')).toBe(true);

    // ...and with a type Postgres will actually accept. See NOTIFICATION_TYPES.
    for (const n of notified) {
      expect(NOTIFICATION_TYPES).toContain(n?.type);
    }
  });

  it('still reports success when the flag write fails — the grant already landed', async () => {
    // Refusing here would leave access granted and the caller told it was
    // refused, which is the worse of the two outcomes.
    fromMock.mockImplementation((table: string) => {
      if (table === 'golf_coaches') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'asst-coach', organization_id: ORG, user_id: 'asst-user' },
                error: null,
              }),
            }),
          }),
          update: () => ({ eq: async () => ({ error: { message: 'write failed' } }) }),
        };
      }
      if (table === 'golf_team_coach_staff') {
        return { upsert: async () => ({ error: null }) };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    });

    const result = await approvePendingAssistantCoach('asst-coach', TEAM);
    expect(result.success).toBe(true);
  });
});

describe('createPendingAssistantCoach', () => {
  it('records the request AND notifies the head coach', async () => {
    const result = await createPendingAssistantCoach(
      'asst-user',
      'K7PQX4MN',
      'Ben Potter',
      'ben@guilford.edu',
    );

    expect(result.success).toBe(true);
    // Bound to the program the CODE resolves to, and deliberately not onboarded
    // — the waiting page is their onboarding until a head coach acts.
    expect(writes.coachUpserts[0]).toMatchObject({
      user_id: 'asst-user',
      organization_id: ORG,
      onboarding_completed: false,
    });

    // The half that did not exist. Every other join path in teams.ts notifies;
    // this one wrote the row and told nobody, so the head coach had no way to
    // know a request was waiting short of opening Team settings on a hunch.
    const notified = untypedInsert.mock.calls.flat() as Record<string, unknown>[][];
    const rows = notified.flat();
    const toHead = rows.find((n) => n?.user_id === 'head-user');
    expect(toHead).toBeTruthy();
    expect(String(toHead?.body)).toContain('Guilford');
    expect(toHead?.action_url).toBe('/golf/dashboard/team');

    // The type must be a REAL enum member. An invented `assistant_coach_request`
    // type-checks, then fails 22P02 at runtime into a swallowed log — leaving
    // the head coach un-notified, which is exactly the bug this row fixes.
    for (const n of rows) {
      expect(NOTIFICATION_TYPES).toContain(n?.type);
    }
  });

  it('does not fail the request when the notification fails', async () => {
    // The account has already been created by the time this runs; failing now
    // would strand somebody with credentials and no program.
    untypedInsert.mockResolvedValue({ error: { message: 'notifications unavailable' } });
    const result = await createPendingAssistantCoach('asst-user', 'K7PQX4MN', 'Ben', 'ben@x.edu');
    expect(result.success).toBe(true);
  });
});
