import { describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

/**
 * F-0033 (audit 2026-10-29): coach Team Hub waited for every first-wave read (documents, the bell's notifications) before
 * the events, tasks and trips started, though they need only the team's clock. They start once the clock is known.
 */
vi.mock('server-only', () => ({}));
let fake: FakeSupabase;
const reads: string[] = [];
let releaseUpdates: () => void = () => {};
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('../../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('@/app/golf/actions/documents', () => ({ getDocuments: vi.fn(async () => ({ data: [], error: null })) }));
vi.mock('@/app/golf/actions/announcements', () => ({ getAnnouncementsWithMeta: vi.fn(async () => ({ success: true, data: [] })) }));
vi.mock('@/app/golf/actions/player-hub-data', () => ({ getPlayerHubSummaryData: vi.fn() }));
vi.mock('@/app/golf/actions/player-notifications', () => ({ getPlayerHubAnnouncements: vi.fn() }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({
  getUnifiedNotifications: vi.fn(
    () =>
      new Promise((resolve) => {
        releaseUpdates = () => resolve({ success: true, data: { items: [] } });
      }),
  ),
}));

import { loadTeamHub } from '../hub';

describe('coach Team Hub reads in waves (F-0033)', () => {
  it('the events read starts before the notifications read has answered', async () => {
    fake = createFakeSupabase({ user: { id: 'u1' }, tables: { golf_team_settings: [{ team_id: 't1', timezone: 'America/New_York' }] } });
    const from = fake.from.bind(fake);
    fake.from = ((table: string) => {
      reads.push(table);
      return from(table);
    }) as typeof fake.from;
    const hub = loadTeamHub({ role: 'coach', teamId: 't1', userId: 'u1', playerId: null });
    await vi.waitFor(() => expect(reads).toContain('golf_events'), { timeout: 500 });
    releaseUpdates();
    await hub;
  });

  it('the 30-day pulse (rounds) starts once the roster and the clock are in, before the notifications have answered', async () => {
    reads.length = 0;
    fake = createFakeSupabase({
      user: { id: 'u1' },
      tables: { golf_team_settings: [{ team_id: 't1', timezone: 'America/New_York' }], golf_team_members: [{ team_id: 't1', status: 'active', player: { id: 'p1', first_name: 'Ann', last_name: 'Lee' } }] },
    });
    const from = fake.from.bind(fake);
    fake.from = ((table: string) => {
      reads.push(table);
      return from(table);
    }) as typeof fake.from;
    const hub = loadTeamHub({ role: 'coach', teamId: 't1', userId: 'u1', playerId: null });
    await vi.waitFor(() => expect(reads).toContain('golf_rounds'), { timeout: 500 });
    releaseUpdates();
    await hub;
  });
});
