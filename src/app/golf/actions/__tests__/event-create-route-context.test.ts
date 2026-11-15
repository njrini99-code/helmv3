/**
 * ask-actions-qa: Ask's create tools call the calendar's own actions from the chat route handler. createGolfEvent wrote the event and its
 * invitations and then called updateTag, which only works inside a Server Action: it threw after the write, the action returned a failure, and
 * the run was marked failed for an event that exists (only the read-back showed it done). Cache invalidation now works from both contexts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: unknown;
let adminFake: unknown;
let afterCallbacks: Array<() => Promise<void> | void> = [];

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => adminFake) }));
vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void> | void) => {
    afterCallbacks.push(cb);
  }),
}));
// Next 16: outside a Server Action (here, the chat route handler) updateTag throws this before it does anything.
const cache = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn((_tag: string): void => {
    throw new Error('updateTag can only be called from within a Server Action. To invalidate cache tags in Route Handlers or other contexts, use revalidateTag instead.');
  }),
  revalidateTag: vi.fn(),
}));
vi.mock('next/cache', () => cache);
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1') }));
vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({ postRoundTrigger: vi.fn(async () => {}) }));
vi.mock('@/lib/cache/golf-stats-calculator', () => ({ invalidateOnRoundComplete: vi.fn(async () => {}) }));
vi.mock('@/lib/admin-logger', () => ({ logRoundSubmitted: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications', () => ({ notifyQualifierCreated: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications/email', () => ({ sendEmailNotification: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/notifications/push', () => ({ sendBulkPushNotification: vi.fn(async () => {}) }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));

import { createGolfEvent } from '../calendar-events';
import { CREATE_FLOWS, flowCommit } from '@/lib/coachhelm/v3/chat/create-tools';
import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';

type Row = Record<string, unknown>;
const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';

function install(): Record<string, Row[]> {
  const t: Record<string, Row[]> = {
    organizations: [{ id: 'org-1' }],
    golf_teams: [{ id: 'team-1', organization_id: 'org-1', created_at: '2025-01-01' }],
    golf_coaches: [{ id: 'coach-1', user_id: 'u-coach', organization_id: 'org-1' }],
    golf_players: [
      { id: P1, user_id: 'u-p1', first_name: 'Nick', last_name: 'Rini' },
      { id: P2, user_id: 'u-p2', first_name: 'Ava', last_name: 'Smith' },
    ],
    golf_team_members: [
      { id: 'm-1', team_id: 'team-1', player_id: P1, status: 'active' },
      { id: 'm-2', team_id: 'team-1', player_id: P2, status: 'active' },
    ],
    users: [{ id: 'u-p1', email: 'p1@example.com' }, { id: 'u-p2', email: 'p2@example.com' }],
    golf_events: [],
    golf_event_attendance: [],
    golf_calendar_notifications: [],
  };
  fake = createFakeSupabase({ user: { id: 'u-coach' }, tables: t });
  adminFake = createFakeSupabase({ user: null, tables: t });
  return t;
}

const event = (over: Record<string, unknown> = {}) => ({
  title: 'Short game',
  eventType: 'practice' as const,
  startDate: '2099-07-01',
  startTime: '14:00',
  endTime: '16:00',
  allDay: false,
  timezoneOffset: 0,
  attendeeIds: [P1],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks = [];
});

describe('createGolfEvent from a route handler (Ask)', () => {
  it('writes the event and its invitations, returns success, and invalidates with revalidateTag instead of throwing', async () => {
    const t = install();
    const res = (await createGolfEvent(event())) as { success: boolean; error?: string; data?: { eventId: string } };
    expect(res.error).toBeUndefined();
    expect(res.success).toBe(true);
    expect(t.golf_events).toHaveLength(1);
    expect(t.golf_event_attendance!.length).toBeGreaterThan(0);
    expect(res.data?.eventId).toBe(t.golf_events![0]!.id);
    expect(cache.revalidateTag.mock.calls.map((c) => c[1])).toEqual(['max', 'max']);
    expect(cache.revalidateTag.mock.calls.map((c) => c[0])).toEqual(['dashboard', 'calendar']);
  });

  it('inside a Server Action it is still updateTag: Fairway’s behaviour is unchanged', async () => {
    install();
    cache.updateTag.mockImplementation(() => undefined);
    const res = (await createGolfEvent(event())) as { success: boolean };
    expect(res.success).toBe(true);
    expect(cache.updateTag.mock.calls.map((c) => c[0])).toEqual(['dashboard', 'calendar']);
    expect(cache.revalidateTag).not.toHaveBeenCalled();
  });

  it('a real failure is still a failure: an invalid event writes nothing and says so', async () => {
    const t = install();
    const res = (await createGolfEvent(event({ title: '' }))) as { success: boolean; error?: string };
    expect(res.success).toBe(false);
    expect(t.golf_events).toHaveLength(0);
    expect(cache.revalidateTag).not.toHaveBeenCalled();
  });
});

describe('Ask’s create_event run', () => {
  it('ends completed with the event created once (the action’s own result is success; the read-back is only a backstop)', async () => {
    const t = install();
    const flow = CREATE_FLOWS.find((f) => f.name === 'create_event')!;
    const ctx = { coach_id: 'coach-1', user_id: 'u-coach', team_id: 'team-1', team_name: 'Varsity', timezone: 'UTC', roster: [{ id: P1, name: 'Nick Rini' }, { id: P2, name: 'Ava Smith' }] } as unknown as CoachChatContext;
    const input = { title: 'Short game', event_type: 'practice', date: '2099-07-01', start: '14:00', end: '16:00', all_day: false, invite_player_ids: [P1], requires_rsvp: false };
    const receipt = await flowCommit(flow as never, fake as never, ctx, input as never, 'key-1').run();
    expect(receipt).toMatchObject({ status: 'completed', action: 'create_event', created: [{ kind: 'event', count: 1 }] });
    expect(receipt.error).toBeUndefined();
    expect(t.golf_events).toHaveLength(1);
  });
});
