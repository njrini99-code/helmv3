import { LazyMotion, domAnimation } from 'framer-motion';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
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
const badgeState = vi.hoisted(() => ({ messages: 0 }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({ notificationsUnread: 0, calendarNotifications: 0, messages: badgeState.messages, refetch: vi.fn() }) }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));
const signOutSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/sign-out', () => ({ chSignOut: signOutSpy }));

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
import { PhoneScreen } from '../shell/PhoneScreen';
import { PhoneTop, usePhoneStackHistory, usePhoneTabsHidden } from '../shell/phone-chrome';
import { PhoneBar } from '../ui/PhoneBar';
import { Modal } from '../ui/Modal';
import './dialog-polyfill';
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

  it('CH-1811 on the phone the bell is a modal sheet: focus moves in, Tab stays inside, Close gives focus back', async () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
    try {
      const user = userEvent.setup();
      bell({});
      const trigger = screen.getByRole('button', { name: /Notifications/ });
      await user.click(trigger);
      await expectCode('CH-1811');
      const sheet = code('CH-1811') as HTMLElement;
      expect(sheet.getAttribute('role')).toBe('dialog');
      expect(sheet.getAttribute('aria-modal')).toBe('true');
      expect(sheet.classList.contains('ch-popover')).toBe(false);
      await within(sheet).findByText('Ava in Varsity team');
      await waitFor(() => expect(sheet.contains(document.activeElement)).toBe(true));
      const focusables = sheet.querySelectorAll<HTMLElement>('button:not(:disabled)');
      focusables[focusables.length - 1]!.focus();
      await user.tab();
      expect(document.activeElement).toBe(focusables[0]);
      await user.click(within(sheet).getByRole('button', { name: 'Close' }));
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(trigger);
    } finally {
      window.matchMedia = real;
    }
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

  it('D-66 10802 the sidebar follows v2 gh-nav.js for each role, sections in order', () => {
    const shell: ChShellData = { nextEvent: null, pendingJoinRequests: null };
    const read = () =>
      [...document.querySelectorAll('.ch-nav__group')].map((g) => [
        g.querySelector('.ch-nav__section')?.textContent ?? '',
        [...g.querySelectorAll('a')].map((a) => a.textContent?.replace(/\d+$/, '').trim()),
      ]);
    const { unmount } = wrap(<Sidebar userData={coach} shell={shell} pathname="/golf/dashboard" />);
    expect(read()).toEqual([
      ['', ['Home', 'CoachHelm', 'Calendar', 'Team Hub', 'Messages']],
      ['Team', ['Roster', 'Stats', 'Qualifiers']],
    ]);
    unmount();
    const player = { role: 'player', name: 'Theo Marchetti', teamName: 'Varsity' } as unknown as GolfUserData;
    wrap(<Sidebar userData={player} shell={shell} pathname="/golf/dashboard" />);
    expect(read()).toEqual([
      ['', ['Home', 'CoachHelm', 'Calendar', 'Team Hub', 'Messages']],
      ['My game', ['Rounds', 'My stats', 'Qualifiers']],
      ['School', ['Classes']],
    ]);
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

  it('CH-1802 a More sheet row with a count is named with a space between its parts ("Messages 3 new")', async () => {
    const user = userEvent.setup();
    badgeState.messages = 3;
    wrap(<TabBar pathname="/golf/dashboard" shell={shell} role="coach" />);
    await user.click(screen.getByRole('button', { name: /^More/ }));
    await expectCode('CH-1802');
    expect(within(code('CH-1802') as HTMLElement).getByRole('link', { name: 'Messages 3 new' })).toBeTruthy();
    badgeState.messages = 0;
  });

  it('CH-1802 the v2 More sheet: who you are (to Settings), the next event under Calendar, then Settings, Help and Sign out', async () => {
    const user = userEvent.setup();
    const withEvent = { ...shell, nextEvent: { id: 'e1', title: 'Pinehurst qualifier', whenLabel: 'Thursday', metaLabel: 'Thu, Oct 16', ready: null } };
    wrap(<TabBar pathname="/golf/dashboard" shell={withEvent} role="player" user={{ name: 'Maya Reyes', teamName: 'Varsity' }} />);
    await user.click(screen.getByRole('button', { name: /^More/ }));
    const sheet = (await screen.findByRole('dialog', { name: 'More' })) as HTMLElement;
    expect(within(sheet).getByRole('link', { name: /^Maya Reyes Player · Varsity/ }).getAttribute('href')).toBe('/golf/dashboard/settings');
    expect(within(sheet).getByRole('link', { name: 'Calendar Thursday · Pinehurst qualifier' })).toBeTruthy();
    expect(within(sheet).getByRole('link', { name: 'Help' }).getAttribute('href')).toBe('/golf/dashboard/settings#set-help');
    signOutSpy.mockResolvedValueOnce(undefined);
    await user.click(within(sheet).getByRole('button', { name: 'Sign out' }));
    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });

  it('CH-1002 a sign-out that fails says you are still signed in, with Retry', async () => {
    const user = userEvent.setup();
    signOutSpy.mockReset();
    signOutSpy.mockRejectedValueOnce(new Error('network'));
    wrap(<TabBar pathname="/golf/dashboard" shell={shell} role="player" user={{ name: 'Theo Marchetti' }} />);
    await user.click(screen.getByRole('button', { name: /^More/ }));
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await expectCode('CH-1002', /Couldn't sign out/);
    expect(hapticSpy).toHaveBeenCalledWith('error');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
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

  describe('CH-1611 a phone sheet follows the finger', () => {
    // Down at y=100, then to 100 + `to`. A pause before letting go, so the release is not a flick.
    const drag = async (handle: HTMLElement, sheet: HTMLElement, to: number) => {
      act(() => {
        handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 100, button: 0 }));
        window.dispatchEvent(new MouseEvent('pointermove', { clientY: 100 + to }));
      });
      expect(sheet.style.translate).toBe(`0 ${to}px`);
      await new Promise((r) => setTimeout(r, 20));
      act(() => {
        window.dispatchEvent(new MouseEvent('pointermove', { clientY: 100 + to }));
        window.dispatchEvent(new MouseEvent('pointerup', { clientY: 100 + to }));
      });
    };

    it('the More sheet springs back short of 80px, and closes past it with the medium settle (commit, D-70)', async () => {
      const user = userEvent.setup();
      wrap(<TabBar pathname="/golf/dashboard" shell={shell} role="coach" />);
      const more = screen.getByRole('button', { name: 'More' });
      await user.click(more);
      await expectCode('CH-1802');
      const sheet = code('CH-1802') as HTMLElement;
      const head = sheet.querySelector('.ch-more__head') as HTMLElement;
      hapticSpy.mockClear();
      await drag(head, sheet, 40);
      expect(sheet.style.translate).toBe('');
      expect(more.getAttribute('aria-expanded')).toBe('true');
      expect(hapticSpy).not.toHaveBeenCalled();
      await drag(head, sheet, 120);
      expect(hapticSpy).toHaveBeenCalledWith('commit');
      // Closed; the sheet itself leaves with its exit animation.
      expect(more.getAttribute('aria-expanded')).toBe('false');
    });

    it('a Modal is a sheet on the phone: its header drags it shut, its Close button stays a button', async () => {
      const real = window.matchMedia;
      window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
      try {
        const onCloseSpy = vi.fn();
        const Harness = () => {
          const [open, setOpen] = useState(true);
          return (
            <Modal
              open={open}
              onClose={() => {
                onCloseSpy();
                setOpen(false);
              }}
              title="Requests"
            >
              Body
            </Modal>
          );
        };
        wrap(<Harness />);
        const dialog = document.querySelector('dialog.ch-modal') as HTMLElement;
        const head = dialog.querySelector('.ch-modal__head') as HTMLElement;
        const close = screen.getByRole('button', { name: 'Close' });
        act(() => {
          close.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 100, button: 0 }));
          window.dispatchEvent(new MouseEvent('pointermove', { clientY: 200 }));
        });
        expect(dialog.style.translate).toBe('');
        act(() => {
          window.dispatchEvent(new MouseEvent('pointerup', { clientY: 200 }));
        });
        await drag(head, dialog, 30);
        expect(onCloseSpy).not.toHaveBeenCalled();
        await drag(head, dialog, 100);
        expect(onCloseSpy).toHaveBeenCalledTimes(1);
        expect(hapticSpy).toHaveBeenCalledWith('commit');
        await waitFor(() => expect(dialog.hasAttribute('open')).toBe(false));
      } finally {
        window.matchMedia = real;
      }
    });

    it('the bell sheet drags shut from its header', async () => {
      const real = window.matchMedia;
      window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' })) as typeof window.matchMedia;
      try {
        const user = userEvent.setup();
        bell({});
        const trigger = screen.getByRole('button', { name: /Notifications/ });
        await user.click(trigger);
        await expectCode('CH-1811');
        const sheet = code('CH-1811') as HTMLElement;
        hapticSpy.mockClear();
        await drag(sheet.querySelector('.ch-bellp__shead') as HTMLElement, sheet, 120);
        expect(hapticSpy).toHaveBeenCalledWith('commit');
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
      } finally {
        window.matchMedia = real;
      }
    });

    it('with reduced motion a sheet does not drag', async () => {
      const real = window.matchMedia;
      window.matchMedia = ((q: string) => ({ ...real(q), matches: q === '(max-width: 820px)' || q === '(prefers-reduced-motion: reduce)' })) as typeof window.matchMedia;
      try {
        const onClose = vi.fn();
        wrap(
          <Modal open onClose={onClose} title="Requests">
            Body
          </Modal>,
        );
        const dialog = document.querySelector('dialog.ch-modal') as HTMLElement;
        const head = dialog.querySelector('.ch-modal__head') as HTMLElement;
        act(() => {
          head.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: 100, button: 0 }));
          window.dispatchEvent(new MouseEvent('pointermove', { clientY: 300 }));
          window.dispatchEvent(new MouseEvent('pointerup', { clientY: 300 }));
        });
        expect(dialog.style.translate).toBe('');
        expect(onClose).not.toHaveBeenCalled();
      } finally {
        window.matchMedia = real;
      }
    });
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

  it('CH-1702 CH-1703 a save lands with a success tap (D-70); a failure with the error pattern', async () => {
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
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledWith('success'));
    await user.click(screen.getByRole('button', { name: 'bad' }));
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledWith('error'));
  });
});

