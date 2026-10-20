import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

/**
 * Fairway Calendar (server payload): a player sees a meeting only when they are
 * invited to it (their own golf_event_attendance row). golf_events_select_team
 * hands a player every team meeting until migration 20261018120000 is applied,
 * so CalendarEventsSection drops the rest before anything reaches the browser.
 * A coach's payload is unchanged, and a failed invite read hides every meeting.
 */

const { logServerError } = vi.hoisted(() => ({ logServerError: vi.fn(async (..._args: unknown[]) => {}) }));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('REDIRECT');
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => null }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn(async () => null) }));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const tablesRead: string[] = [];

function tableChain(table: string) {
  tablesRead.push(table);
  const settle = () => outcomes.get(table) ?? { data: [], error: null };
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, not: self, or: self, is: self, neq: self,
    gt: self, lt: self, gte: self, lte: self, order: self, limit: self, range: self,
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (r: (v: Outcome) => unknown, j?: (e: unknown) => unknown) => Promise.resolve(settle()).then(r, j),
  });
  return node;
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  from: (t: string) => tableChain(t),
  rpc: async () => ({ data: null, error: null }),
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));

const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
const row = (id: string, event_type: string) => ({
  id, team_id: 'team-1', title: id, event_type, start_time: soon(1), end_time: soon(1), location: null,
  description: null, status: 'confirmed', all_day: false, created_by: null, requires_rsvp: false,
  rsvp_deadline: null, max_attendees: null, parent_event_id: null, recurrence_rule: null,
});

async function renderSection(viewer: { isCoach: boolean; playerId: string | null }) {
  const mod = await import('@/app/golf/(dashboard)/dashboard/calendar/page');
  const section = mod.CalendarEventsSection as (a: unknown) => Promise<{ props: { events: Array<{ id: string }> } }>;
  const element = await section({
    supabase: client,
    teamId: 'team-1',
    coachList: [],
    isCoach: viewer.isCoach,
    coachId: viewer.isCoach ? 'coach-1' : null,
    playerId: viewer.playerId,
  });
  return element.props.events.map((e) => e.id);
}

beforeAll(async () => {
  await import('@/app/golf/(dashboard)/dashboard/calendar/page');
}, 60_000);

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  tablesRead.length = 0;
  outcomes.set('golf_events', { data: [row('practice', 'practice'), row('one-on-one', 'meeting'), row('captains', 'meeting')], error: null });
  outcomes.set('golf_event_attendance', { data: [{ event_id: 'captains', player_id: 'player-1' }], error: null });
  outcomes.set('golf_team_settings', { data: { timezone: 'America/New_York' }, error: null });
});

describe('Fairway calendar: meetings are for their invitees', () => {
  it('drops a meeting the player is not invited to and keeps the one they are', async () => {
    expect(await renderSection({ isCoach: false, playerId: 'player-1' })).toEqual(['practice', 'captains']);
  });

  it('hides every meeting from the player when the invite read fails, and logs it', async () => {
    outcomes.set('golf_event_attendance', { data: null, error: { message: 'statement timeout', code: '57014' } });
    expect(await renderSection({ isCoach: false, playerId: 'player-1' })).toEqual(['practice']);
    expect(logServerError.mock.calls.some((c) => /meeting is hidden/.test(String(c[0])))).toBe(true);
  });

  it("leaves the coach's calendar unchanged and reads no invites for it", async () => {
    expect(await renderSection({ isCoach: true, playerId: null })).toEqual(['practice', 'one-on-one', 'captains']);
    expect(tablesRead).not.toContain('golf_event_attendance');
  });
});
