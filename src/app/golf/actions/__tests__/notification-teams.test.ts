import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';
import { conversationIdOf, forTeam, type UnifiedNotificationItem } from '../unified-notifications-model';

/**
 * Coach audit 13 Nov 2026 (§2 Notifications, §7 Team Hub): with Guilford active, the bell and Team Hub's Updates showed
 * Demo University items ("Message from Cole Bennett", "Audit Testplayer has joined Demo University Golf") with nothing to
 * say whose they were. Neither notifications table has a team, so the feed reads it from what each row points at: a
 * message's conversation, or the team a row's data names. A row that points at no team (a direct message) has none.
 */
let fake: FakeSupabase;
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _m: unknown, fn: unknown) => fn }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getUnifiedNotifications } from '../unified-notifications';

const GUILFORD = '11111111-1111-4111-8111-111111111111';
const DEMO = '22222222-2222-4222-8222-222222222222';
const DEMO_CONV = '33333333-3333-4333-8333-333333333333';
const DM_CONV = '44444444-4444-4444-8444-444444444444';
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

function seed() {
  fake = createFakeSupabase({
    user: { id: 'coach-user' },
    tables: {
      golf_calendar_notifications: [
        { id: 'c1', user_id: 'coach-user', notification_type: 'message', title: 'Message from Cole Bennett', message: 'Staging test', action_url: `/golf/dashboard/messages?conversation=${DEMO_CONV}`, created_at: minutesAgo(5), read_at: null, event_id: null },
        { id: 'c2', user_id: 'coach-user', notification_type: 'message', title: 'Message from Sam', message: 'hi', action_url: `/golf/dashboard/messages?conversation=${DM_CONV}`, created_at: minutesAgo(9), read_at: null, event_id: null },
      ],
      notifications: [
        { id: 'n1', user_id: 'coach-user', type: 'team_join', title: 'Audit Testplayer has joined Demo University Golf', body: null, action_url: '/golf/dashboard/roster', created_at: minutesAgo(7), read_at: null, data: { team_id: DEMO } },
      ],
      // The conversations read embeds its team (`team:golf_teams(id, name)`); the fake returns rows as stored.
      golf_conversations: [
        { id: DEMO_CONV, team_id: DEMO, team: { id: DEMO, name: 'Demo University Golf' } },
        { id: DM_CONV, team_id: null, team: null },
      ],
      golf_teams: [
        { id: GUILFORD, name: 'Guilford College Men’s Golf (Test Copy)' },
        { id: DEMO, name: 'Demo University Golf' },
      ],
    },
  });
}

const byId = (items: UnifiedNotificationItem[]) => Object.fromEntries(items.map((i) => [i.id, i]));

afterEach(() => vi.clearAllMocks());

describe('each notification says which team it is for', () => {
  it('a message names the team of its conversation', async () => {
    seed();
    const r = await getUnifiedNotifications({ limit: 30 });
    expect(r.success).toBe(true);
    expect(byId(r.data!.items).c1?.team).toEqual({ id: DEMO, name: 'Demo University Golf' });
  });

  it('a "has joined" row names the team in its data', async () => {
    seed();
    const r = await getUnifiedNotifications({ limit: 30 });
    expect(byId(r.data!.items).n1?.team).toEqual({ id: DEMO, name: 'Demo University Golf' });
  });

  it('a direct message (a conversation with no team) has none', async () => {
    seed();
    const r = await getUnifiedNotifications({ limit: 30 });
    expect(byId(r.data!.items).c2?.team).toBeNull();
  });

  it('when the teams can’t be read, the feed still loads, with no team on any item', async () => {
    seed();
    const from = fake.from.bind(fake);
    fake.from = ((table: string) => {
      if (table === 'golf_conversations') throw new Error('network');
      return from(table);
    }) as typeof fake.from;
    const r = await getUnifiedNotifications({ limit: 30 });
    expect(r.success).toBe(true);
    expect(r.data!.items).toHaveLength(3);
    expect(r.data!.items.every((i) => i.team == null)).toBe(true);
  });
});

describe('reading a conversation id out of a link', () => {
  it('finds the conversation a message links to', () => {
    expect(conversationIdOf(`/golf/dashboard/messages?conversation=${DEMO_CONV}`)).toBe(DEMO_CONV);
    expect(conversationIdOf(`/golf/dashboard/messages?tab=all&conversation=${DEMO_CONV}#end`)).toBe(DEMO_CONV);
  });

  it('a link with no conversation, or not an id, has none', () => {
    expect(conversationIdOf('/golf/dashboard/roster')).toBeNull();
    expect(conversationIdOf('/golf/dashboard/messages?conversation=not-an-id')).toBeNull();
    expect(conversationIdOf(null)).toBeNull();
  });
});

describe('Team Hub keeps only this team’s updates', () => {
  const item = (id: string, team: UnifiedNotificationItem['team']): UnifiedNotificationItem => ({
    id, source: 'notifications', category: 'messages', title: id, body: null, action_url: null, created_at: minutesAgo(1), read_at: null, team,
  });

  it('drops another team’s items and keeps this team’s and those with no team', () => {
    const kept = forTeam(
      [item('mine', { id: GUILFORD, name: 'Guilford' }), item('theirs', { id: DEMO, name: 'Demo University Golf' }), item('dm', null), item('older', undefined)],
      GUILFORD,
    );
    expect(kept.map((i) => i.id)).toEqual(['mine', 'dm', 'older']);
  });
});
