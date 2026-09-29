import { LazyMotion, domAnimation } from 'framer-motion';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Shell: every numbered state in docs/clubhouse/catalog/shell.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/golf/dashboard' }));
vi.mock('../lib/fonts', () => ({ clubhouseFontVariables: '' }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
const supabaseTables = vi.hoisted(() => ({ current: {} as Record<string, { data?: unknown; error?: unknown; count?: number }> }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      const res = { data: null, error: null, count: null, ...supabaseTables.current[table] };
      const chain: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'gte', 'is', 'order', 'limit', 'in']) chain[k] = () => chain;
      chain.maybeSingle = () => Promise.resolve(res);
      chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, bad);
      return chain;
    },
  }),
}));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({ notificationsUnread: 0, calendarNotifications: 0, refetch: vi.fn() }) }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));

import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import { ToastProvider } from '../ui/Toast';
import { InlineNotice, RouteErrorView, type RouteErrorKind } from '../ui/Notices';
import { Bell, BellSourceProvider, type ChBellApi } from '../shell/Bell';
import { NotRebuilt } from '../shell/NotRebuilt';
import { OfflineBanner } from '../shell/OfflineBanner';
import { CH_SLOW_SAVE_AFTER, useAction } from '../lib/use-action';
import { loadClubhouseShell, type ChShellData } from '../data/shell';
import { ClubhouseFrame } from '../shell/ClubhouseFrame';
import { Sidebar } from '../shell/Sidebar';
import { TabBar } from '../shell/TabBar';
import type { GolfUserData } from '@/contexts/golf-user-context';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}

function wrap(node: React.ReactNode) {
  return render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>,
  );
}

const item = (over: Partial<UnifiedNotificationItem> = {}): UnifiedNotificationItem => ({
  id: 'n1',
  source: 'notifications',
  category: 'messages',
  title: 'Ava in Varsity team',
  body: 'Bus leaves at 6:15.',
  action_url: '/golf/dashboard/messages',
  created_at: new Date().toISOString(),
  read_at: null,
  ...over,
});

function bell(api: Partial<ChBellApi>) {
  const full: ChBellApi = {
    unread: 1,
    load: vi.fn(() => Promise.resolve({ success: true, data: { items: [item()] } })),
    markRead: vi.fn(() => Promise.resolve()),
    markAll: vi.fn(() => Promise.resolve({ success: true })),
    refetchCount: vi.fn(),
    ...api,
  };
  wrap(
    <BellSourceProvider api={full}>
      <Bell />
    </BellSourceProvider>,
  );
  return full;
}

beforeEach(() => hapticSpy.mockClear());

