import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The iCal team feed reads with the admin client, so RLS (and migration
 * 20261018120000) never narrows it. A team feed belongs to a coach
 * (createCalendarFeed refuses anyone else) and keeps every meeting; a feed
 * whose owner does not coach the team exports only the meetings that owner is
 * invited to. A failed coach check or invite read leaves meetings out.
 */

const { logServerError } = vi.hoisted(() => ({ logServerError: vi.fn(async (..._args: unknown[]) => {}) }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

type Outcome = { data: unknown; error: unknown };
const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
const EVENTS = [
  { id: 'practice', title: 'Team practice', event_type: 'practice' },
  { id: 'one-on-one', title: '1:1 with Sam', event_type: 'meeting' },
  { id: 'captains', title: 'Captains', event_type: 'meeting' },
].map((e) => ({ ...e, description: null, location: null, start_time: soon, end_time: soon, all_day: false, status: 'confirmed' }));

let ownerCoaches: Outcome;
let attendance: Outcome;
const tablesRead: string[] = [];

function builder(table: string) {
  tablesRead.push(table);
  const node: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'order', 'update', 'in', 'limit']) node[m] = () => node;
  node.range = async (from: number, to: number) =>
    table === 'golf_events' ? { data: EVENTS.slice(from, to + 1), error: null } : { data: [], error: null };
  node.single = async () =>
    table === 'golf_calendar_feeds'
      ? {
          data: { id: 'feed-1', feed_token: 'x', feed_type: 'all_events', team_id: 'team-1', user_id: 'user-1', name: 'Team', is_active: true, last_synced_at: null },
          error: null,
        }
      : { data: null, error: null };
  node.maybeSingle = async () => {
    if (table === 'golf_team_settings') return { data: { timezone: 'America/New_York' }, error: null };
    if (table === 'golf_players') return { data: { id: 'p1' }, error: null };
    return { data: null, error: null };
  };
  node.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(table === 'golf_event_attendance' ? attendance : { data: null, error: null }).then(resolve, reject);
  return node;
}

const client = {
  from: (table: string) => builder(table),
  rpc: async (name: string) => (name === 'verify_coach_owns_team' ? ownerCoaches : { data: true, error: null }),
};
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client }));

import { GET } from '@/app/api/calendar/feeds/[token]/route';

let counter = 0;
async function feedText(): Promise<string> {
  const token = `meeting-feed-token-${String(++counter).padStart(16, '0')}`;
  const res = await GET(new Request(`http://x/api/calendar/feeds/${token}`) as never, { params: Promise.resolve({ token }) });
  return res.text();
}

beforeEach(() => {
  logServerError.mockClear();
  tablesRead.length = 0;
  ownerCoaches = { data: false, error: null };
  attendance = { data: [{ event_id: 'captains', player_id: 'p1' }], error: null };
});

describe('iCal team feed: meetings are for their invitees', () => {
  it("keeps every meeting in a coach's feed and reads no invites", async () => {
    ownerCoaches = { data: true, error: null };
    const ics = await feedText();
    expect(ics).toContain('SUMMARY:1:1 with Sam');
    expect(ics).toContain('SUMMARY:Captains');
    expect(tablesRead).not.toContain('golf_event_attendance');
  });

  it("exports only the meetings a non-coach owner is invited to", async () => {
    const ics = await feedText();
    expect(ics).toContain('SUMMARY:Team practice');
    expect(ics).toContain('SUMMARY:Captains');
    expect(ics).not.toContain('1:1 with Sam');
  });

  it('leaves meetings out when the coach check fails and the invite read fails', async () => {
    ownerCoaches = { data: null, error: { message: 'timeout' } };
    attendance = { data: null, error: { message: 'timeout' } };
    const ics = await feedText();
    expect(ics).toContain('SUMMARY:Team practice');
    expect(ics).not.toContain('Captains');
    expect(ics).not.toContain('1:1 with Sam');
    expect(logServerError).toHaveBeenCalled();
  });
});
