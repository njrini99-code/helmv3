/**
 * P-5 WP-P5. The calendar's create and update persist the library course (`golf_events.course_id`) the editor chose,
 * while `courseName` stays what it was: accepted and dropped (the plan's old text said it went to `location`; main
 * drops it). A tournament round's event can't be deleted on its own: golf_tournament_rounds' deferred foreign key
 * refuses it at commit (23503), and the action says so instead of "Failed to delete event".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: unknown;
let deleteError: unknown = null;
const fanOut = vi.hoisted(() => ({ invitation: vi.fn(async (_p: unknown) => {}), cancelled: vi.fn(async (_p: unknown) => {}) }));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('next/server', () => ({ after: vi.fn((cb: () => unknown) => void cb()) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1') }));
vi.mock('@/lib/calendar/fan-out', () => ({ fanOutEventInvitation: fanOut.invitation, fanOutEventCancelled: fanOut.cancelled }));

import { createGolfEvent, deleteGolfEventPermanently, updateGolfEvent } from '../calendar-events';

type Row = Record<string, unknown>;
const COURSE = '0c0c0c0c-0c0c-4c0c-8c0c-0c0c0c0c0c0c';
const EVENT = '11111111-1111-4111-8111-111111111111';

function install(t: Record<string, Row[]>) {
  const real = createFakeSupabase({ user: { id: 'u-coach' }, tables: t });
  fake = {
    ...real,
    from: (table: string) => {
      const b = real.from(table);
      if (table !== 'golf_events' || !deleteError) return b;
      return {
        ...b,
        delete: () => {
          const n: Record<string, unknown> = {};
          Object.assign(n, {
            eq: () => n,
            select: async () => ({ data: null, error: deleteError }),
          });
          return n;
        },
      };
    },
  };
  return t;
}

function tables(): Record<string, Row[]> {
  return {
    organizations: [{ id: 'org-1' }],
    golf_teams: [{ id: 'team-1', organization_id: 'org-1', created_at: '2025-01-01' }],
    golf_coaches: [{ id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' }],
    golf_team_members: [],
    golf_events: [],
    golf_event_attendance: [],
  };
}

const event = (over: Record<string, unknown> = {}) => ({
  title: 'Pinehurst Invitational',
  eventType: 'tournament' as const,
  startDate: '2099-11-05',
  allDay: true,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  deleteError = null;
});

describe('WP-P5: course_id on the calendar create and update', () => {
  it('a create with a course writes course_id', async () => {
    const t = install(tables());
    const r = await createGolfEvent(event({ courseId: COURSE }));
    expect(r.success).toBe(true);
    expect(t.golf_events![0]).toMatchObject({ course_id: COURSE, event_type: 'tournament' });
  });

  it('a create without one writes no course_id at all, as before', async () => {
    const t = install(tables());
    await createGolfEvent(event());
    expect(t.golf_events![0]).not.toHaveProperty('course_id');
  });

  it('courseName is accepted and dropped: it reaches neither location nor course_id', async () => {
    const t = install(tables());
    const r = await createGolfEvent(event({ courseName: 'Pinehurst No. 2' }));
    expect(r.success).toBe(true);
    expect(t.golf_events![0]!.location).toBeNull();
    expect(t.golf_events![0]).not.toHaveProperty('course_id');
  });

  it('refuses a course id that is not a UUID before writing', async () => {
    const t = install(tables());
    const r = await createGolfEvent(event({ courseId: 'pinehurst' }));
    expect(r.success).toBe(false);
    expect(t.golf_events).toHaveLength(0);
  });

  it('an update sets the course, clears it with null, and leaves it when absent', async () => {
    const t = install(tables());
    t.golf_events!.push({ id: EVENT, team_id: 'team-1', title: 'Pinehurst Invitational', event_type: 'tournament', start_time: '2099-11-05T00:00:00+00:00', status: 'confirmed', course_id: null });
    expect((await updateGolfEvent(EVENT, { courseId: COURSE })).success).toBe(true);
    expect(t.golf_events![0]!.course_id).toBe(COURSE);
    expect((await updateGolfEvent(EVENT, { title: 'Pinehurst Invitational 2' })).success).toBe(true);
    expect(t.golf_events![0]!.course_id).toBe(COURSE);
    expect((await updateGolfEvent(EVENT, { courseId: null })).success).toBe(true);
    expect(t.golf_events![0]!.course_id).toBeNull();
  });

  it('the invitation fan-out goes through the shared helper, with only RSVP invitees', async () => {
    install(tables());
    await createGolfEvent(event({ attendeeIds: [] }));
    expect(fanOut.invitation).toHaveBeenCalledTimes(1);
    expect(fanOut.invitation.mock.calls[0]![0]).toMatchObject({ title: 'Pinehurst Invitational', dateLabel: '2099-11-05', teamId: 'team-1' });
    expect((fanOut.invitation.mock.calls[0]![0] as { inviteeIds: Set<string> }).inviteeIds.size).toBe(0);
  });
});

describe('WP-P5: a tournament round cannot be deleted on its own', () => {
  it('maps 23503 to the belongs-to-a-tournament copy', async () => {
    const t = install(tables());
    t.golf_events!.push({ id: EVENT, team_id: 'team-1', title: 'Pinehurst Invitational · R2', status: 'cancelled', start_time: '2099-11-06T00:00:00+00:00' });
    deleteError = { code: '23503', message: 'update or delete on table "golf_events" violates foreign key constraint' };
    const r = await deleteGolfEventPermanently(EVENT);
    expect(r).toEqual({ success: false, error: 'This round belongs to a tournament. Manage it in Tournaments.' });
  });

  it('any other delete failure keeps its own message', async () => {
    const t = install(tables());
    t.golf_events!.push({ id: EVENT, team_id: 'team-1', title: 'Practice', status: 'cancelled', start_time: '2099-11-06T00:00:00+00:00' });
    deleteError = { code: '57014', message: 'canceling statement due to statement timeout' };
    expect(await deleteGolfEventPermanently(EVENT)).toEqual({ success: false, error: 'Failed to delete event' });
  });
});
