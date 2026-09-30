import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The welcome's server side (P015): who is greeted, what the card says, and who is sent back to sign in. */

const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
);
vi.mock('next/navigation', () => ({ redirect, useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }) }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const resilient = vi.hoisted(() => ({ result: { user: null as unknown, degraded: false }, throws: false }));
vi.mock('@/lib/auth/resilient-get-user', () => ({
  getUserResilient: async () => {
    if (resilient.throws) throw new Error('auth server fell over');
    return resilient.result;
  },
}));
const tables = vi.hoisted(() => ({ golf_coaches: { data: null as unknown, error: null as unknown }, golf_players: { data: null as unknown, error: null as unknown }, users: { data: null as unknown, error: null as unknown } }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: keyof typeof tables) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => tables[table] }) }),
    }),
  }),
}));
const feed = vi.hoisted(() => ({ result: null as unknown }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: async () => feed.result }));
const gate = vi.hoisted(() => ({ clubhouse: true }));
vi.mock('../gate', () => ({ isClubhouseFor: (role: string | null) => (role === 'coach' || role === 'player') && gate.clubhouse, isClubhouseFrontDoor: () => true }));

import { loadWelcome } from '../data/welcome';
import { WelcomeLoader } from '../routes/auth';

const item = (id: string, read: string | null = null) => ({ id, source: 'notifications', category: 'messages', title: `Item ${id}`, body: null, action_url: null, created_at: '2025-10-13T10:00:00Z', read_at: read });

beforeEach(() => {
  resilient.result = { user: { id: 'u1', user_metadata: {} }, degraded: false };
  resilient.throws = false;
  tables.golf_coaches = { data: { full_name: 'Maya Reyes' }, error: null };
  tables.golf_players = { data: null, error: null };
  tables.users = { data: { role: 'coach', last_seen: '2025-10-12T21:12:00Z' }, error: null };
  feed.result = { success: true, data: { items: [item('1'), item('2', '2025-10-13T11:00:00Z'), item('3'), item('4'), item('5')], unreadCount: 4 } };
  gate.clubhouse = true;
});
afterEach(() => vi.clearAllMocks());

describe('CH-15903 a session the auth server has ruled invalid goes back to sign in', () => {
  it('reports signed out when there is no user', async () => {
    resilient.result = { user: null, degraded: false };
    expect(await loadWelcome()).toEqual({ kind: 'signedOut' });
  });

  it('redirects to /golf/login from the route, before anything is drawn', async () => {
    resilient.result = { user: null, degraded: false };
    await expect(WelcomeLoader()).rejects.toThrow('REDIRECT:/golf/login');
    expect(redirect).toHaveBeenCalledWith('/golf/login');
  });

  it('does not sign anyone out because the auth read threw: it greets by the time of day and says the updates did not load', async () => {
    resilient.throws = true;
    const load = await loadWelcome();
    expect(load).toMatchObject({ kind: 'ready', data: { name: { status: 'anonymous' }, news: { failed: true } } });
    expect(redirect).not.toHaveBeenCalled();
    expect(logServer).toHaveBeenCalledWith('auth', 'welcome.session', expect.any(Error), 'golf_auth');
  });
});

describe('the welcome data', () => {
  it('names a coach, lists the newest three unread things, and carries the previous visit', async () => {
    const load = await loadWelcome();
    expect(load.kind).toBe('ready');
    if (load.kind !== 'ready') return;
    expect(load.data.name).toEqual({ status: 'named', display: 'Coach Reyes' });
    expect(load.data.news.items.map((i) => i.title)).toEqual(['Item 1', 'Item 3', 'Item 4']);
    expect(load.data.news).toMatchObject({ first: false, failed: false });
    expect(load.data.lastSeenAt).toBe('2025-10-12T21:12:00Z');
    expect(load.data.isAdmin).toBe(false);
    expect(load.data.clubhouseDashboard).toBe(true);
  });

  it('greets a player by first name, and falls back to the account name', async () => {
    tables.golf_coaches = { data: null, error: null };
    tables.golf_players = { data: { first_name: 'Theo' }, error: null };
    let load = await loadWelcome();
    expect(load.kind === 'ready' && load.data.name).toEqual({ status: 'named', display: 'Theo' });
    tables.golf_players = { data: null, error: null };
    resilient.result = { user: { id: 'u1', user_metadata: { full_name: 'Sam Jones' } }, degraded: false };
    load = await loadWelcome();
    expect(load.kind === 'ready' && load.data.name).toEqual({ status: 'named', display: 'Sam' });
  });

  it('CH-15302 treats a person with no earlier visit as a first time', async () => {
    tables.users = { data: { role: 'coach', last_seen: null }, error: null };
    feed.result = { success: true, data: { items: [], unreadCount: 0 } };
    const load = await loadWelcome();
    expect(load.kind === 'ready' && load.data.news).toEqual({ items: [], first: true, failed: false });
  });

  it('CH-15201 CH-15908 marks the updates as not loaded when the notifications read fails, and logs it', async () => {
    feed.result = { success: false, error: 'Failed to load notifications' };
    const load = await loadWelcome();
    expect(load.kind === 'ready' && load.data.news).toMatchObject({ failed: true, items: [] });
    expect(logServer).toHaveBeenCalledWith('auth', 'welcome.notifications', expect.any(Error), 'golf_auth');
  });

  it('CH-15303 keeps going, with the greeting alone, when the name lookup errors', async () => {
    tables.golf_coaches = { data: null, error: { message: 'boom' } };
    tables.golf_players = { data: null, error: { message: 'boom' } };
    const load = await loadWelcome();
    expect(load.kind === 'ready' && load.data.name).toEqual({ status: 'anonymous' });
    expect(logServer).toHaveBeenCalledWith('auth', 'welcome.coach', expect.anything(), 'golf_auth');
  });

  it('flags the legacy admin, who is handed to the console', async () => {
    tables.golf_coaches = { data: null, error: null };
    tables.users = { data: { role: 'admin', last_seen: null }, error: null };
    const load = await loadWelcome();
    expect(load.kind === 'ready' && load.data.isAdmin).toBe(true);
    expect(load.kind === 'ready' && load.data.clubhouseDashboard).toBe(false);
  });

  it('folds only when the dashboard is Clubhouse for this person', async () => {
    gate.clubhouse = false;
    const load = await loadWelcome();
    expect(load.kind === 'ready' && load.data.clubhouseDashboard).toBe(false);
  });
});
