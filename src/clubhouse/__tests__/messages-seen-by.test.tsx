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

describe('the list when nobody has read it', () => {
  it('CH-7310 nobody seen: the sheet has one section, "Not seen yet", and a forged future open never shows as a date to come', () => {
    render(<SeenBySheet api={api({ coach: SENT, ava: '2030-01-01T00:00:00Z', eli: null })} m={msg({ at: '2031-01-01T00:00:00Z' })} onClose={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: 'Seen by' });
    const list = dialog.querySelector('[data-ch-code="CH-7310"]')!;
    expect(list).not.toBeNull();
    // No "Seen" section at all: one heading, for the people who have not.
    const heads = [...list.querySelectorAll('h3')].map((h) => h.textContent ?? '');
    expect(heads).toHaveLength(1);
    expect(heads[0]).toMatch(/^Not seen yet/);
    expect(list.querySelectorAll('.ch-seen-row')).toHaveLength(2);
    // Each row says the same plain thing; a forged future open never reads as a date to come.
    expect([...list.querySelectorAll('.ch-seen-row__meta')].map((x) => x.textContent)).toEqual(['Hasn’t opened this chat', 'Hasn’t opened this chat']);
    expect(dialog.textContent).not.toMatch(/tomorrow|2030/i);
  });
});

describe('the line under a name in the list (MSG-405)', () => {
  it('a coach reads each person’s class year or title, as the roster shows it; without one, the plain role', () => {
    const directory = [
      { userId: 'coach', name: 'Maya Reyes', role: 'coach' },
      { userId: 'ava', name: 'Ava Lindqvist', role: 'player', subtitle: 'Junior' },
      { userId: 'eli', name: 'Eli Brandt', role: 'player' },
      { userId: 'dana', name: 'Dana Whitfield', role: 'coach', subtitle: 'Assistant Coach' },
    ];
    render(<SeenBySheet api={api(half, { directory } as unknown as Partial<ChMessagesApi>)} m={msg()} onClose={() => {}} />);
    const sub = (id: string) => document.querySelector(`[data-user="${id}"] .ch-seen-row__role`)?.textContent;
    expect(sub('ava')).toBe('Junior');
    expect(sub('dana')).toBe('Assistant Coach');
    expect(sub('eli')).toBe('Player');
  });
});
