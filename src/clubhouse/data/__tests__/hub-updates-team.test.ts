import { describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

/**
 * Coach audit 13 Nov 2026 (§7 Team Hub): Guilford's Updates showed Demo University's items ("Audit Testplayer has joined
 * Demo University Golf", "Message from Cole Bennett") and counted them as new. Team Hub is one team's page: another
 * team's items stay in the bell, where they are labelled, and the six rows are this team's newest.
 */
vi.mock('server-only', () => ({}));
let fake: FakeSupabase;
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: vi.fn(async () => ({ data: [], error: null })) }));
vi.mock('@/app/golf/actions/announcements', () => ({ getAnnouncementsWithMeta: vi.fn(async () => ({ success: true, data: [] })) }));
vi.mock('@/app/golf/actions/player-hub-data', () => ({ getPlayerHubSummaryData: vi.fn() }));
vi.mock('@/app/golf/actions/player-notifications', () => ({ getPlayerHubAnnouncements: vi.fn() }));

const GUILFORD = { id: 't1', name: 'Guilford' };
const DEMO = { id: 't2', name: 'Demo University Golf' };
const at = (m: number) => new Date(Date.UTC(2026, 10, 13, 12, 60 - m)).toISOString();
const n = (id: string, team: { id: string; name: string } | null, m: number) => ({
  id, source: 'notifications', category: 'messages', title: id, body: null, action_url: null, created_at: at(m), read_at: null, team,
});
// Newest first, as the feed returns it: six of Demo's ahead of Guilford's own.
const FEED = [
  ...[1, 2, 3, 4, 5, 6].map((k) => n(`demo-${k}`, DEMO, k)),
  n('mine-1', GUILFORD, 10),
  n('dm-1', null, 11),
  n('mine-2', GUILFORD, 12),
];
const feed = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: feed.get }));

import { loadTeamHub } from '../hub';

describe('Team Hub Updates are this team’s', () => {
  it('leaves out another team’s items and still shows this team’s, under them in the feed', async () => {
    feed.get.mockImplementation(async (p: { limit?: number }) => ({ success: true, data: { items: FEED.slice(0, p?.limit ?? 30), unreadCount: FEED.length } }));
    fake = createFakeSupabase({ user: { id: 'u1' }, tables: { golf_team_settings: [{ team_id: 't1', timezone: 'America/New_York' }] } });
    const hub = await loadTeamHub({ role: 'coach', teamId: 't1', userId: 'u1', playerId: null });
    expect(hub.updates.rows.map((r) => r.id)).toEqual(['mine-1', 'dm-1', 'mine-2']);
  });
});
