import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

/**
 * Fairway Travel shows "Linked to: <event>" on a trip. When the linked event is
 * a meeting the player is not invited to, the player gets no title (the trip
 * itself stays: trips are the team's). A coach still sees every title.
 */

const { logServerError, session } = vi.hoisted(() => ({
  logServerError: vi.fn(async (..._args: unknown[]) => {}),
  session: { value: null as unknown },
}));

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
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => (session.value as { coach: unknown }).coach ? 'team-1' : null),
}));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => session.value }));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
const ok = (data: unknown): Outcome => ({ data, error: null });

function tableChain(table: string) {
  const settle = () => outcomes.get(table) ?? ok([]);
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self, eq: self, in: self, gte: self, order: self, limit: self, range: self,
    single: async () => settle(),
    maybeSingle: async () => outcomes.get(`${table}:single`) ?? settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

const client = { from: (table: string) => tableChain(table) };
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));

const trip = (id: string, event_id: string) => ({ id, event_id, event_name: id, destination: 'Away', transportation_type: 'bus', departure_date: '2026-11-01' });

async function linkedTitles() {
  const mod = await import('@/app/golf/(dashboard)/dashboard/travel/page');
  const page = (await (mod.default as (a: unknown) => Promise<{ props: { children: { props: { itineraries: Array<{ id: string; event_title: string | null }> } } } }>)({
    searchParams: Promise.resolve({}),
  }));
  return Object.fromEntries(page.props.children.props.itineraries.map((i) => [i.id, i.event_title]));
}

beforeAll(async () => {
  await import('@/app/golf/(dashboard)/dashboard/travel/page');
}, 60_000);

beforeEach(() => {
  logServerError.mockClear();
  outcomes.clear();
  session.value = { role: 'player', coach: null, player: { id: 'p1' } };
  outcomes.set('golf_team_members:single', ok({ team_id: 'team-1' }));
  outcomes.set('golf_travel_itineraries', ok([trip('t-one', 'one-on-one'), trip('t-cap', 'captains'), trip('t-prac', 'practice')]));
  outcomes.set('golf_events', ok([
    { id: 'one-on-one', title: '1:1 with Sam', event_type: 'meeting' },
    { id: 'captains', title: 'Captains', event_type: 'meeting' },
    { id: 'practice', title: 'Practice', event_type: 'practice' },
  ]));
  outcomes.set('golf_event_attendance', ok([{ event_id: 'captains', player_id: 'p1' }]));
});

describe('Travel: a linked meeting title is for its invitees', () => {
  it("shows a player no title for a meeting they are not invited to", async () => {
    expect(await linkedTitles()).toEqual({ 't-one': null, 't-cap': 'Captains', 't-prac': 'Practice' });
  });

  it('shows a coach every linked title', async () => {
    session.value = { role: 'coach', coach: { id: 'c1', organization_id: 'o1' }, player: null };
    expect(await linkedTitles()).toEqual({ 't-one': '1:1 with Sam', 't-cap': 'Captains', 't-prac': 'Practice' });
  });
});
