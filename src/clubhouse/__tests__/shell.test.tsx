import { LazyMotion, domAnimation } from 'framer-motion';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Shell: every numbered state in docs/clubhouse/catalog/shell.md, found by its number. */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({ notificationsUnread: 0, calendarNotifications: 0, refetch: vi.fn() }) }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));

import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import { ToastProvider } from '../ui/Toast';
import { RouteErrorView, type RouteErrorKind } from '../ui/Notices';
import { Bell, BellSourceProvider, type ChBellApi } from '../shell/Bell';
import { NotRebuilt } from '../shell/NotRebuilt';
import { OfflineBanner } from '../shell/OfflineBanner';
import { CH_SLOW_SAVE_AFTER, useAction } from '../lib/use-action';

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

  it('CH-1903 a save while offline is refused and nothing is sent', async () => {
    setOnline(false);
    const fn = vi.fn(() => Promise.resolve({ success: true }));
    wrap(<Saver fn={fn} />);
    act(() => screen.getByRole('button', { name: 'Save' }).click());
    await expectCode('CH-1903', /you're offline/);
    expect(fn).not.toHaveBeenCalled();
  });
});
