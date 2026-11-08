import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bubbletLine, hasNoMessages, INBOX_FILTERS, nothingHere, pinLabel, pinsWithChannel, titleHints, withoutEmptyThreads } from '../inbox/model';
import { InboxSkeleton, INBOX_SKELETON_WIDTHS } from '../inbox/InboxSkeleton';
import { TypingMini, typingLabel } from '../inbox/TypingMini';
import { MessagesSkeleton } from '../MessagesSkeleton';
import type { ChPins } from '../pinned';
import type { ChMessagesApi } from '../api/types';

afterEach(() => cleanup());

const pins = (ids: string[], toggle = vi.fn()): ChPins => ({ ids, has: (id) => ids.includes(id), atLimit: ids.length >= 3, toggle });
const convs = [{ id: 'team', channel: true }, { id: 'a' }, { id: 'b' }, { id: 'c' }];

describe('pins count the team channel (Q-11, MSG-111)', () => {
  it('with a channel, two of your own is the limit, and Pin past it does nothing', () => {
    const toggle = vi.fn();
    const p = pinsWithChannel(pins(['a', 'b'], toggle), convs)!;
    expect(p.atLimit).toBe(true);
    p.toggle('c');
    expect(toggle).not.toHaveBeenCalled();
    p.toggle('a');
    expect(toggle).toHaveBeenCalledWith('a');
  });
  it('the channel is always pinned and cannot be toggled', () => {
    const toggle = vi.fn();
    const p = pinsWithChannel(pins([], toggle), convs)!;
    expect(p.has('team')).toBe(true);
    p.toggle('team');
    expect(toggle).not.toHaveBeenCalled();
    expect(p.atLimit).toBe(false);
  });
  it('without a channel the pins are untouched', () => {
    const p = pins(['a']);
    expect(pinsWithChannel(p, [{ id: 'a' }])).toBe(p);
    expect(pinsWithChannel(undefined, convs)).toBeUndefined();
  });
});

describe('the Pinned card', () => {
  it('labels: Team, a group by name, a person by first name', () => {
    expect(pinLabel({ title: 'Varsity', group: true, channel: true })).toBe('Team');
    expect(pinLabel({ title: 'Qualifier group', group: true })).toBe('Qualifier group');
    expect(pinLabel({ title: 'Eli Rivera', group: false })).toBe('Eli');
  });
  it('the bubblet says the other person’s latest line, none for your own or an empty one', () => {
    expect(bubbletLine({ lastText: 'I can drive', lastSenderId: 'eli' }, 'me')).toBe('I can drive');
    expect(bubbletLine({ lastText: 'Poll: Range day?', lastSenderId: 'eli' }, 'me')).toBe('Range day?');
    expect(bubbletLine({ lastText: 'mine', lastSenderId: 'me' }, 'me')).toBeNull();
    expect(bubbletLine({ lastText: '', lastSenderId: 'eli' }, 'me')).toBeNull();
  });
});

describe('threads with no messages stay out of the list', () => {
  const full = { lastText: 'Bus at 6', lastSenderId: 'eli' };
  const empty = { lastText: '', lastSenderId: null };
  const list = [
    { id: 'team', channel: true, ...empty },
    { id: 'talked', ...full },
    { id: 'blank', ...empty },
    { id: 'made', ...empty },
  ];
  it('hasNoMessages is true only with no last message, and never for the team channel', () => {
    expect(hasNoMessages({ ...empty })).toBe(true);
    expect(hasNoMessages({ ...full })).toBe(false);
    expect(hasNoMessages({ ...empty, channel: true })).toBe(false);
    expect(hasNoMessages({ lastText: 'Sent an attachment', lastSenderId: 'me' })).toBe(false);
  });
  it('drops the empty one, keeps the channel and anything with a message', () => {
    expect(withoutEmptyThreads(list, () => false).map((c) => c.id)).toEqual(['team', 'talked']);
  });
  it('keeps an empty one the viewer is in (open, made or opened this session, pinned)', () => {
    expect(withoutEmptyThreads(list, (id) => id === 'made').map((c) => c.id)).toEqual(['team', 'talked', 'made']);
    expect(withoutEmptyThreads(list, (id) => id === 'blank' || id === 'made').map((c) => c.id)).toEqual(['team', 'talked', 'blank', 'made']);
  });
});

