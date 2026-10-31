import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Class awareness (P-10), held pushes on the player's side: the Bell's held row (CH-1270, CH-1271) and the pure words behind
 * it. Settings > "Hold during class" (CH-8030, CH-8216) is in settings.test.tsx. The Classes panel's own row is in class-awareness-player.test.tsx
 * (CH-12077, CH-12271).
 */

const hapticSpy = vi.hoisted(() => vi.fn());
vi.mock('../lib/haptics', () => ({ haptic: hapticSpy }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@sentry/nextjs', () => ({ getFeedback: () => undefined, addBreadcrumb: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }), usePathname: () => '/golf/dashboard' }));
vi.mock('@/contexts/notification-badge-context', () => ({ useNotificationBadges: () => ({ notificationsUnread: 0, calendarNotifications: 0, messages: 0, announcements: 0, tasks: 0, travel: 0, refetch: vi.fn() }) }));
vi.mock('@/app/golf/actions/unified-notifications', () => ({ getUnifiedNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }));
const live = vi.hoisted(() => ({
  day: null as import('../data/class-day-shape').ChMyClassDay | null,
  refetchMine: vi.fn(async () => {}),
}));
vi.mock('../lib/use-class-day', () => ({
  useMyClassDay: (opts: { enabled?: boolean } = {}) => ({ day: opts.enabled === false ? null : live.day, status: 'ready', now: Date.parse('2026-10-14T14:30:00Z'), refetch: vi.fn() }),
  refetchMyClassDay: live.refetchMine,
}));
const writes = vi.hoisted(() => ({
  setHold: vi.fn(async () => ({ success: true }) as { success: boolean; error?: string }),
  deliverNow: vi.fn(async () => ({ success: true, data: { released: 2 } }) as { success: boolean; error?: string; data?: { released: number } }),
}));
vi.mock('../screens/classes/class-status-writes', async (orig) => ({
  ...(await orig<object>()),
  createLiveClassStatusWrites: () => writes,
  deliverHeldNow: () => writes.deliverNow(),
}));
const layout = vi.hoisted(() => ({ phone: false }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => layout.phone, CH_PHONE_QUERY: '(max-width: 820px)' }));
import './dialog-polyfill';

import type { UnifiedNotificationItem } from '@/app/golf/actions/unified-notifications-model';
import type { ChMyClassDay } from '../data/class-day-shape';
import { heldLine, pushesRow } from '../screens/classes/panel-model';
import { Bell, BellSourceProvider, type ChBellApi } from '../shell/Bell';
import { ClubhouseMarker } from '../shell/context';
import { ToastProvider } from '../ui/Toast';

const TODAY = '2026-10-14';
const day = (over: Partial<ChMyClassDay> = {}): ChMyClassDay => ({
  on: TODAY,
  teamId: 't1',
  teamTimeZone: 'America/New_York',
  classTimeZone: 'America/New_York',
  term: { id: 't', label: 'Fall 2026', classesStart: '2026-08-24', classesEnd: '2026-12-11', examsEnd: '2026-12-18', timeZone: 'America/New_York', phase: 'classes' },
  settings: { shareStatus: true, holdPushes: true },
  player: null,
  blocks: [],
  untaggedClasses: 0,
  unusableClasses: [],
  held: null,
  fetchedAt: Date.now(),
  ...over,
});
const HELD = { count: 3, releaseAt: '2026-10-14T15:50:00.000Z' };

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);
async function expectCode(c: string, text?: RegExp) {
  await waitFor(() => expect(code(c)).not.toBeNull());
  if (text) expect(code(c)!.textContent).toMatch(text);
}

beforeEach(() => {
  layout.phone = false;
  live.day = day();
  live.refetchMine.mockClear();
  writes.setHold.mockClear().mockResolvedValue({ success: true });
  writes.deliverNow.mockClear().mockResolvedValue({ success: true, data: { released: 2 } });
  hapticSpy.mockClear();
});
afterEach(() => cleanup());

