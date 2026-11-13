import { describe, expect, it, vi } from 'vitest';

/**
 * Coach audit 13 Nov 2026 (§7 #4): every task read "0/12" and "24 of 72 player assignments done" while Guilford has 11
 * active players: an inactive member's assignments were counted. Team Hub counts the active roster's only.
 */
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/app/golf/actions/announcements', () => ({ getAnnouncementsWithMeta: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: vi.fn() }));
vi.mock('@/app/golf/actions/player-hub-data', () => ({ getPlayerHubSummaryData: vi.fn() }));
vi.mock('@/app/golf/actions/player-notifications', () => ({ getPlayerHubAnnouncements: vi.fn() }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: vi.fn() }));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));

import { assignmentsFor } from '../hub';

const ROWS = [
  { task_id: 't1', player_id: 'active-1', status: 'completed' },
  { task_id: 't1', player_id: 'active-2', status: 'pending' },
  { task_id: 't1', player_id: 'left-team', status: 'pending' },
];
function client() {
  const chain = { select: () => chain, in: () => chain, order: () => chain, range: async () => ({ data: ROWS, error: null }) };
  return { from: () => chain } as never;
}

describe('task assignees', () => {
  it('count only the active roster when it is known', async () => {
    const { byTask, openByPlayer } = await assignmentsFor(client(), ['t1'], new Set(['active-1', 'active-2']));
    expect(byTask.get('t1')).toEqual({ done: 1, total: 2 });
    expect(openByPlayer.has('left-team')).toBe(false);
  });

  it('count every assignee when the roster is not known (its read failed)', async () => {
    const { byTask } = await assignmentsFor(client(), ['t1'], null);
    expect(byTask.get('t1')).toEqual({ done: 1, total: 3 });
  });
});
