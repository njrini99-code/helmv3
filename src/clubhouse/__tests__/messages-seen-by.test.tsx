// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import './dialog-polyfill';
import type { ChMsg } from '../screens/messages/model';
import type { ChMessagesApi } from '../screens/messages/MessagesView';
import { SeenByReceipt, SeenBySheet } from '../screens/messages/seen-by';

afterEach(cleanup);

const SENT = '2026-10-24T18:14:00.000Z';
const msg = (over: Partial<ChMsg> = {}): ChMsg => ({
  id: 'm1',
  senderId: 'coach',
  text: 'Bus leaves at 6:15 from the field house',
  at: SENT,
  mine: true,
  seen: false,
  failed: null,
  edited: false,
  deleted: false,
  hasAttachments: false,
  ...over,
});

function api(marks: Record<string, string | null>, over: Partial<ChMessagesApi> = {}, role: 'coach' | 'player' = 'coach'): ChMessagesApi {
  return {
    viewer: { userId: 'coach', role, name: 'Maya Reyes' },
    now: '2026-10-24T20:00:00.000Z',
    timeZone: 'America/New_York',
    clock: '12',
    receipts: { status: 'ready', marks: new Map(Object.entries(marks)), retry: vi.fn() },
    directory: [
      { userId: 'coach', name: 'Maya Reyes', role: 'coach' },
      { userId: 'ava', name: 'Ava Lindqvist', role: 'player' },
      { userId: 'eli', name: 'Eli Brandt', role: 'player' },
      { userId: 'dana', name: 'Dana Whitfield', role: 'coach' },
    ],
    msgs: [msg()],
    reactions: new Map(),
    ...over,
  } as unknown as ChMessagesApi;
}

const half = { coach: SENT, ava: '2026-10-24T18:20:00Z', eli: null, dana: '2026-10-22T10:00:00Z' };

describe('the receipt (P-1 slice 3)', () => {
  it('CH-7608 a coach sees "Seen by 1 of 3" as a button that opens the list; a player sees text only', async () => {
    const onOpen = vi.fn();
    const { container } = render(<SeenByReceipt api={api(half)} m={msg()} onOpen={onOpen} />);
    const b = screen.getByRole('button', { name: 'Seen by 1 of 3 people. Show who' });
    expect(container.textContent).toBe(' · Seen by 1 of 3');
    await userEvent.setup().click(b);
    expect(onOpen).toHaveBeenCalledWith(b);
    cleanup();
    const player = api(half, { viewer: { userId: 'ava', role: 'player', name: 'Ava' } } as Partial<ChMessagesApi>);
    render(<SeenByReceipt api={player} m={msg({ senderId: 'ava' })} onOpen={onOpen} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Seen by 1 of 3 people')).toBeTruthy();
  });

  it('Sent, then Seen by everyone with the double check; the fading copies are hidden from VoiceOver', () => {
    const { container, rerender } = render(<SeenByReceipt api={api({ coach: SENT, ava: null })} m={msg()} onOpen={() => {}} />);
    expect(container.textContent).toBe(' · Sent');
    rerender(<SeenByReceipt api={api({ coach: SENT, ava: SENT })} m={msg()} onOpen={() => {}} />);
    expect(container.querySelector('.ch-ms-seen__all svg')).not.toBeNull();
    expect(container.querySelector('.ch-ms-seen__w')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('no false zero: nothing while loading, nothing after a failed read with no map, nothing on a pending or failed send', () => {
    const loading = api({}, { receipts: { status: 'loading', marks: new Map(), retry: vi.fn() } });
    const { container, rerender } = render(<SeenByReceipt api={loading} m={msg()} />);
    expect(container.textContent).toBe('');
    rerender(<SeenByReceipt api={api({}, { receipts: { status: 'error', marks: new Map(), retry: vi.fn() } })} m={msg()} />);
    expect(container.textContent).toBe('');
    rerender(<SeenByReceipt api={api(half)} m={msg({ pending: true })} />);
    expect(container.textContent).toBe('');
    rerender(<SeenByReceipt api={api(half)} m={msg({ failed: 'unknown' })} />);
    expect(container.textContent).toBe('');
  });

  it('a player sees nothing on someone else’s message (option a)', () => {
    const player = api(half, { viewer: { userId: 'ava', role: 'player', name: 'Ava' } } as Partial<ChMessagesApi>);
    const { container } = render(<SeenByReceipt api={player} m={msg({ mine: false })} />);
    expect(container.textContent).toBe('');
  });
});

describe('the list (P-1 slice 4)', () => {

  it('CH-7411 a list opened before the read answers shows three skeleton rows', () => {
    render(<SeenBySheet api={api({}, { receipts: { status: 'loading', marks: new Map(), retry: vi.fn() } })} m={msg()} onClose={() => {}} />);
    const busy = document.querySelector('[data-ch-code="CH-7411"]')!;
    expect(busy.getAttribute('aria-busy')).toBe('true');
    expect(busy.querySelectorAll('.ch-seen-row')).toHaveLength(3);
    expect(screen.getByRole('dialog', { name: 'Seen by' })).toBeTruthy();
  });

  it('CH-7805 the accessible name sits on one stable node for a player', () => {
    const player = api(half, { viewer: { userId: 'ava', role: 'player', name: 'Ava' } } as Partial<ChMessagesApi>);
    render(<SeenByReceipt api={player} m={msg({ senderId: 'ava' })} />);
    expect(document.querySelector('[data-ch-code="CH-7805"]')!.textContent).toBe('Seen by 1 of 3 people');
  });

  it('CH-7218 a failed read with nothing held says so with Retry', async () => {
    const retry = vi.fn();
    render(<SeenBySheet api={api({}, { receipts: { status: 'error', marks: new Map(), retry } })} m={msg()} onClose={() => {}} />);
    expect(document.querySelector('[data-ch-code="CH-7218"]')).not.toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: /Try again|Retry/ }));
    expect(retry).toHaveBeenCalled();
  });
});
