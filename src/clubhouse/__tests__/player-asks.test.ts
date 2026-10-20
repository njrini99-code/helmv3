import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Wave 7, item 1: Home's "From your coach" row counts what Team Hub lists for the player (data/player-home.ts,
 * loadPlayerAsks): their own unanswered invitations the server would still take, posts asking for an acknowledgement they
 * haven't given, and their open tasks due within a week. Any read failing hides the row (null), logged.
 */

vi.mock('server-only', () => ({}));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const announcements = vi.hoisted(() => ({ current: { success: true, data: [] } as { success: boolean; data?: unknown[]; error?: string } }));
vi.mock('@/app/golf/actions/player-notifications', () => ({ getPlayerHubAnnouncements: vi.fn(async () => announcements.current) }));
vi.mock('@/app/golf/actions/announcements', () => ({ getAnnouncementsWithMeta: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: vi.fn() }));
vi.mock('@/app/golf/actions/player-hub-data', () => ({ getPlayerHubSummaryData: vi.fn() }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: vi.fn() }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { createClient } from '@/lib/supabase/server';
import { loadPlayerAsks } from '../data/player-home';
import { replyIsClosed } from '../data/hub';
import { replyClosedAt } from '../screens/calendar/model';

// Wednesday 14 October 2026, noon in New York.
const NOW = new Date('2026-10-14T16:00:00Z');
const hubEvent = (event_id: string, rsvp_status: string | null, event_type = 'practice') => ({
  id: event_id,
  event_id,
  title: event_id,
  event_type,
  start_time: '2026-10-16T19:00:00Z',
  end_time: null,
  location: null,
  is_mandatory: false,
  rsvp_status,
  going_count: 0,
  maybe_count: 0,
});
const rule = (id: string, over: Record<string, unknown> = {}) => ({ id, status: 'confirmed', cancelled_at: null, all_day: false, start_time: '2026-10-16T19:00:00Z', rsvp_deadline: null, requires_rsvp: true, ...over });

function serve() {
  tables.current = {
    'rpc:get_player_hub_events': {
      data: [
        hubEvent('open', 'pending'),
        hubEvent('late', 'pending'),
        hubEvent('answered', 'accepted'),
        // Not on its list: nothing for this player to answer.
        hubEvent('team', null),
      ],
    },
    golf_events: { data: [rule('open'), rule('late', { rsvp_deadline: '2026-10-14T12:00:00Z' })] },
    golf_task_assignments: {
      data: [
        { task_id: 't-soon', status: 'pending' },
        { task_id: 't-overdue', status: 'pending' },
        { task_id: 't-later', status: 'pending' },
        { task_id: 't-done', status: 'completed' },
      ],
    },
    golf_tasks: {
      data: [
        { id: 't-soon', due_date: '2026-10-17' },
        { id: 't-overdue', due_date: '2026-10-01' },
        { id: 't-later', due_date: '2026-11-30' },
      ],
    },
  };
  announcements.current = {
    success: true,
    data: [
      { id: 'a1', requires_acknowledgement: true, has_player_acknowledged: false },
      { id: 'a2', requires_acknowledgement: true, has_player_acknowledged: true },
      { id: 'a3', requires_acknowledgement: false, has_player_acknowledged: false },
    ],
  };
}

const load = async () => loadPlayerAsks(await createClient(), { teamId: 't1', playerId: 'p1', now: NOW, today: Promise.resolve('2026-10-14') });

beforeEach(() => {
  logServer.mockClear();
  serve();
});
afterEach(() => {
  tables.current = {};
});

describe('From your coach: what the coach is waiting on', () => {
  it('counts the replies the server would still take, the posts to acknowledge, and the open tasks due within a week', async () => {
    expect(await load()).toEqual({ rsvps: 1, acks: 1, tasksDue: 2 });
  });

  it('any read failing hides the row (null) and is logged, never an undercount', async () => {
    const failed = { error: { code: '57014', message: 'timeout' } };
    for (const [table, read] of [
      ['rpc:get_player_hub_events', 'asksEvents'],
      ['golf_events', 'asksReplyRules'],
      ['golf_task_assignments', 'asksTasks'],
      ['golf_tasks', 'asksTaskDates'],
    ] as const) {
      serve();
      tables.current = { ...tables.current, [table]: failed };
      logServer.mockClear();
      expect(await load()).toBeNull();
      expect(logServer).toHaveBeenCalledWith('home', read, expect.anything());
    }
    serve();
    announcements.current = { success: false, error: 'Failed to load announcements' };
    expect(await load()).toBeNull();
    expect(logServer).toHaveBeenCalledWith('home', 'asksAnnouncements', 'Failed to load announcements');
  });

  it('a reply closes on the same rules as Team Hub’s (replyIsClosed), so the count matches what Hub offers', () => {
    const rows = [
      rule('a'),
      rule('b', { requires_rsvp: null }),
      rule('c', { requires_rsvp: false }),
      rule('d', { status: 'cancelled' }),
      rule('e', { cancelled_at: '2026-10-13T00:00:00Z' }),
      rule('f', { start_time: '2026-10-14T15:00:00Z' }),
      rule('g', { start_time: '2026-10-14T00:00:00Z', all_day: true }),
      rule('h', { start_time: '2026-10-13T00:00:00Z', all_day: true }),
      rule('i', { rsvp_deadline: '2026-10-14T15:59:00Z' }),
      rule('j', { rsvp_deadline: '2026-10-15T00:00:00Z' }),
    ];
    for (const r of rows) expect(replyClosedAt(r, NOW.getTime()), r.id).toBe(replyIsClosed(r, NOW.getTime()));
  });
});
