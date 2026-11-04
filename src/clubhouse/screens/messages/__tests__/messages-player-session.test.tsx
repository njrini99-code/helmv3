import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

import { COACH_STARTERS, HelloCard, PLAYER_STARTERS } from '../HelloCard';
import { QuickActions } from '../details-v2';
import type { ChConv, ChMsg } from '../model';
import type { ChMessagesApi } from '../MessagesView';
import { SeenByReceipt } from '../seen-by';

afterEach(cleanup);

const SENT = '2026-10-24T18:14:00.000Z';
const msg = (over: Partial<ChMsg> = {}): ChMsg => ({ id: 'm1', senderId: 'ava', text: 'Bus at 6:15', at: SENT, mine: true, seen: false, failed: null, edited: false, deleted: false, hasAttachments: false, ...over });
const marks = new Map(Object.entries({ ava: SENT, eli: '2026-10-24T18:20:00Z', sam: null }));
const player = { viewer: { userId: 'ava', role: 'player', name: 'Ava' }, receipts: { status: 'ready', marks, retry: vi.fn() }, directory: [{ userId: 'eli', name: 'Eli Brandt', role: 'player' }, { userId: 'sam', name: 'Sam Reed', role: 'player' }], now: SENT, timeZone: 'America/New_York', clock: '12', msgs: [] } as unknown as ChMessagesApi;
const conv = (over: Partial<ChConv> = {}): ChConv => ({ id: 'c1', group: false, title: 'Eli Brandt', subtitle: '', memberIds: ['eli'], memberCount: 2, unread: 0, lastAt: null, lastSenderId: null, lastText: '', creatorId: null, ...over });
const mute = { muted: false, busy: false, setMute: vi.fn(), setChoosing: vi.fn(), choosing: false } as never;
const noop = () => undefined;
const ELI = { name: 'Eli', role: 'Player' };

/** Messages MSG-ROLE-02 and MSG-HOLDSEEN-02, as the demo player. */
describe('Seen by, as a player', () => {
  it('shows on your own message', () => {
    render(<SeenByReceipt api={player} m={msg()} />);
    expect(document.body.textContent).toMatch(/Seen by/);
  });
  it('is absent from the DOM on someone else’s', () => {
    const { container } = render(<SeenByReceipt api={player} m={msg({ mine: false, senderId: 'eli' })} />);
    expect(container.textContent).toBe('');
  });
  it('a read time and a count, never a figure', () => {
    render(<SeenByReceipt api={player} m={msg()} />);
    expect(document.body.textContent).not.toMatch(/SG|strokes|average|\bavg\b/i);
  });
});

/** MSG-ROLE-04: no link to a teammate's stats in front of a player (SHARED-11). */
describe('the Profile action', () => {
  const tiles = (profileHref: string | null, c = conv()) =>
    render(<QuickActions api={player} conv={c} mute={mute} profileHref={profileHref} onSearch={noop} onFiles={noop} onAdd={noop} onLeave={noop} />);
  it('is absent with no href, which is every player’s case', () => {
    tiles(null);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Profile')).toBeNull();
    expect(document.body.innerHTML).not.toContain('/golf/dashboard/stats');
  });
  it('the caller’s href is what draws it', () => {
    tiles('/golf/dashboard/stats?player=p1');
    expect(screen.getByRole('link', { name: 'Profile' }).getAttribute('href')).toBe('/golf/dashboard/stats?player=p1');
  });
  it('a group offers Leave to a member and Add to its maker', () => {
    tiles(null, conv({ group: true, creatorId: 'someone' }));
    expect(screen.getByRole('button', { name: 'Leave' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull();
    cleanup();
    tiles(null, conv({ group: true, creatorId: 'ava' }));
    expect(screen.getByRole('button', { name: 'Add' })).toBeTruthy();
  });
});

/** MSG-FRESH-02 and 03. */
describe('the hello card', () => {
  const buttons = () => screen.getAllByRole('button').map((b) => b.textContent);
  it('a player sees exactly their three, in order, none of a coach’s', () => {
    render(<HelloCard {...ELI} coach={false} onStarter={noop} />);
    expect(buttons()).toEqual([...PLAYER_STARTERS]);
    for (const s of COACH_STARTERS) expect(screen.queryByText(s)).toBeNull();
  });
  it('a coach sees theirs', () => {
    render(<HelloCard {...ELI} coach onStarter={noop} />);
    expect(buttons()).toEqual([...COACH_STARTERS]);
  });
  it('a starter hands up its words and sends nothing itself', () => {
    const onStarter = vi.fn();
    render(<HelloCard {...ELI} coach={false} onStarter={onStarter} />);
    fireEvent.click(screen.getByRole('button', { name: PLAYER_STARTERS[1] }));
    expect(onStarter).toHaveBeenCalledWith(PLAYER_STARTERS[1]);
  });
});
