import { LazyMotion, domAnimation } from 'motion/react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * P001: a stored link to the screen already open, naming another item (the bell's `?conversation=` while Messages is
 * open, `?event=` on Calendar), mounts that screen again once its address arrives, so the item opens as it does from
 * any other screen. Before, the route kept its pathname key, the screen had read its item on mount, and nothing opened.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
const routerSpy = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => routerSpy, usePathname: () => '/golf/dashboard/messages' }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({ notificationsUnread: 1, calendarNotifications: 0, messages: 0, announcements: 0, tasks: 0, travel: 0, refetch: vi.fn() }) }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));

import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import { PUSH_NAVIGATE_EVENT } from '@/lib/utils/push-registration';
import { Bell, BellSourceProvider, type ChBellApi } from '../shell/Bell';
import { addressKey, armRelink, CH_RELINK_EVENT, relinkFor, useRelinkEpoch } from '../shell/relink';
import { ToastProvider } from '../ui/Toast';

afterEach(() => routerSpy.push.mockClear());

describe('relinkFor', () => {
  it('compares addresses by their query, in any order', () => {
    expect(addressKey('/golf/dashboard/calendar/', 'event=e1&date=2026-10-20')).toBe(addressKey('/golf/dashboard/calendar', 'event=e1&date=2026-10-20'));
  });

  it('waits for the new address when the same screen gets another item', () => {
    expect(relinkFor('/golf/dashboard/messages?conversation=c2', '/golf/dashboard/messages', 'conversation=c1')).toEqual({
      when: 'arrival',
      key: '/golf/dashboard/messages?conversation=c2',
    });
  });

  it('mounts at once when the link is the address already shown', () => {
    expect(relinkFor('/golf/dashboard/calendar?event=e1', '/golf/dashboard/calendar', 'event=e1')?.when).toBe('now');
  });

  it('leaves alone a link to another screen, and one that names nothing', () => {
    expect(relinkFor('/golf/dashboard/calendar?event=e1', '/golf/dashboard/messages', '')).toBeNull();
    expect(relinkFor('/golf/dashboard/roster', '/golf/dashboard/roster', '')).toBeNull();
  });
});

/** A screen that counts its mounts, keyed the way the frame keys RouteFrame. */
const mounts: string[] = [];
function Screen({ search }: { search: string }) {
  useEffect(() => {
    mounts.push(search);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- a mount, on purpose
  return <p>{search}</p>;
}
function Frame({ pathname, search }: { pathname: string; search: string }) {
  const epoch = useRelinkEpoch(pathname, search);
  return <Screen key={`${pathname}\u0000${epoch}`} search={search} />;
}

describe('useRelinkEpoch', () => {
  it('mounts the screen again when the armed address arrives, and not for its own address changes', () => {
    mounts.length = 0;
    const view = render(<Frame pathname="/golf/dashboard/messages" search="conversation=c1" />);
    // The screen's own move (a tab, a week): no remount.
    view.rerender(<Frame pathname="/golf/dashboard/messages" search="conversation=c1&tab=x" />);
    expect(mounts).toEqual(['conversation=c1']);
    act(() => armRelink('/golf/dashboard/messages?conversation=c2'));
    // Armed, but the new address has not arrived yet: the screen stays.
    expect(mounts).toEqual(['conversation=c1']);
    view.rerender(<Frame pathname="/golf/dashboard/messages" search="conversation=c2" />);
    expect(mounts).toEqual(['conversation=c1', 'conversation=c2']);
  });

  it('a link to the address already shown mounts it at once', () => {
    mounts.length = 0;
    render(<Frame pathname="/golf/dashboard/calendar" search="event=e1" />);
    act(() => armRelink('/golf/dashboard/calendar?event=e1'));
    expect(mounts).toEqual(['event=e1', 'event=e1']);
  });

  it('a wait the address never reaches is dropped when the screen changes', () => {
    mounts.length = 0;
    const view = render(<Frame pathname="/golf/dashboard/messages" search="" />);
    act(() => armRelink('/golf/dashboard/messages?conversation=c2'));
    view.rerender(<Frame pathname="/golf/dashboard/calendar" search="" />);
    view.rerender(<Frame pathname="/golf/dashboard/messages" search="" />);
    // Back on Messages later, its own move to that address is not taken for the old wait.
    view.rerender(<Frame pathname="/golf/dashboard/messages" search="conversation=c2" />);
    expect(mounts).toEqual(['', '', '']);
  });

  it('a tapped push to the open screen is armed too', () => {
    mounts.length = 0;
    const view = render(<Frame pathname="/golf/dashboard/messages" search="" />);
    act(() => {
      window.dispatchEvent(new CustomEvent(PUSH_NAVIGATE_EVENT, { detail: { url: '/golf/dashboard/messages?conversation=c9' }, cancelable: true }));
    });
    view.rerender(<Frame pathname="/golf/dashboard/messages" search="conversation=c9" />);
    expect(mounts).toEqual(['', 'conversation=c9']);
  });
});

describe('Bell', () => {
  const item: UnifiedNotificationItem = {
    id: 'n1',
    source: 'golf_calendar_notifications',
    category: 'messages',
    title: 'Ava',
    body: 'Bus leaves at 6:15.',
    action_url: '/golf/dashboard/messages?conversation=c2',
    created_at: new Date().toISOString(),
    read_at: null,
  };

  function wrap(node: ReactNode) {
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

  it('arms the relink before it pushes a stored link', async () => {
    const user = userEvent.setup();
    const api: ChBellApi = {
      unread: 1,
      load: vi.fn(() => Promise.resolve({ success: true, data: { items: [item] } })),
      markRead: vi.fn(() => Promise.resolve()),
      markAll: vi.fn(() => Promise.resolve({ success: true })),
      refetchCount: vi.fn(),
    };
    const armed: string[] = [];
    const onRelink = (e: Event) => {
      armed.push((e as CustomEvent<string>).detail);
      expect(routerSpy.push).not.toHaveBeenCalled();
    };
    window.addEventListener(CH_RELINK_EVENT, onRelink);
    wrap(
      <BellSourceProvider api={api}>
        <Bell />
      </BellSourceProvider>,
    );
    await user.click(screen.getByRole('button', { name: /Notifications/ }));
    await user.click(await screen.findByRole('button', { name: /Ava/ }));
    window.removeEventListener(CH_RELINK_EVENT, onRelink);
    expect(armed).toEqual(['/golf/dashboard/messages?conversation=c2']);
    expect(routerSpy.push).toHaveBeenCalledWith('/golf/dashboard/messages?conversation=c2');
  });
});
