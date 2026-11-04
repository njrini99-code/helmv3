// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoldSeenRow, SeenByPill } from '../seen-by';

const api = (marks: Array<[string, string | null]>, role: 'coach' | 'player' = 'coach') =>
  ({
    viewer: { userId: 'me', role, name: 'Me' },
    directory: marks.map(([userId]) => ({ userId, name: `Person ${userId}`, role: 'player', subtitle: '', playerId: null })),
    receipts: { status: 'ready', marks: new Map(marks), retry: () => {} },
    now: '2026-10-16T12:00:00Z',
    timeZone: 'UTC',
  }) as never;
const m = { id: 'm', senderId: 'me', at: '2026-10-16T11:00:00Z', mine: true, pending: false, failed: null, deleted: false, text: 'x' } as never;
const read = '2026-10-16T11:30:00Z';

afterEach(cleanup);

describe('Seen by pill (S-MSG.team)', () => {
  it('draws at most five faces and the count, even with more readers', () => {
    render(<SeenByPill api={api([['a', read], ['b', read], ['c', read], ['d', read], ['e', read], ['f', read], ['g', null]])} m={m} onOpen={() => {}} />);
    expect(document.querySelectorAll('.ch-msv-faces__f')).toHaveLength(5);
    expect(document.querySelector('.ch-msv-seen')!.textContent).toContain('Seen by 6 of 7');
  });

  it('opens the list when tapped', () => {
    const onOpen = vi.fn();
    render(<SeenByPill api={api([['a', read], ['b', null]])} m={m} onOpen={onOpen} />);
    screen.getByRole('button').click();
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('draws nothing while the read state is unknown', () => {
    const a = { ...(api([['a', read]]) as object), receipts: { status: 'loading', marks: new Map(), retry: () => {} } } as never;
    const { container } = render(<SeenByPill api={a} m={m} />);
    expect(container.textContent).toBe('');
  });
});

describe('hold menu row (S-MSG.holdseen)', () => {
  it('says how many read it and how many have not', () => {
    render(<HoldSeenRow api={api([['a', read], ['b', read], ['c', null]])} m={m} onOpen={() => {}} />);
    expect(document.querySelector('.ch-msv-seenrow small')!.textContent).toBe('2 of 3 · 1 not yet');
  });
});