describe('the words', () => {
  it('pushesRow: Held, Not held, Off while sharing is off, and what is waiting', () => {
    expect(pushesRow(day())).toEqual({ value: 'Held', waiting: null });
    expect(pushesRow(day({ settings: { shareStatus: true, holdPushes: false } }))).toEqual({ value: 'Not held', waiting: null });
    expect(pushesRow(day({ settings: { shareStatus: false, holdPushes: true } })).value).toBe('Off while sharing is off');
    expect(pushesRow(day({ held: HELD })).waiting).toBe('3 updates waiting');
    expect(pushesRow(day({ held: { count: 1, releaseAt: null } })).waiting).toBe('1 update waiting');
  });

  it('heldLine: the count and the release time in the class zone; nothing when nothing is held', () => {
    expect(heldLine(day({ held: HELD }), '12')).toBe('3 updates held until 11:50 AM');
    expect(heldLine(day({ held: HELD }), '24')).toBe('3 updates held until 11:50');
    expect(heldLine(day({ held: { count: 1, releaseAt: null } }), '12')).toBe('1 update held');
    expect(heldLine(day(), '12')).toBeNull();
  });
});

describe('Bell: the held row', () => {
  const item: UnifiedNotificationItem = {
    id: 'n1', source: 'golf_calendar_notifications', category: 'messages', title: 'Coach Rivera', body: 'Bus leaves at 6:15.',
    action_url: '/golf/dashboard/messages?conversation=c2', created_at: new Date().toISOString(), read_at: null,
  };
  const api = (): ChBellApi => ({
    unread: 1,
    load: vi.fn(() => Promise.resolve({ success: true, data: { items: [item] } })),
    markRead: vi.fn(() => Promise.resolve()),
    markAll: vi.fn(() => Promise.resolve({ success: true })),
    refetchCount: vi.fn(),
  });
  const show = (role: 'coach' | 'player', aware = true) =>
    render(
      <LazyMotion features={domAnimation}>
        <ToastProvider>
          <ClubhouseMarker role={role} classAwareness={aware}>
            <div className="ch-root" data-ui="clubhouse">
              <BellSourceProvider api={api()}>
                <Bell />
              </BellSourceProvider>
            </div>
          </ClubhouseMarker>
        </ToastProvider>
      </LazyMotion>,
    );
  const open = async () => {
    await userEvent.click(screen.getByRole('button', { name: /Notifications/ }));
    await screen.findByText('Bus leaves at 6:15.');
  };

  it('CH-1271 a player with pushes held sees the count, the release time and Deliver now above the list', async () => {
    live.day = day({ held: HELD });
    show('player');
    await open();
    const row = code('CH-1271') as HTMLElement;
    expect(row.textContent).toContain('3 updates held until 11:50 AM');
    expect(within(row).getByRole('button', { name: 'Deliver now' })).toBeTruthy();
    // The held items are in the list already (the in-app rows are never held): the row lists nothing twice.
    expect(row.textContent).not.toContain('Bus leaves');
  });

  it('Deliver now sends them, ticks, reads Delivered, and goes', async () => {
    live.day = day({ held: HELD });
    show('player');
    await open();
    await userEvent.click(within(code('CH-1271') as HTMLElement).getByRole('button', { name: 'Deliver now' }));
    await waitFor(() => expect(writes.deliverNow).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(code('CH-1271')!.textContent).toContain('Delivered'));
    expect(hapticSpy).toHaveBeenCalledWith('success');
    expect(live.refetchMine).toHaveBeenCalled();
  });

  it('CH-1270 a refused Deliver now says so and keeps the row', async () => {
    live.day = day({ held: HELD });
    writes.deliverNow.mockResolvedValue({ success: false, error: 'nope' });
    show('player');
    await open();
    await userEvent.click(within(code('CH-1271') as HTMLElement).getByRole('button', { name: 'Deliver now' }));
    await expectCode('CH-1270', /Couldn’t deliver them/);
    expect(code('CH-1271')!.textContent).toContain('3 updates held');
  });

  it.each([
    ['nothing is held', 'player', true, day()],
    ['a coach', 'coach', true, day({ held: HELD })],
    ['class awareness is off', 'player', false, day({ held: HELD })],
  ] as const)('draws no row when %s', async (_n, role, aware, d) => {
    live.day = d;
    show(role, aware);
    await open();
    expect(code('CH-1271')).toBeNull();
  });
});