describe('Shell · phone chrome', () => {
  const shell: ChShellData = { nextEvent: null, pendingJoinRequests: 2 };
  afterEach(() => {
    badgeState.messages = 0;
  });

  it('CH-1808 11901 each role gets its own phone tabs, and More carries the Messages unread count', () => {
    badgeState.messages = 3;
    const { unmount } = wrap(<TabBar pathname="/golf/dashboard" shell={shell} role="coach" />);
    const bar = code('CH-1808')!;
    const names = [...bar.querySelectorAll('a, button')].map((el) => el.getAttribute('aria-label') ?? el.querySelector('.ch-tab__label')!.textContent);
    // D-66 (v2 GH.tabs): coach Home, CoachHelm, Calendar, Stats, More.
    expect(names).toEqual(['Home', 'CoachHelm', 'Calendar', 'Stats', 'More, 3 unread messages']);
    unmount();
    badgeState.messages = 0;
    // Player: Home, CoachHelm, Rounds, Team Hub, More.
    wrap(<TabBar pathname="/golf/dashboard/team-hub" shell={shell} role="player" />);
    const labels = [...code('CH-1808')!.querySelectorAll('.ch-tab__label')].map((el) => el.textContent);
    expect(labels).toEqual(['Home', 'CoachHelm', 'Rounds', 'Team Hub', 'More']);
    expect(screen.getByRole('link', { name: /Team Hub/ }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy();
  });

  it('CH-1809 a pushed screen takes focus on its title and makes the shell chrome inert until it closes', async () => {
    function Page({ open }: { open: boolean }) {
      return open ? (
        <PhoneScreen labelledBy="t-title">
          <PhoneBar title="Varsity team" titleId="t-title" back={{ onBack: () => {}, ariaLabel: 'Back to Messages' }} />
        </PhoneScreen>
      ) : (
        <p>Inbox</p>
      );
    }
    const { rerender } = render(
      <ClubhouseFrame userData={coach} shell={shell} pathname="/golf/dashboard/messages" forceRebuilt>
        <Page open={false} />
      </ClubhouseFrame>,
    );
    expect(document.querySelector('.ch-tabbar')!.hasAttribute('inert')).toBe(false);
    rerender(
      <ClubhouseFrame userData={coach} shell={shell} pathname="/golf/dashboard/messages" forceRebuilt>
        <Page open />
      </ClubhouseFrame>,
    );
    const screenEl = screen.getByRole('region', { name: 'Varsity team' });
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('t-title')));
    expect(screenEl.contains(document.activeElement)).toBe(true);
    expect(document.querySelector('.ch-tabbar')!.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('.ch-topbar')!.hasAttribute('inert')).toBe(true);
    expect(document.querySelector('.ch-root')!.hasAttribute('data-phone-immersive')).toBe(true);
    rerender(
      <ClubhouseFrame userData={coach} shell={shell} pathname="/golf/dashboard/messages" forceRebuilt>
        <Page open={false} />
      </ClubhouseFrame>,
    );
    await waitFor(() => expect(document.querySelector('.ch-tabbar')!.hasAttribute('inert')).toBe(false));
  });

  it('CH-1810 the phone top bar names the page, and a page top swaps the bell for a named back link', async () => {
    const back = vi.fn();
    const { rerender } = render(
      <ClubhouseFrame userData={coach} shell={shell} pathname="/golf/dashboard/roster" forceRebuilt>
        <p>Roster</p>
      </ClubhouseFrame>,
    );
    const bar = document.querySelector('.ch-topbar')!;
    expect(bar.getAttribute('data-phone')).toBe('root');
    expect(bar.querySelector('.ch-topbar__ptitle')!.textContent).toBe('Roster');
    rerender(
      <ClubhouseFrame userData={coach} shell={shell} pathname="/golf/dashboard/roster" forceRebuilt>
        <PhoneTop title="Roster" back={{ label: 'More', onBack: back }} />
      </ClubhouseFrame>,
    );
    await waitFor(() => expect(bar.getAttribute('data-phone')).toBe('page'));
    const link = screen.getByRole('button', { name: 'Back to More' });
    expect(bar.contains(link)).toBe(true);
    await userEvent.setup().click(link);
    expect(back).toHaveBeenCalled();
  });
});

