import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LazyMotion, domAnimation } from 'motion/react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: false }) }));

import '../../../__tests__/dialog-polyfill';
import { CTX_HOLD_MS } from '../../../ui/ContextMenu';
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

describe('Messages conversation row, Mute (owner decision 14)', () => {
  it('CH-7607 Mute… opens the row\'s mute sheet on that conversation, reading its mute as it opens', async () => {
    const user = userEvent.setup();
    const muteOf = vi.fn(async () => ({ muted: false, until: null }));
    const muteApi = { ...api, muteOf, muteConversation: vi.fn(async () => true) } as unknown as ChMessagesApi;
    render(
      <LazyMotion features={domAnimation}>
        <div className="ch-root" data-ui="clubhouse">
          <ConvRow api={muteApi} c={conv} />
        </div>
      </LazyMotion>,
    );
    fireEvent.contextMenu(screen.getByRole('button', { name: /Maya Reyes/ }), { clientX: 120, clientY: 120 });
    await user.click(within(screen.getByRole('menu', { name: 'Actions for Maya Reyes' })).getByRole('menuitem', { name: 'Mute…' }));
    await waitFor(() => expect(document.querySelector('[data-ch-code="CH-7607"]')).not.toBeNull());
    expect(muteOf).toHaveBeenCalledWith('c1');
  });
});

describe('Messages conversation row, phone (owner decision 14)', () => {
  const setRead = vi.fn(async () => true);
  const phoneApi = { ...api, setRead } as unknown as ChMessagesApi;
  const phoneRow = () => (
    <LazyMotion features={domAnimation}>
      <div className="ch-root" data-ui="clubhouse">
        <ConvRow api={phoneApi} c={conv} phone />
      </div>
    </LazyMotion>
  );
  const rowButton = () => screen.getAllByRole('button', { name: /^(?!Actions for ).*Maya Reyes/ })[0]!;
  const touch = { pointerId: 1, pointerType: 'touch', isPrimary: true };

  // F-0048 (by design): the hidden "Actions for …" control is the screen reader and keyboard path; a finger uses the hold or
  // the swipe. Pin that it stays in the tree, shows when focused, and opens the same sheet with Enter.
  it('the Actions control is reachable without a finger and opens the actions sheet with Enter', async () => {
    const user = userEvent.setup();
    render(phoneRow());
    const actions = screen.getByRole('button', { name: 'Actions for Maya Reyes' });
    expect(actions.parentElement!.classList.contains('ch-sr-only--focusable')).toBe(true);
    actions.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog', { name: /Actions for Maya Reyes|Maya Reyes/ })).toBeTruthy();
    const base = readFileSync(join(process.cwd(), 'src/clubhouse/styles/base.css'), 'utf8');
    expect(base).toMatch(/\.ch-sr-only--focusable:has\(:focus-visible\)\s*\{[^}]*position: static;[^}]*width: auto;/);
  });

  it('a finger held still opens the row\'s actions as a sheet', () => {
    vi.useFakeTimers();
    try {
      render(phoneRow());
      fireEvent.pointerDown(rowButton(), { ...touch, clientX: 100, clientY: 20 });
      act(() => vi.advanceTimersByTime(CTX_HOLD_MS));
      expect(screen.getByRole('dialog', { name: /Actions for Maya Reyes|Maya Reyes/ })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a swipe claimed by the row cancels the long press, though the captured pointer never reaches the row button', () => {
    vi.useFakeTimers();
    try {
      render(phoneRow());
      const button = rowButton();
      const swipe = button.closest('.ch-swipe') as HTMLElement;
      fireEvent.pointerDown(button, { ...touch, clientX: 100, clientY: 20 });
      // Once SwipeRow captures the pointer, move and up go to its root, not the row's button.
      fireEvent.pointerMove(swipe, { ...touch, clientX: 140, clientY: 21 });
      fireEvent.pointerUp(swipe, { ...touch, clientX: 140, clientY: 21 });
      act(() => vi.advanceTimersByTime(CTX_HOLD_MS * 2));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('menu')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