describe('groups that share a title tell themselves apart', () => {
  const g = (id: string, memberCount: number, creatorId: string | null = null, title = '26-27 Group Chat') => ({ id, title, group: true, memberCount, creatorId });
  const names: Record<string, string> = { maya: 'Maya Reyes', owen: 'Owen Hart' };
  const nameOf = (id: string) => names[id];
  it('says the member count when the counts differ', () => {
    const h = titleHints([g('a', 11), g('b', 2), g('c', 5, null, 'Travel')], nameOf);
    expect([...h]).toEqual([['a', '11 members'], ['b', '2 members']]);
  });
  it('falls back to who started each when the counts match', () => {
    const h = titleHints([g('a', 4, 'maya'), g('b', 4, 'owen')], nameOf);
    expect([...h]).toEqual([['a', 'started by Maya'], ['b', 'started by Owen']]);
  });
  it('falls back to a number in list order when nothing else differs', () => {
    const h = titleHints([g('a', 4, 'maya'), g('b', 4, 'maya')], nameOf);
    expect([...h]).toEqual([['a', '4 members, 1 of 2'], ['b', '4 members, 2 of 2']]);
  });
  it('matches titles ignoring case and spaces, and leaves a lone group, the channel and a person alone', () => {
    const h = titleHints([g('a', 3, null, 'Travel'), g('b', 6, null, ' travel '), g('c', 8, null, 'Solo'), { ...g('d', 9, null, 'Travel'), channel: true }, { ...g('e', 2, null, 'Travel'), group: false }], nameOf);
    expect([...h.keys()]).toEqual(['a', 'b']);
  });
});

describe('copy', () => {
  it('Nothing here says why', () => {
    expect(nothingHere('unread', '')).toBe('No unread conversations right now.');
    expect(nothingHere('groups', '')).toBe('No groups right now.');
    expect(nothingHere('all', 'zed')).toBe('No results for “zed”');
    expect(INBOX_FILTERS.map((f) => f.label)).toEqual(['All', 'Unread', 'Groups']);
  });
  it('typing is dots only, with the typers in its label (Q-12)', () => {
    const api = { directory: [{ userId: 'm', name: 'Maya Ortiz' }, { userId: 'o', name: 'Owen Lee' }] } as unknown as ChMessagesApi;
    expect(typingLabel(api, ['m'])).toBe('Maya is typing');
    expect(typingLabel(api, ['m', 'o'])).toBe('Maya and Owen are typing');
    expect(typingLabel(api, ['m', 'o', 'x'])).toBe('Several people are typing');
    render(<TypingMini label="Maya is typing" />);
    expect(screen.getByRole('img', { name: 'Maya is typing' }).querySelectorAll('i')).toHaveLength(3);
  });
});

describe('loading (MSG-112)', () => {
  it('five rows at the artifact’s widths under one status host', () => {
    expect(INBOX_SKELETON_WIDTHS.map(([a, b]) => `${a}/${b}`)).toEqual(['46/78', '38/64', '52/82', '34/58', '44/70']);
    const { container } = render(<InboxSkeleton layout="card" />);
    expect(screen.getByRole('status', { name: 'Loading conversations' })).toBeTruthy();
    expect(container.querySelectorAll('.ch-inb-skrow')).toHaveLength(5);
  });
  it('the route skeleton draws no large title', () => {
    const { container } = render(<MessagesSkeleton />);
    expect(container.querySelector('[data-ch-large-title]')).toBeNull();
    expect(container.querySelectorAll('.ch-inb-skrow')).toHaveLength(10);
  });
});