describe('Shell · phone form', () => {
  it('11901 a full-page form hides the phone tab bar while it is open (usePhoneTabsHidden)', () => {
    function Form({ on }: { on: boolean }) {
      usePhoneTabsHidden(on);
      return <p>Form</p>;
    }
    const shell: ChShellData = { nextEvent: null, pendingJoinRequests: null };
    const { rerender } = render(
      <ClubhouseFrame userData={coach} shell={shell} pathname="/golf/dashboard/qualifiers" forceRebuilt>
        <Form on />
      </ClubhouseFrame>,
    );
    expect(document.querySelector('.ch-root')!.hasAttribute('data-phone-notabs')).toBe(true);
    rerender(
      <ClubhouseFrame userData={coach} shell={shell} pathname="/golf/dashboard/qualifiers" forceRebuilt>
        <Form on={false} />
      </ClubhouseFrame>,
    );
    expect(document.querySelector('.ch-root')!.hasAttribute('data-phone-notabs')).toBe(false);
  });
});

describe('Shell · phone back', () => {
  it('CH-1906 the back gesture pops the top pushed screen; closing from the UI takes its entry back off', async () => {
    const start = window.history.length;
    let setDepth: (n: number) => void = () => {};
    function Stack() {
      const [depth, set] = useState(0);
      setDepth = set;
      usePhoneStackHistory(depth, (level) => set(level));
      return <p data-testid="depth">{depth}</p>;
    }
    render(<Stack />);
    act(() => setDepth(1));
    act(() => setDepth(2));
    expect(window.history.length).toBe(start + 2);
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByTestId('depth').textContent).toBe('1'));
    act(() => setDepth(0));
    await waitFor(() => expect((window.history.state as { chPhone?: number } | null)?.chPhone ?? 0).toBe(0));
    expect(screen.getByTestId('depth').textContent).toBe('0');
  });
});

