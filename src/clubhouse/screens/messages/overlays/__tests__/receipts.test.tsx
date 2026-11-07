// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DmReceipt, SeenByPill } from '../../seen-by';

afterEach(cleanup);

const read = '2026-10-16T11:30:00Z';
const api = (marks: Array<[string, string | null]>, role: 'coach' | 'player' = 'coach') =>
  ({
    viewer: { userId: 'me', role, name: 'Me' },
    directory: marks.map(([userId]) => ({ userId, name: `Person ${userId}`, role: 'player', subtitle: '', playerId: null })),
    receipts: { status: 'ready', marks: new Map(marks), retry: () => {} },
    now: '2026-10-16T12:00:00Z',
    timeZone: 'UTC',
    clock: '12',
  }) as never;
const m = (over: object = {}) => ({ id: 'm', senderId: 'me', at: '2026-10-16T11:00:00Z', mine: true, pending: false, failed: null, deleted: false, text: 'x', seen: false, ...over }) as never;

describe('MSG-215 group receipt', () => {
  it('nobody has read it: a plain Delivered pill, not a button', () => {
    render(<SeenByPill api={api([['a', null], ['b', null]])} m={m()} onOpen={() => {}} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('.ch-msv-seen')!.textContent).toContain('Delivered');
  });

  it('everyone has read it: "Seen by everyone"', () => {
    render(<SeenByPill api={api([['a', read], ['b', read]])} m={m()} onOpen={() => {}} />);
    expect(document.querySelector('.ch-msv-seen')!.textContent).toContain('Seen by everyone');
  });

  it('Q-15: a player sender sees the count and no faces, and cannot open the list', () => {
    render(<SeenByPill api={api([['a', read], ['b', null]], 'player')} m={m()} onOpen={() => {}} />);
    expect(document.querySelectorAll('.ch-msv-faces__f')).toHaveLength(0);
    expect(screen.queryByRole('button')).toBeNull();
    expect(document.querySelector('.ch-msv-seen')!.textContent).toContain('Seen by 1 of 2');
  });
});

describe('MSG-214 direct receipt', () => {
  it('Delivered until it is seen', () => {
    render(<DmReceipt api={api([['a', null]])} m={m()} />);
    expect(screen.getByRole('status').textContent).toBe('Delivered');
  });

  it('Q-44: a coach reads the reader’s time', () => {
    render(<DmReceipt api={api([['a', read]])} m={m({ seen: true })} />);
    expect(screen.getByRole('status').textContent).toBe('Seen 11:30 AM');
  });

  it('Q-44: a player reads plain Seen, no time', () => {
    render(<DmReceipt api={api([['a', read]], 'player')} m={m({ seen: true })} />);
    expect(screen.getByRole('status').textContent).toBe('Seen');
  });

  it('draws nothing for a pending, failed or poll message', () => {
    const { container, rerender } = render(<DmReceipt api={api([['a', read]])} m={m({ pending: true })} />);
    expect(container.textContent).toBe('');
    rerender(<DmReceipt api={api([['a', read]])} m={m({ failed: 'x' })} />);
    expect(container.textContent).toBe('');
    rerender(<DmReceipt api={api([['a', read]])} m={m({ poll: { question: 'q' } })} />);
    expect(container.textContent).toBe('');
  });
});
