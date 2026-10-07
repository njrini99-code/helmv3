/**
 * OD-03 follow-up (2026-09-27): QA rows on the demo team are flagged
 * `is_test = true` on golf_announcements, golf_tasks, golf_documents and
 * golf_travel_itineraries (migration 20260927120000). The list and count
 * reads a coach or player sees filter `.eq('is_test', false)`; by-id reads,
 * writes and background jobs do not.
 *
 * One list read per table is pinned here against fake-supabase. Each table
 * holds one flagged row and one row that omits the column, which reads the
 * NOT NULL default (false) through fake-supabase's COLUMN_DEFAULTS, the same
 * way every pre-migration row reads in production.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

// The announcement recipient gate reads through the admin client.
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => fake),
}));

// Staffing rules are covered elsewhere; these tests are about the list reads.
vi.mock('@/lib/golf/resolve-team', () => ({
  validateCoachTeamAccess: vi.fn(async () => true),
}));

vi.mock('@/lib/auth/verify-player-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/verify-player-access')>();
  return {
    ...actual,
    verifyPlayerAccess: vi.fn(async () => ({ allowed: true, reason: 'self' }) as const),
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

import { getAnnouncementsWithMeta } from '@/app/golf/actions/announcements';
import { getDocuments } from '@/app/golf/actions/documents';
import { getPlayerNotificationCounts } from '@/app/golf/actions/player-notifications';
import { getOpenTasks } from '@/lib/coachhelm/v3/chat/read-tools';
import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';

const TEAM_ID = 'team-1';
const COACH_USER_ID = 'coach-user';
const PLAYER_USER_ID = 'player-user';
const PLAYER_ID = 'player-1';

// Published an hour ago: inside the 30-day notification window and the
// 24-hour "unread" window.
const RECENT = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const announcements = [
  {
    id: 'ann-real',
    team_id: TEAM_ID,
    title: 'Practice moved to 3pm',
    body: 'See you there.',
    urgency: 'normal',
    requires_acknowledgement: false,
    published_at: RECENT,
    created_at: RECENT,
  },
  {
    id: 'ann-qa',
    team_id: TEAM_ID,
    title: 'QA announcement',
    body: 'Demo row.',
    urgency: 'normal',
    requires_acknowledgement: false,
    published_at: RECENT,
    created_at: RECENT,
    is_test: true,
  },
];

const trips = [
  { id: 'trip-real', team_id: TEAM_ID, event_name: 'Conference', created_at: RECENT },
  { id: 'trip-qa', team_id: TEAM_ID, event_name: 'QA trip', created_at: RECENT, is_test: true },
];

function coachFake(tables: Record<string, Array<Record<string, unknown>>>): FakeSupabase {
  return createFakeSupabase({
    user: { id: COACH_USER_ID },
    tables: {
      golf_coaches: [{ id: 'coach-1', user_id: COACH_USER_ID, organization_id: 'org-1' }],
      ...tables,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('OD-03: is_test team content stays off the lists people see', () => {
  it('golf_announcements: the announcements list skips a flagged announcement', async () => {
    fake = coachFake({ golf_announcements: announcements });

    const result = await getAnnouncementsWithMeta(TEAM_ID, COACH_USER_ID, true, null);

    expect(result.success).toBe(true);
    expect(result.data?.map((a) => a.id)).toEqual(['ann-real']);
  });

  it('golf_tasks: the CoachHelm open-tasks read skips a flagged task', async () => {
    fake = coachFake({
      golf_tasks: [
        { id: 'task-real', team_id: TEAM_ID, title: 'Upload transcript', status: 'pending', due_date: '2099-01-01', priority: 'normal', task_type: null },
        { id: 'task-qa', team_id: TEAM_ID, title: 'QA task', status: 'pending', due_date: '2099-01-01', priority: 'normal', task_type: null, is_test: true },
      ],
    });
    const ctx: CoachChatContext = {
      coach_id: 'coach-1',
      user_id: COACH_USER_ID,
      team_id: TEAM_ID,
      team_name: 'Helm University',
      timezone: 'America/New_York',
      roster: [],
    };

    const envelope = await getOpenTasks(fake as unknown as Parameters<typeof getOpenTasks>[0], ctx);
    const detail = envelope.detail as { open_count: number; tasks: Array<{ task_id: string }> };

    expect(detail.open_count).toBe(1);
    expect(detail.tasks.map((t) => t.task_id)).toEqual(['task-real']);
  });

  it('golf_documents: the documents list skips a flagged document', async () => {
    fake = coachFake({
      golf_documents: [
        { id: 'doc-real', team_id: TEAM_ID, title: 'Travel waiver', is_public: true, updated_at: RECENT },
        { id: 'doc-qa', team_id: TEAM_ID, title: 'QA document', is_public: true, updated_at: RECENT, is_test: true },
      ],
    });

    const { data, error } = await getDocuments(TEAM_ID);

    expect(error).toBeNull();
    expect(data?.map((d) => d.id)).toEqual(['doc-real']);
  });

  it('golf_travel_itineraries and golf_announcements: the player badge counts skip flagged rows', async () => {
    fake = createFakeSupabase({
      user: { id: PLAYER_USER_ID },
      tables: {
        golf_team_members: [
          { id: 'member-1', team_id: TEAM_ID, player_id: PLAYER_ID, status: 'active' },
        ],
        golf_announcements: announcements,
        golf_travel_itineraries: trips,
      },
    });

    const result = await getPlayerNotificationCounts(PLAYER_ID, PLAYER_USER_ID, TEAM_ID);

    expect(result.success).toBe(true);
    // No notification-state row yet, so every non-flagged trip is unseen.
    expect(result.data?.unseenTravel).toBe(1);
    expect(result.data?.unreadAnnouncements).toBe(1);
    expect(result.data?.unseenAnnouncements.map((a) => a.id)).toEqual(['ann-real']);
  });
});
