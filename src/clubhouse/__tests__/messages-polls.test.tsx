import { act, cleanup, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Polls in a thread (premium features P-2, handoff §4.34.2): the card a poll message draws and the sheet that writes
 * one, against a stand-in for the thread's api. How the screen reads and writes votes is in use-message-responses and
 * the pure rules in lib/golf/message-polls; the screen's own tests mock both.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));

import './dialog-polyfill';
import { haptic } from '../lib/haptics';
import { tallyPoll, type Poll, type PollResponseRow } from '@/lib/golf/message-polls';
import type { ChMessagesApi } from '../screens/messages/MessagesView';
import type { ChConv } from '../screens/messages/model';
import { clearPollDrafts, notePollHold, PollButton, PollCard, pollCardActions, PollThreadContext, type ChPollsApi } from '../screens/messages/polls';

afterEach(() => {
  clearPollDrafts();
  cleanup();
  vi.clearAllMocks();
});

const NOW = '2026-10-24T15:00:00.000Z';

const poll = (over: Partial<Poll> = {}): Poll => ({
  question: 'Which van are you riding in?',
  options: [
    { id: 'o1', label: 'Van A' },
    { id: 'o2', label: 'Van B' },
  ],
  multi: false,
  closesAt: null,
  closedAt: null,
  ...over,
});

const conv = (over: Partial<ChConv> = {}): ChConv => ({
  id: 'c1',
  group: true,
  title: 'Travel squad',
  subtitle: '',
  memberIds: ['ana', 'ben', 'cal'],
  memberCount: 4,
  unread: 0,
  lastAt: null,
  lastSenderId: null,
  lastText: '',
  creatorId: 'me',
  ...over,
});

function api(rows: PollResponseRow[] | null, over: Partial<ChPollsApi> = {}, convOver: Partial<ChConv> = {}) {
  const polls: ChPollsApi = {
    tally: (messageId, p) => (rows ? tallyPoll(p, rows, messageId, 'me') : null),
    vote: vi.fn(),
    pending: new Set<string>(),
    error: null,
    retry: vi.fn(),
    send: vi.fn(async () => ({ ok: true as const })),
    close: vi.fn(async () => true),
    ...over,
  };
  const c = conv(convOver);
  return {
    polls,
    now: NOW,
    timeZone: 'America/Chicago',
    clock: '12',
    convs: [c],
    selectedId: c.id,
    viewer: { userId: 'me', name: 'Nick Rini' },
    directory: [
      { userId: 'ana', name: 'Ana Ruiz' },
      { userId: 'ben', name: 'Ben Cho' },
      { userId: 'cal', name: 'Cal Park' },
    ],
  } as unknown as ChMessagesApi;
}

describe('PollCard', () => {
  it('shows the question, each choice with its count, and how many of the thread voted', () => {
    render(<PollCard api={api([{ message_id: 'm1', user_id: 'ana', choice: 'o2' }])} messageId="m1" poll={poll()} mine={false} />);
    expect(screen.getByText('Which van are you riding in?')).toBeTruthy();
    const group = screen.getByRole('radiogroup');
    const [a, b] = within(group).getAllByRole('radio');
    expect(a!.getAttribute('aria-label')).toBe('Van A, 0 votes');
    expect(b!.getAttribute('aria-label')).toBe('Van B, 1 vote');
    expect(b!.style.getPropertyValue('--ch-poll-share')).toBe('1');
    // The count is plain text: a live region per card would announce every poll in the thread on each vote.
    expect(document.querySelector('.ch-ms-poll__count')!.textContent).toBe('1 of 4 voted');
    expect(screen.queryByRole('status')).toBeNull();
    // One answer, no end: the head is just "Poll" (P-2 4.1).
    expect(document.querySelector('.ch-ms-poll__head')!.textContent).toBe('Poll');
  });

  it('a tap votes, a second tap on the same choice takes it back', async () => {
    const user = userEvent.setup();
    const a1 = api([]);
    const { rerender } = render(<PollCard api={a1} messageId="m1" poll={poll()} mine={false} />);
    await user.click(screen.getByRole('radio', { name: /Van A/ }));
    expect(a1.polls!.vote).toHaveBeenLastCalledWith('m1', expect.anything(), ['o1']);
    expect(haptic).toHaveBeenCalledWith('select');

    const a2 = api([{ message_id: 'm1', user_id: 'me', choice: 'o1' }]);
    rerender(<PollCard api={a2} messageId="m1" poll={poll()} mine={false} />);
    const mine = screen.getByRole('radio', { name: /Van A/ });
    expect(mine.getAttribute('aria-checked')).toBe('true');
    expect(mine.getAttribute('aria-label')).toBe('Van A, 1 vote, your vote');
    await user.click(mine);
    expect(a2.polls!.vote).toHaveBeenLastCalledWith('m1', expect.anything(), []);
  });

  it('a multi-answer poll adds picks in option order', async () => {
    const user = userEvent.setup();
    const p = poll({ multi: true, options: [{ id: 'o1', label: 'Tue' }, { id: 'o2', label: 'Wed' }, { id: 'o3', label: 'Thu' }] });
    const a = api([{ message_id: 'm1', user_id: 'me', choice: 'o3' }]);
    render(<PollCard api={a} messageId="m1" poll={p} mine={false} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(screen.getByText('Choose any that work')).toBeTruthy();
    await user.click(screen.getByRole('checkbox', { name: /Tue/ }));
    expect(a.polls!.vote).toHaveBeenLastCalledWith('m1', expect.anything(), ['o1', 'o3']);
  });

  it('a closed poll takes no votes, says Final, and names the leader', async () => {
    const user = userEvent.setup();
    const a = api([{ message_id: 'm1', user_id: 'ana', choice: 'o2' }]);
    render(<PollCard api={a} messageId="m1" poll={poll({ closedAt: '2026-10-24T14:00:00Z' })} mine />);
    expect(screen.getByText('Poll closed')).toBeTruthy();
    expect(screen.getByText('Final')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Van B/ }).getAttribute('aria-label')).toBe('Van B, 1 vote, most votes');
    await user.click(screen.getByRole('radio', { name: /Van A/ }));
    expect(a.polls!.vote).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Close poll' })).toBeNull();
  });

  it('a poll past its end time is closed too', () => {
    render(<PollCard api={api([])} messageId="m1" poll={poll({ closesAt: '2026-10-24T14:59:00Z' })} mine />);
    expect(screen.getByText('Voting ended')).toBeTruthy();
  });

  it('says when an open poll ends, in the viewer’s clock', () => {
    // "tomorrow" is read against the clock, so pin it: the day before the poll closes.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T15:00:00Z'));
    try {
      render(<PollCard api={api([])} messageId="m1" poll={poll({ closesAt: '2026-10-25T23:00:00Z' })} mine={false} />);
      expect(screen.getByText('Ends tomorrow at 6:00 PM')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for votes before it takes a tap, and offers Retry when they fail', async () => {
    const user = userEvent.setup();
    const loading = api(null);
    const { rerender } = render(<PollCard api={loading} messageId="m1" poll={poll()} mine={false} />);
    expect(document.querySelector('.ch-ms-poll__count')!.textContent).toBe('Loading votes…');
    await user.click(screen.getByRole('radio', { name: /Van A/ }));
    expect(loading.polls!.vote).not.toHaveBeenCalled();

    const failed = api(null, { error: 'Votes could not be loaded. Tap to retry.' });
    rerender(<PollCard api={failed} messageId="m1" poll={poll()} mine={false} />);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(failed.polls!.retry).toHaveBeenCalled();
  });

  it('See votes lists who picked what and who hasn’t voted', async () => {
    const user = userEvent.setup();
    render(<PollCard api={api([{ message_id: 'm1', user_id: 'ana', choice: 'o1' }, { message_id: 'm1', user_id: 'me', choice: 'o1' }])} messageId="m1" poll={poll()} mine={false} />);
    await user.click(screen.getByRole('button', { name: 'See votes' }));
    const dialog = await screen.findByRole('dialog');
    const vanA = within(dialog).getByRole('region', { name: 'Van A' });
    // D29: no vote times; "You" first, then by name.
    expect([...vanA.querySelectorAll('.ch-ms-pollv__name')].map((n) => n.textContent)).toEqual(['You', 'Ana Ruiz']);
    const waiting = within(dialog).getByRole('region', { name: 'Hasn’t voted' });
    expect([...waiting.querySelectorAll('.ch-ms-pollv__name')].map((n) => n.textContent)).toEqual(['Ben Cho', 'Cal Park']);
    expect(dialog.textContent).not.toMatch(/\d:\d\d/);
  });

  it('See votes marks someone who voted and left, and a final poll says Final', async () => {
    const user = userEvent.setup();
    const rows = [{ message_id: 'm1', user_id: 'gone', choice: 'o1' }];
    const a = api(rows) as ChMessagesApi & { directory: Array<{ userId: string; name: string }> };
    a.directory.push({ userId: 'gone', name: 'Dana Ruiz' });
    render(<PollCard api={a} messageId="m1" poll={poll({ closedAt: NOW })} mine={false} />);
    await user.click(screen.getByRole('button', { name: 'See votes' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Left the group')).toBeTruthy();
    expect(within(dialog).getByText('Final')).toBeTruthy();
  });

  it('the sender closes it after a confirm', async () => {
    const user = userEvent.setup();
    const a = api([]);
    render(<PollCard api={a} messageId="m1" poll={poll()} mine />);
    await user.click(screen.getByRole('button', { name: 'Close poll' }));
    const dialog = await screen.findByRole('dialog', { name: 'Close this poll?' });
    await user.click(within(dialog).getByRole('button', { name: 'Close poll' }));
    expect(a.polls!.close).toHaveBeenCalledWith('m1');
    expect(haptic).toHaveBeenCalledWith('success');
  });
});

describe('PollButton and the New poll sheet', () => {
  it('shows only in a group thread', () => {
    const { rerender } = render(<PollButton api={api([])} conv={conv({ group: false })} />);
    expect(screen.queryByRole('button', { name: 'New poll' })).toBeNull();
    rerender(<PollButton api={api([])} conv={conv()} />);
    expect(screen.getByRole('button', { name: 'New poll' })).toBeTruthy();
  });
});

describe('PollCard, slice 1 of the follow-up plan (P-2 0.2)', () => {
  it('D11: counts a voter who has left, so it never reads more voted than could; all in reads "Everyone voted"', () => {
    const rows = [
      { message_id: 'm1', user_id: 'gone', choice: 'o1' },
      { message_id: 'm1', user_id: 'ana', choice: 'o1' },
    ];
    render(<PollCard api={api(rows, {}, { memberIds: ['ana'] })} messageId="m1" poll={poll()} mine={false} />);
    expect(document.querySelector('.ch-ms-poll__count')!.textContent).toBe('2 of 3 voted');
    cleanup();
    const all = [...rows, { message_id: 'm1', user_id: 'me', choice: 'o2' }];
    render(<PollCard api={api(all, {}, { memberIds: ['ana'] })} messageId="m1" poll={poll()} mine={false} />);
    expect(document.querySelector('.ch-ms-poll__count')!.textContent).toBe('Everyone voted');
  });

  it('D13: counts down the last hour and turns final at its exact end', () => {
    vi.useFakeTimers({ now: Date.parse(NOW) });
    try {
      const closesAt = new Date(Date.parse(NOW) + 42 * 60_000).toISOString();
      render(<PollCard api={api([])} messageId="m1" poll={poll({ closesAt })} mine={false} />);
      expect(screen.getByText('Ends in 42 min')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(41 * 60_000 + 30_000); });
      expect(screen.getByText('Ends in under a minute')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(31_000); });
      expect(screen.getByText('Final')).toBeTruthy();
      expect(screen.getByRole('radio', { name: /Van A/ }).getAttribute('aria-disabled')).toBe('true');
    } finally {
      vi.useRealTimers();
    }
  });

  it('D13: a 30-day poll stays open when drawn, re-arms in six-hour chunks, and re-checks when the page is shown', () => {
    vi.useFakeTimers({ now: Date.parse(NOW) });
    const spy = vi.spyOn(globalThis, 'setTimeout');
    try {
      const closesAt = new Date(Date.parse(NOW) + 30 * 24 * 3_600_000).toISOString();
      render(<PollCard api={api([])} messageId="m1" poll={poll({ closesAt })} mine={false} />);
      expect(screen.queryByText('Voting ended')).toBeNull();
      expect(Math.max(...spy.mock.calls.map((c) => Number(c[1] ?? 0)))).toBeLessThanOrEqual(6 * 3_600_000);
      // The device slept past the end (iOS pauses timers): showing the page again turns it final at once.
      vi.setSystemTime(Date.parse(closesAt) + 1_000);
      act(() => { window.dispatchEvent(new Event('pageshow')); });
      expect(screen.getByText('Final')).toBeTruthy();
    } finally {
      spy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('D14: one tab stop; arrows move focus and never vote; Space votes', async () => {
    const user = userEvent.setup();
    const a = api([]);
    render(<PollCard api={a} messageId="m1" poll={poll()} mine={false} />);
    const [first, second] = screen.getAllByRole('radio');
    expect([first!.tabIndex, second!.tabIndex]).toEqual([0, -1]);
    first!.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(second);
    expect(a.polls!.vote).not.toHaveBeenCalled();
    await user.keyboard(' ');
    expect(a.polls!.vote).toHaveBeenLastCalledWith('m1', expect.anything(), ['o2']);
  });

  it('D28: the release of a long press that opened the actions is not a vote', async () => {
    const a = api([]);
    render(<PollCard api={a} messageId="m1" poll={poll()} mine={false} />);
    const row = screen.getByRole('radio', { name: /Van A/ });
    act(() => {
      row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 5));
    notePollHold();
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    });
    expect(a.polls!.vote).not.toHaveBeenCalled();
  });
});

describe('PollCard, slice 2: the visual spec and its states (P-2 4.1, 4.2)', () => {
  const n = (label: RegExp) => screen.getByRole('radio', { name: label }).querySelector('.ch-ms-poll__n')!.textContent;

  it('open: an honest 0 in tertiary, a level line under every fill, no leader marked, "No votes yet"', () => {
    render(<PollCard api={api([])} messageId="m1" poll={poll()} mine={false} />);
    expect(n(/Van A/)).toBe('0');
    expect(document.querySelector('.ch-ms-poll__n')!.className).toContain('is-zero');
    expect(document.querySelectorAll('.ch-ms-poll__level')).toHaveLength(2);
    expect(document.querySelector('.ch-ms-poll__tag')).toBeNull();
    expect(document.querySelector('.ch-ms-poll__count')!.textContent).toBe('No votes yet');
  });

  it('closed by its sender: "Poll closed · Final", zeros shown, the leader tagged', () => {
    render(<PollCard api={api([{ message_id: 'm1', user_id: 'ana', choice: 'o2' }])} messageId="m1" poll={poll({ closedAt: '2026-10-24T14:00:00Z' })} mine />);
    expect(document.querySelector('.ch-ms-poll__head')!.textContent).toBe('Poll closed·Final');
    expect(n(/Van A/)).toBe('0');
    expect(screen.getByRole('radio', { name: /Van B/ }).querySelector('.ch-ms-poll__tag')!.textContent).toBe('Most votes');
  });

  it('ended on time, two leaders tied, and a final poll nobody voted on', () => {
    const rows = [
      { message_id: 'm1', user_id: 'ana', choice: 'o1' },
      { message_id: 'm1', user_id: 'ben', choice: 'o2' },
    ];
    render(<PollCard api={api(rows)} messageId="m1" poll={poll({ closesAt: '2026-10-24T14:59:00Z' })} mine={false} />);
    expect(document.querySelector('.ch-ms-poll__head')!.textContent).toBe('Voting ended·Final');
    expect([...document.querySelectorAll('.ch-ms-poll__tag')].map((t) => t.textContent)).toEqual(['Tied', 'Tied']);
    cleanup();
    render(<PollCard api={api([])} messageId="m1" poll={poll({ closesAt: '2026-10-24T14:59:00Z' })} mine={false} />);
    expect(document.querySelector('.ch-ms-poll__count')!.textContent).toBe('No one voted');
  });

  it('a multi-answer poll says so under its question while open; a failed read says so', () => {
    render(<PollCard api={api(null, { error: 'Votes could not be loaded. Tap to retry.' })} messageId="m1" poll={poll({ multi: true })} mine={false} />);
    expect(screen.getByText('Choose any that work')).toBeTruthy();
    expect(document.querySelector('.ch-ms-poll__count')!.textContent).toBe('Votes didn’t load');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });
});

describe('poll actions (P-2 slice 5)', () => {
  const coachApi = (rows: PollResponseRow[], over: Partial<ChPollsApi> = {}) => {
    const a = api(rows, over) as ChMessagesApi & { viewer: { role: string } };
    a.viewer.role = 'coach';
    return a;
  };
  const withThread = (ui: ReactElement, replyWith = vi.fn()) => ({ replyWith, ui: <PollThreadContext.Provider value={{ replyWith }}>{ui}</PollThreadContext.Provider> });

  it('Remind N prefills a reply naming the ones who haven’t voted, never the coach; hidden for a player', async () => {
    const user = userEvent.setup();
    const t = withThread(<PollCard api={coachApi([{ message_id: 'm1', user_id: 'ana', choice: 'o1' }])} messageId="m1" poll={poll()} mine />);
    render(t.ui);
    await user.click(screen.getByRole('button', { name: 'Remind 2' }));
    expect(t.replyWith).toHaveBeenCalledWith('m1', 'Ben and Cal, can you vote in the poll when you get a chance?');
    cleanup();
    render(withThread(<PollCard api={api([])} messageId="m1" poll={poll()} mine={false} />).ui);
    expect(screen.queryByRole('button', { name: /^Remind/ })).toBeNull();
  });

  it('Remind is hidden when only the viewer is left to vote', () => {
    const rows = ['ana', 'ben', 'cal'].map((user_id) => ({ message_id: 'm1', user_id, choice: 'o1' }));
    render(withThread(<PollCard api={coachApi(rows)} messageId="m1" poll={poll()} mine />).ui);
    expect(screen.queryByRole('button', { name: /^Remind/ })).toBeNull();
  });

  it('Share result prefills the final result out of the people who voted', async () => {
    const user = userEvent.setup();
    const rows = [
      { message_id: 'm1', user_id: 'ana', choice: 'o1' },
      { message_id: 'm1', user_id: 'ben', choice: 'o1' },
      { message_id: 'm1', user_id: 'cal', choice: 'o2' },
    ];
    const t = withThread(<PollCard api={api(rows)} messageId="m1" poll={poll({ closedAt: NOW })} mine />);
    render(t.ui);
    await user.click(screen.getByRole('button', { name: 'Share result' }));
    expect(t.replyWith).toHaveBeenCalledWith('m1', 'Van A has it with 2 of the 3 who voted. Van B had 1.');
  });

  it('registers its live actions for the message menu and the phone sheet', () => {
    const { unmount } = render(withThread(<PollCard api={coachApi([])} messageId="m1" poll={poll()} mine />).ui);
    const acts = pollCardActions('m1')!;
    expect(acts.seeVotes).toBeTypeOf('function');
    expect(acts.close).toBeTypeOf('function');
    expect(acts.remind).toMatchObject({ count: 3 });
    expect(acts.share).toBeNull();
    unmount();
    expect(pollCardActions('m1')).toBeNull();
  });

  it('draws no faces on a row (owner call, default B: the count only)', () => {
    render(<PollCard api={api([{ message_id: 'm1', user_id: 'ana', choice: 'o1' }])} messageId="m1" poll={poll()} mine={false} />);
    expect(document.querySelector('.ch-ms-poll__faces')).toBeNull();
  });
});
