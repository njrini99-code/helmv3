import { describe, it, expect, vi } from 'vitest';

/**
 * Swap audit F-21: Team Hub asked PostgREST for 2000 attendance rows and 5000
 * task assignments, but PostgREST returns at most 1000, so a large team's RSVP
 * and task counts were silently cut short. Both reads now page.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/app/golf/actions/announcements', () => ({ getAnnouncementsWithMeta: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: vi.fn() }));
vi.mock('@/app/golf/actions/player-hub-data', () => ({ getPlayerHubSummaryData: vi.fn() }));
vi.mock('@/app/golf/actions/player-notifications', () => ({ getPlayerHubAnnouncements: vi.fn() }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: vi.fn() }));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));

import { attendanceFor, assignmentsFor } from '../data/hub';

/** A table of `total` rows that honours .range() the way PostgREST does (at most 1000 a page). */
function pagedClient(make: (i: number) => Record<string, unknown>, total: number) {
  const rows = Array.from({ length: total }, (_, i) => make(i));
  const chain = {
    select: () => chain,
    in: () => chain,
    order: () => chain,
    range: async (from: number, to: number) => ({ data: rows.slice(from, Math.min(to, from + 999) + 1), error: null }),
  };
  return { from: () => chain } as never;
}

describe('Team Hub reads page past 1000 rows', () => {
  it('counts every attendance row', async () => {
    const client = pagedClient((i) => ({ event_id: 'e1', player_id: `p${i}`, status: 'attending' }), 2500);
    const { byEvent, error } = await attendanceFor(client, ['e1']);
    expect(error).toBe(false);
    expect(byEvent.get('e1')).toHaveLength(2500);
  });

  it('counts every task assignment', async () => {
    const client = pagedClient((i) => ({ task_id: 't1', status: i % 2 ? 'completed' : 'pending' }), 1800);
    const { byTask, error } = await assignmentsFor(client, ['t1']);
    expect(error).toBe(false);
    expect(byTask.get('t1')).toEqual({ done: 900, total: 1800 });
  });
});
