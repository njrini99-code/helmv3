import { LazyMotion, domAnimation } from 'motion/react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));

import { ConvRow, type ChMessagesApi } from '../MessagesView';
import type { ChConv } from '../model';

const select = vi.fn();
const api = { selectedId: null, select, now: new Date('2026-10-18T12:00:00Z'), timeZone: 'America/New_York', viewer: { userId: 'me' }, directory: [] } as unknown as ChMessagesApi;
const conv: ChConv = { id: 'c1', group: false, title: 'Maya Reyes', subtitle: 'Coach', memberIds: ['u2'], memberCount: 2, unread: 0, lastAt: '2026-10-18T11:00:00Z', lastSenderId: null, lastText: 'See you at 3', creatorId: null };

beforeEach(() => {
  select.mockClear();
  vi.mocked(window.matchMedia).mockImplementation(
    (query: string) => ({ matches: query.includes('hover: hover'), media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList,
  );
});
afterEach(() => cleanup());

const row = () => (
  <LazyMotion features={domAnimation}>
    <div className="ch-root" data-ui="clubhouse">
      <ConvRow api={api} c={conv} />
    </div>
  </LazyMotion>
);

describe('Messages conversation row, right-click', () => {
  it('offers the row\'s actions (owner decision 14), and Open is the same handler as a tap', async () => {
    const user = userEvent.setup();
    render(row());
    fireEvent.contextMenu(screen.getByRole('button', { name: /Maya Reyes/ }), { clientX: 120, clientY: 120 });
    const menu = screen.getByRole('menu', { name: 'Actions for Maya Reyes' });
    // d-messages: Mark as read/unread and Mute join Open; Delete only when the api can delete.
    expect(within(menu).getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Open conversation', 'Mark as unread', 'Mute…']);
    await user.click(within(menu).getByRole('menuitem', { name: 'Open conversation' }));
    expect(select).toHaveBeenCalledWith('c1');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('keeps a tap a tap, and the phone\'s long press its own', async () => {
    const user = userEvent.setup();
    render(row());
    await user.click(screen.getByRole('button', { name: /Maya Reyes/ }));
    expect(select).toHaveBeenCalledWith('c1');
    vi.mocked(window.matchMedia).mockImplementation(() => ({ matches: false, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }) as unknown as MediaQueryList);
    expect(fireEvent.contextMenu(screen.getByRole('button', { name: /Maya Reyes/ }))).toBe(true);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