/** P001 behaviour contracts with no catalog row (config/clubhouse/bridge-contracts.json, D-69). */
describe('Shell · behaviour contracts (P001)', () => {
  const shell: ChShellData = { nextEvent: null, pendingJoinRequests: 2 };
  const player = { role: 'player', name: 'Theo Marchetti', teamName: 'Varsity' } as unknown as GolfUserData;

  it('10102 the frame is the sidebar, the top bar, the page and the phone tab bar; 10802 a route not rebuilt for the role shows the notice, never the page', () => {
    const { unmount } = render(
      <ClubhouseFrame userData={coach} shell={shell} pathname="/golf/dashboard/roster">
        <p>Roster body</p>
      </ClubhouseFrame>,
    );
    expect(screen.getByRole('complementary', { name: 'Sidebar' })).toBeTruthy();
    expect(document.querySelector('.ch-topbar')).not.toBeNull();
    expect(code('CH-1808')).not.toBeNull();
    expect(document.getElementById('ch-content')!.textContent).toMatch(/Roster body/);
    unmount();
    // Roster is rebuilt for coaches only: a player on the same address gets the notice.
    render(
      <ClubhouseFrame userData={player} shell={shell} pathname="/golf/dashboard/roster">
        <p>Roster body</p>
      </ClubhouseFrame>,
    );
    expect(screen.queryByText('Roster body')).toBeNull();
    expect(code('CH-1301')).not.toBeNull();
  });

  it('10301 the bell reads its list again every time it opens', async () => {
    const user = userEvent.setup();
    const api = bell({});
    const button = screen.getByRole('button', { name: /Notifications/ });
    await user.click(button);
    await screen.findByText('Ava in Varsity team');
    await user.keyboard('{Escape}');
    await user.click(button);
    await waitFor(() => expect(api.load).toHaveBeenCalledTimes(2));
  });

  it('11301 Mark all read clears the rows at once, and puts them back when the write fails', async () => {
    const user = userEvent.setup();
    let fail: (v: { success: false; error: string }) => void = () => {};
    bell({ markAll: vi.fn(() => new Promise<{ success: false; error: string }>((r) => (fail = r))) });
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    await screen.findByText('Ava in Varsity team');
    expect(document.querySelectorAll('.ch-bellp__row.is-unread')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(document.querySelectorAll('.ch-bellp__row.is-unread')).toHaveLength(0);
    await act(async () => fail({ success: false, error: 'nope' }));
    await expectCode('CH-1001');
    expect(document.querySelectorAll('.ch-bellp__row.is-unread')).toHaveLength(1);
  });

  function Saver({ fn, done = 'Profile saved' }: { fn: () => Promise<{ success: boolean; error?: string }>; done?: string }) {
    const a = useAction('test.save', fn, { done, failed: "Couldn't save your profile", code: 'CH-8001' });
    return (
      <button type="button" onClick={() => void a.run()}>
        Save
      </button>
    );
  }

  it('10901 a change that lands names itself in a toast with the success haptic; an empty done line shows no toast', async () => {
    const user = userEvent.setup();
    const { unmount } = wrap(<Saver fn={() => Promise.resolve({ success: true })} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('Profile saved');
    expect(hapticSpy).toHaveBeenCalledWith('success');
    unmount();
    wrap(<Saver fn={() => Promise.resolve({ success: true })} done="" />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(hapticSpy).toHaveBeenCalledTimes(2));
    expect(document.querySelector('.ch-toast')).toBeNull();
  });

  it('11402 Retry on an error toast runs the same action again', async () => {
    const user = userEvent.setup();
    const fn = vi.fn().mockResolvedValueOnce({ success: false, error: 'nope' }).mockResolvedValueOnce({ success: true });
    wrap(<Saver fn={fn} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await expectCode('CH-8001', /Couldn't save your profile/);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('Profile saved');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('11401 a crashed page offers Try again (Reload after an update), locks it while retrying, and counts the tries', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const view = (props: { kind: RouteErrorKind; isRetrying: boolean; retryCount: number }) => (
      <LazyMotion features={domAnimation}>
        <div className="ch-root" data-ui="clubhouse">
          <RouteErrorView {...props} onRetry={onRetry} homePath="/golf/dashboard" />
        </div>
      </LazyMotion>
    );
    const { rerender } = render(view({ kind: 'unknown', isRetrying: false, retryCount: 0 }));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Back to Home' }).getAttribute('href')).toBe('/golf/dashboard');
    rerender(view({ kind: 'unknown', isRetrying: true, retryCount: 1 }));
    expect((screen.getByRole('button', { name: 'Trying again' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(view({ kind: 'chunk', isRetrying: false, retryCount: 2 }));
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.getByText('Tried again 2 times.')).toBeTruthy();
  });

  it('12301 a thrown action is reported with its surface; a refused one is reported at low severity', async () => {
    const { chReport } = await import('../lib/track');
    const report = vi.mocked(chReport);
    report.mockClear();
    const user = userEvent.setup();
    const { unmount } = wrap(<Saver fn={() => Promise.reject(new Error('boom'))} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await expectCode('CH-8001');
    expect(report).toHaveBeenCalledWith(expect.any(Error), { surface: 'test', action: 'test.save' });
    unmount();
    report.mockClear();
    wrap(<Saver fn={() => Promise.resolve({ success: false, error: 'nope' })} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(report).toHaveBeenCalledWith(expect.any(Error), { surface: 'test', action: 'test.save', severity: 'low' }));
  });
});