describe('Shell · bell', () => {
  it('CH-1001 mark all read fails', async () => {
    const user = userEvent.setup();
    bell({ markAll: vi.fn(() => Promise.resolve({ success: false, error: 'nope' })) });
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    await user.click(await screen.findByRole('button', { name: 'Mark all read' }));
    await expectCode('CH-1001', /mark your notifications read/);
  });

  it('CH-1804 an error toast is an alert inside a polite live region', async () => {
    const user = userEvent.setup();
    bell({ markAll: vi.fn(() => Promise.resolve({ success: false, error: 'nope' })) });
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    await user.click(await screen.findByRole('button', { name: 'Mark all read' }));
    await expectCode('CH-1001');
    expect(code('CH-1001')!.closest('[role="alert"]')).not.toBeNull();
    expect(document.querySelector('.ch-toasts')!.getAttribute('aria-live')).toBe('polite');
  });

  it('CH-1201 the list does not load', async () => {
    const user = userEvent.setup();
    bell({ load: vi.fn(() => Promise.resolve({ success: false, error: 'nope' })) });
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    await expectCode('CH-1201', /Notifications didn't load/);
  });

  it('CH-1302 nothing to show', async () => {
    const user = userEvent.setup();
    bell({ unread: 0, load: vi.fn(() => Promise.resolve({ success: true, data: { items: [] } })) });
    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    await expectCode('CH-1302', /all caught up/);
  });

  it('CH-1303 the filter has nothing after a refresh', async () => {
    const user = userEvent.setup();
    const two = [item(), item({ id: 'n2', category: 'events', title: 'Practice moved' })];
    const load = vi
      .fn()
      .mockResolvedValueOnce({ success: true, data: { items: two } })
      .mockResolvedValue({ success: true, data: { items: [item()] } });
    bell({ load });
    const btn = screen.getByRole('button', { name: /Notifications/ });
    await user.click(btn);
    await user.click(await screen.findByRole('button', { name: 'Show all' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Events' }));
    expect(screen.getByText('Practice moved')).toBeTruthy();
    await user.click(btn);
    await user.click(btn);
    await expectCode('CH-1303', /Nothing of this kind/);
  });

  it('CH-1401 loading shows skeleton rows', async () => {
    const user = userEvent.setup();
    bell({ load: vi.fn(() => new Promise<never>(() => {})) });
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    await expectCode('CH-1401');
    expect(code('CH-1401')!.getAttribute('aria-busy')).toBe('true');
  });
});

describe('Shell · page states', () => {
  it.each([
    ['chunk', 'CH-1202', /newer version/],
    ['stale-action', 'CH-1203', /out of date/],
    ['transient', 'CH-1204', /slow to respond/],
    ['load', 'CH-1205', /didn.t finish loading/],
    ['unknown', 'CH-1206', /Something went wrong/],
  ] as const)('%s → %s', async (kind, c, text) => {
    wrap(<RouteErrorView kind={kind as RouteErrorKind} isRetrying={false} retryCount={0} onRetry={vi.fn()} homePath="/golf/dashboard" />);
    await expectCode(c, text);
  });

  it('CH-1301 a page that is not rebuilt', async () => {
    wrap(<NotRebuilt label="Rounds" />);
    await expectCode('CH-1301', /Rounds hasn.t been rebuilt yet/);
  });
});

describe('Shell · network', () => {
  const setOnline = (v: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => v });
  afterEach(() => {
    setOnline(true);
    vi.useRealTimers();
  });

  it('CH-1901 the offline banner comes and goes', async () => {
    wrap(<OfflineBanner />);
    expect(code('CH-1901')).toBeNull();
    setOnline(false);
    act(() => void window.dispatchEvent(new Event('offline')));
    await expectCode('CH-1901', /You're offline/);
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    setOnline(true);
    act(() => void window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(code('CH-1901')).toBeNull());
  });

  function Saver({ fn }: { fn: () => Promise<{ success: boolean }> }) {
    const a = useAction('test.save', fn, { done: 'Saved', failed: "Couldn't save your profile", code: 'CH-8001' });
    return (
      <button type="button" onClick={() => void a.run()}>
        Save
      </button>
    );
  }

  it('CH-1902 a slow save says so once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolve: (v: { success: boolean }) => void = () => {};
    wrap(<Saver fn={() => new Promise((r) => (resolve = r))} />);
    act(() => screen.getByRole('button', { name: 'Save' }).click());
    await act(async () => void vi.advanceTimersByTime(CH_SLOW_SAVE_AFTER + 10));
    await expectCode('CH-1902', /Still saving/);
    await act(async () => resolve({ success: true }));
  });

  it('CH-1905 Try again while offline says so instead of failing again', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    wrap(<InlineNotice code="CH-2201" title="This week's schedule didn't load." onRetry={retry} />);
    setOnline(false);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await expectCode('CH-1905', /You're offline/);
    expect(retry).not.toHaveBeenCalled();
    expect(hapticSpy).toHaveBeenCalledWith('warning');
    setOnline(true);
    act(() => void window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(code('CH-1905')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalled();
  });

  it('CH-1903 a save while offline is refused and nothing is sent', async () => {
    setOnline(false);
    const fn = vi.fn(() => Promise.resolve({ success: true }));
    wrap(<Saver fn={fn} />);
    act(() => screen.getByRole('button', { name: 'Save' }).click());
    await expectCode('CH-1903', /you're offline/);
    expect(fn).not.toHaveBeenCalled();
  });
});

const coach = { role: 'coach', name: 'Maya Reyes', teamName: 'Varsity' } as unknown as GolfUserData;
const upcoming = { id: 'e1', title: 'Pinehurst qualifier', start_time: new Date(Date.now() + 2 * 86_400_000).toISOString(), all_day: false, location: 'Pinehurst' };

describe('Shell · sidebar data', () => {
  beforeEach(() => {
    logServer.mockClear();
    supabaseTables.current = {};
  });

  it('CH-1207 the next event does not load: the card hides and the failure is logged', async () => {
    supabaseTables.current = { golf_events: { error: { message: 'boom' } }, golf_team_join_requests: { count: 2 } };
    const shell = await loadClubhouseShell('t1');
    expect(shell.nextEvent).toBeNull();
    expect(logServer).toHaveBeenCalledWith('shell', 'nextEvent', expect.anything(), 'calendar');
    wrap(<Sidebar userData={coach} shell={shell} pathname="/golf/dashboard" />);
    expect(document.querySelector('.ch-next')).toBeNull();
  });

  it('CH-1208 join requests do not load: the Roster badge hides instead of saying zero', async () => {
    supabaseTables.current = { golf_events: { data: null }, golf_team_join_requests: { error: { message: 'boom' } } };
    const shell = await loadClubhouseShell('t1');
    expect(shell.pendingJoinRequests).toBeNull();
    expect(logServer).toHaveBeenCalledWith('shell', 'joinRequests', expect.anything(), 'teams');
    wrap(<Sidebar userData={coach} shell={shell} pathname="/golf/dashboard" />);
    expect(screen.getByRole('link', { name: 'Roster' }).querySelector('.ch-navitem__count')).toBeNull();
  });

  it('CH-1304 nothing upcoming: no card; with one, the card shows who has confirmed', async () => {
    const none = await loadClubhouseShell('t1');
    expect(none.nextEvent).toBeNull();
    supabaseTables.current = {
      golf_events: { data: upcoming },
      golf_event_attendance: { data: [{ status: 'accepted' }, { status: 'accepted' }, { status: 'pending' }] },
    };
    const shell = await loadClubhouseShell('t1');
    wrap(<Sidebar userData={coach} shell={shell} pathname="/golf/dashboard" />);
    expect(document.querySelector('.ch-next')!.textContent).toMatch(/2 of 3 confirmed/);
  });
});

describe('Shell · navigation and accessibility', () => {
  const shell: ChShellData = { nextEvent: null, pendingJoinRequests: 2 };

  it('CH-1801 the first Tab reaches Skip to content, which lands on the page', async () => {
    const user = userEvent.setup();
    render(
      <ClubhouseFrame userData={coach} shell={shell} pathname="/golf/dashboard" forceRebuilt>
        <p>Page body</p>
      </ClubhouseFrame>,
    );
    await user.tab();
    expect(document.activeElement).toBe(code('CH-1801'));
    expect(code('CH-1801')!.getAttribute('href')).toBe('#ch-content');
    expect(document.getElementById('ch-content')!.textContent).toMatch(/Page body/);
    expect(document.getElementById('ch-content')!.getAttribute('tabindex')).toBe('-1');
  });

  it('CH-1802 the More sheet takes focus, keeps Tab inside, and gives it back on Esc', async () => {
    const user = userEvent.setup();
    wrap(<TabBar pathname="/golf/dashboard" shell={shell} role="coach" />);
    const more = screen.getByRole('button', { name: 'More' });
    await user.click(more);
    await expectCode('CH-1802');
    const sheet = code('CH-1802')!;
    await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
    const focusables = sheet.querySelectorAll<HTMLElement>('a, button');
    focusables[focusables.length - 1]!.focus();
    await user.tab();
    expect(document.activeElement).toBe(focusables[0]);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement).toBe(more));
  });

  it('CH-1803 the current page is marked in the navigation, and landmarks are named', () => {
    wrap(<Sidebar userData={coach} shell={shell} pathname="/golf/dashboard/roster" />);
    expect(screen.getByRole('link', { name: /Roster/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeTruthy();
  });

  it('CH-1701 changing tabs ticks; the current tab does not', async () => {
    const user = userEvent.setup();
    wrap(<TabBar pathname="/golf/dashboard" shell={shell} role="coach" />);
    const tabs = screen.getAllByRole('link');
    const current = tabs.find((t) => t.getAttribute('aria-current') === 'page')!;
    const other = tabs.find((t) => t !== current)!;
    other.addEventListener('click', (e) => e.preventDefault());
    current.addEventListener('click', (e) => e.preventDefault());
    await user.click(current);
    expect(hapticSpy).not.toHaveBeenCalled();
    await user.click(other);
    expect(hapticSpy).toHaveBeenCalledWith('select');
  });

  it('CH-1702 CH-1703 a save lands with a commit tap; a failure with the error pattern', async () => {
    function Two() {
      const ok = useAction('t.ok', () => Promise.resolve({ success: true }), { done: 'Saved', failed: 'Nope', code: 'CH-8001' });
      const bad = useAction('t.bad', () => Promise.resolve({ success: false }), { done: 'Saved', failed: 'Nope', code: 'CH-8001' });
      return (
        <>
          <button type="button" onClick={() => void ok.run()}>ok</button>
          <button type="button" onClick={() => void bad.run()}>bad</button>
        </>
      );
    }
    const user = userEvent.setup();
    wrap(<Two />);
    await user.click(screen.getByRole('button', { name: 'ok' }));
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledWith('commit'));
    await user.click(screen.getByRole('button', { name: 'bad' }));
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledWith('error'));
  });
});
