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
    // A sole leader is marked at any time (Q-34).
    expect(b!.getAttribute('aria-label')).toBe('Van B, 1 vote, most votes');
    expect(b!.style.getPropertyValue('--ch-poll-share')).toBe('1');
    // The count is plain text: a live region per card would announce every poll in the thread on each vote.
    // MSG-501: the footer counts the votes cast ("{n} vote(s)"), no "n of m voted".
    expect(document.querySelector('.ch-msd-poll__count')!.textContent).toBe('1 vote');
    expect(screen.queryByRole('status')).toBeNull();
    // One answer: the head says so (MSG-501), no end phrase in it.
    expect(document.querySelector('.ch-msd-poll__head')!.textContent).toBe('Poll · Choose one');
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
    expect(mine.getAttribute('aria-label')).toBe('Van A, 1 vote, your vote, most votes');
    await user.click(mine);
    expect(a2.polls!.vote).toHaveBeenLastCalledWith('m1', expect.anything(), []);
  });

  it('a multi-answer poll adds picks in option order', async () => {
    const user = userEvent.setup();
    const p = poll({ multi: true, options: [{ id: 'o1', label: 'Tue' }, { id: 'o2', label: 'Wed' }, { id: 'o3', label: 'Thu' }] });
    const a = api([{ message_id: 'm1', user_id: 'me', choice: 'o3' }]);
    render(<PollCard api={a} messageId="m1" poll={p} mine={false} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    expect(document.querySelector('.ch-msd-poll__head')!.textContent).toBe('Poll · Choose any');
    await user.click(screen.getByRole('checkbox', { name: /Tue/ }));
    expect(a.polls!.vote).toHaveBeenLastCalledWith('m1', expect.anything(), ['o1', 'o3']);
  });

  it('a closed poll takes no votes, says Final, and names the leader', async () => {
    const user = userEvent.setup();
    const a = api([{ message_id: 'm1', user_id: 'ana', choice: 'o2' }]);
    render(<PollCard api={a} messageId="m1" poll={poll({ closedAt: '2026-10-24T14:00:00Z' })} mine />);
    expect(document.querySelector('.ch-msd-poll__head')!.textContent).toBe('Poll · Final');
    expect(document.querySelector('.ch-msd-poll__count')!.textContent).toBe('1 vote · Final');
    expect(screen.getByRole('radio', { name: /Van B/ }).getAttribute('aria-label')).toBe('Van B, 1 vote, your vote'.replace(', your vote', ', most votes'));
    await user.click(screen.getByRole('radio', { name: /Van A/ }));
    expect(a.polls!.vote).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Close poll' })).toBeNull();
  });

  it('a poll past its end time is closed too', () => {
    render(<PollCard api={api([])} messageId="m1" poll={poll({ closesAt: '2026-10-24T14:59:00Z' })} mine />);
    expect(document.querySelector('.ch-msd-poll__count')!.textContent).toBe('No one voted · Voting ended');
  });

  it('says when an open poll closes, in the viewer’s clock', () => {
    // "tomorrow" is read against the clock, so pin it: the day before the poll closes.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-24T15:00:00Z'));
    try {
      render(<PollCard api={api([])} messageId="m1" poll={poll({ closesAt: '2026-10-25T23:00:00Z' })} mine={false} />);
      expect(document.querySelector('.ch-msd-poll__count')!.textContent).toBe('No votes yet · Closes tomorrow 6 PM');
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for votes before it takes a tap, and offers Retry when they fail', async () => {
    const user = userEvent.setup();
    const loading = api(null);
    const { rerender } = render(<PollCard api={loading} messageId="m1" poll={poll()} mine={false} />);
    expect(document.querySelector('.ch-msd-poll__count')!.textContent).toBe('Loading votes…');
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
    // D29: no vote times; "You" first, then by name. A card per choice with its share (MSG-505).
    expect([...vanA.querySelectorAll('.ch-msd-vg__name')].map((n) => n.textContent)).toEqual(['You', 'Ana Ruiz']);
    expect(vanA.querySelector('.ch-msd-vg__h small')!.textContent).toBe('2 · 100%');
    expect((vanA.querySelector('.ch-msd-vg__bar') as HTMLElement).style.getPropertyValue('--ch-msd-w')).toBe('100%');
    expect(within(dialog).getByRole('region', { name: 'Van B' }).textContent).toContain('No votes yet');
    // Q-09 / Q-16: who has not voted is for whoever asked and for coaches; a player who did not send the poll does not see it.
    expect(within(dialog).queryByRole('region', { name: 'Hasn’t voted' })).toBeNull();
    expect(dialog.textContent).not.toMatch(/\d:\d\d/);
  });

  it('See votes: the sender, and a coach, also see who has not voted (coaches left out)', async () => {
    const user = userEvent.setup();
    const rows = [{ message_id: 'm1', user_id: 'ana', choice: 'o1' }];
    for (const viewer of ['sender', 'coach'] as const) {
      const a = viewer === 'coach' ? (() => { const x = api(rows) as ChMessagesApi & { viewer: { role: string } }; x.viewer.role = 'coach'; return x; })() : api(rows);
      render(<PollCard api={a} messageId="m1" poll={poll()} mine={viewer === 'sender'} />);
      await user.click(screen.getByRole('button', { name: 'See votes' }));
      const dialog = await screen.findByRole('dialog');
      const waiting = within(dialog).getByRole('region', { name: 'Hasn’t voted' });
      // The coach is out of the list; a player who sent the poll is in it as "You" until they vote.
      const names = [...waiting.querySelectorAll('.ch-msd-vg__name')].map((n) => n.textContent);
      expect(names).toEqual(viewer === 'coach' ? ['Ben Cho', 'Cal Park'] : ['You', 'Ben Cho', 'Cal Park']);
      cleanup();
    }
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
    // MSG-501: the card draws the count and See votes only; Close poll is a row of the message's lift menu, which runs this.
    expect(within(document.querySelector('.ch-msd-poll__foot') as HTMLElement).getAllByRole('button').map((b) => b.textContent)).toEqual(['See votes']);
    act(() => pollCardActions('m1')!.close!());
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
  it('D11 / MSG-501: the footer counts the votes cast, a voter who has left included', () => {
    const rows = [
      { message_id: 'm1', user_id: 'gone', choice: 'o1' },
      { message_id: 'm1', user_id: 'ana', choice: 'o1' },
    ];
    render(<PollCard api={api(rows, {}, { memberIds: ['ana'] })} messageId="m1" poll={poll()} mine={false} />);
    expect(document.querySelector('.ch-msd-poll__count')!.textContent).toBe('2 votes');
    cleanup();
    // A multi-answer poll counts a vote per choice picked.
    const multi = poll({ multi: true });
    render(<PollCard api={api([{ message_id: 'm1', user_id: 'ana', choice: 'o1,o2' }], {}, { memberIds: ['ana'] })} messageId="m1" poll={multi} mine={false} />);
    expect(document.querySelector('.ch-msd-poll__count')!.textContent).toBe('2 votes');
  });

  it('D13: counts down the last hour and turns final at its exact end', () => {
    vi.useFakeTimers({ now: Date.parse(NOW) });
    try {
      const closesAt = new Date(Date.parse(NOW) + 42 * 60_000).toISOString();
      render(<PollCard api={api([])} messageId="m1" poll={poll({ closesAt })} mine={false} />);
      const foot = () => document.querySelector('.ch-msd-poll__count')!.textContent;
      expect(foot()).toBe('No votes yet · Closes in 42 min');
      act(() => { vi.advanceTimersByTime(41 * 60_000 + 30_000); });
      expect(foot()).toBe('No votes yet · Closes in under a minute');
      act(() => { vi.advanceTimersByTime(31_000); });
      expect(foot()).toBe('No one voted · Voting ended');
      expect(document.querySelector('.ch-msd-poll__head')!.textContent).toBe('Poll · Final');
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
      expect(document.querySelector('.ch-msd-poll__head')!.textContent).toBe('Poll · Choose one');
      expect(Math.max(...spy.mock.calls.map((c) => Number(c[1] ?? 0)))).toBeLessThanOrEqual(6 * 3_600_000);
      // The device slept past the end (iOS pauses timers): showing the page again turns it final at once.
      vi.setSystemTime(Date.parse(closesAt) + 1_000);
      act(() => { window.dispatchEvent(new Event('pageshow')); });
      expect(document.querySelector('.ch-msd-poll__head')!.textContent).toBe('Poll · Final');
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

describe('PollCard, MSG-501 to MSG-503: the Nov 7 card and its states', () => {
  const n = (label: RegExp) => screen.getByRole('radio', { name: label }).querySelector('.ch-msd-poll__n')!.textContent;

  it('open: an honest 0, one fill per row and no level line, no leader marked, "No votes yet"', () => {
    render(<PollCard api={api([])} messageId="m1" poll={poll()} mine={false} />);
    expect(n(/Van A/)).toBe('0');
    expect(document.querySelectorAll('.ch-msd-poll__fill')).toHaveLength(2);
    expect(document.querySelector('.ch-ms-poll__level, .ch-msd-poll__level')).toBeNull();
    expect(document.querySelector('.ch-msd-poll__chip')).toBeNull();
    expect(document.querySelector('.ch-msd-poll__count')!.textContent).toBe('No votes yet');
  });

  it('"Most votes" shows on a sole leader with a vote, open or final; a tie marks nobody (Q-34)', () => {
    const open = [{ message_id: 'm1', user_id: 'ana', choice: 'o2' }];
    render(<PollCard api={api(open)} messageId="m1" poll={poll()} mine={false} />);
    expect(screen.getByRole('radio', { name: /Van B/ }).querySelector('.ch-msd-poll__chip')!.textContent).toBe('Most votes');
    expect(screen.getByRole('radio', { name: /Van B/ }).getAttribute('aria-label')).toContain('most votes');
    cleanup();
    render(<PollCard api={api(open)} messageId="m1" poll={poll({ closedAt: '2026-10-24T14:00:00Z' })} mine />);
    expect(document.querySelector('.ch-msd-poll__head')!.textContent).toBe('Poll · Final');
    expect(n(/Van A/)).toBe('0');
    expect(screen.getByRole('radio', { name: /Van B/ }).querySelector('.ch-msd-poll__chip')!.textContent).toBe('Most votes');
    cleanup();
    const tie = [
      { message_id: 'm1', user_id: 'ana', choice: 'o1' },
      { message_id: 'm1', user_id: 'ben', choice: 'o2' },
    ];
    render(<PollCard api={api(tie)} messageId="m1" poll={poll({ closesAt: '2026-10-24T14:59:00Z' })} mine={false} />);
    expect(document.querySelector('.ch-msd-poll__head')!.textContent).toBe('Poll · Final');
    expect(document.querySelector('.ch-msd-poll__chip')).toBeNull();
    cleanup();
    render(<PollCard api={api([])} messageId="m1" poll={poll({ closesAt: '2026-10-24T14:59:00Z' })} mine={false} />);
    expect(document.querySelector('.ch-msd-poll__count')!.textContent).toBe('No one voted · Voting ended');
  });

  it('the bottom-right corner is tight on mine only (the class the CSS keys on)', () => {
    const { rerender } = render(<PollCard api={api([])} messageId="m1" poll={poll()} mine />);
    expect(document.querySelector('.ch-msd-poll')!.className).toContain('is-mine');
    rerender(<PollCard api={api([])} messageId="m1" poll={poll()} mine={false} />);
    expect(document.querySelector('.ch-msd-poll')!.className).toContain('is-theirs');
    expect(document.querySelector('[data-ch-bubble]')).toBe(document.querySelector('.ch-msd-poll'));
  });

  it('a failed read says so and offers Retry', () => {
    render(<PollCard api={api(null, { error: 'Votes could not be loaded. Tap to retry.' })} messageId="m1" poll={poll({ multi: true })} mine={false} />);
    expect(document.querySelector('.ch-msd-poll__count')!.textContent).toBe('Votes didn’t load');
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('voter faces: yours first, up to three, and counts render at once with no crossfade copy', () => {
    const rows = ['ana', 'ben', 'cal', 'me'].map((user_id) => ({ message_id: 'm1', user_id, choice: 'o1' }));
    render(<PollCard api={api(rows)} messageId="m1" poll={poll()} mine={false} />);
    const faces = [...screen.getByRole('radio', { name: /Van A/ }).querySelectorAll('.ch-msd-poll__faces > span')];
    expect(faces).toHaveLength(3);
    expect(faces[0]!.textContent).toMatch(/NR|N/);
    expect(screen.getByRole('radio', { name: /Van A/ }).querySelectorAll('.ch-msd-poll__n')).toHaveLength(1);
    expect(n(/Van A/)).toBe('4');
  });

  it('MOT-POLL-1/3: only the tapped row plays the check and your face pop', async () => {
    const user = userEvent.setup();
    const a = api([{ message_id: 'm1', user_id: 'me', choice: 'o1' }]);
    render(<PollCard api={a} messageId="m1" poll={poll()} mine={false} />);
    // Drawn voted: at rest, nothing pops.
    expect(document.querySelector('.ch-msd-poll__mark[data-pop]')).toBeNull();
    expect(document.querySelector('.ch-msd-poll__faces > span[data-pop]')).toBeNull();
    await user.click(screen.getByRole('radio', { name: /Van B/ }));
    expect(a.polls!.vote).toHaveBeenLastCalledWith('m1', expect.anything(), ['o2']);
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
    const t = withThread(<PollCard api={coachApi([{ message_id: 'm1', user_id: 'ana', choice: 'o1' }])} messageId="m1" poll={poll()} mine />);
    render(t.ui);
    expect(pollCardActions('m1')!.remind!.count).toBe(2);
    act(() => pollCardActions('m1')!.remind!.run());
    // Q-09: the reminder names the poll (and when it closes); it fills the composer and never sends.
    expect(t.replyWith).toHaveBeenCalledWith('m1', 'Reminder: vote in the “Which van are you riding in?” poll.');
    cleanup();
    render(withThread(<PollCard api={api([])} messageId="m1" poll={poll()} mine={false} />).ui);
    expect(pollCardActions('m1')!.remind).toBeNull();
    expect(screen.queryByRole('button', { name: /^Remind/ })).toBeNull();
  });

  it('Remind is hidden when only the viewer is left to vote', () => {
    const rows = ['ana', 'ben', 'cal'].map((user_id) => ({ message_id: 'm1', user_id, choice: 'o1' }));
    render(withThread(<PollCard api={coachApi(rows)} messageId="m1" poll={poll()} mine />).ui);
    expect(pollCardActions('m1')!.remind).toBeNull();
  });

  it('Share result prefills the final result out of the people who voted', async () => {
    const rows = [
      { message_id: 'm1', user_id: 'ana', choice: 'o1' },
      { message_id: 'm1', user_id: 'ben', choice: 'o1' },
      { message_id: 'm1', user_id: 'cal', choice: 'o2' },
    ];
    const t = withThread(<PollCard api={api(rows)} messageId="m1" poll={poll({ closedAt: NOW })} mine />);
    render(t.ui);
    act(() => pollCardActions('m1')!.share!());
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
});

describe('the New poll sheet: a send whose outcome is not known', () => {
  const openSheet = async (a: ChMessagesApi) => {
    const user = userEvent.setup();
    render(<PollButton api={a} conv={conv()} />);
    await user.click(screen.getByRole('button', { name: 'New poll' }));
    return { user, dialog: await screen.findByRole('dialog', { name: 'New poll' }) };
  };
  const sendKey = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: /^Send( poll)?$/ });

  it('CH-7031 an edited retry after a send that threw passes the earlier id; an earlier copy that landed asks before anything more is posted', async () => {
    const send = vi
      .fn<ChPollsApi['send']>()
      .mockResolvedValueOnce({ ok: false, error: 'Try again in a moment.', threw: true })
      .mockResolvedValueOnce({ ok: false, error: 'An earlier copy of this poll was already sent', earlierCopy: true })
      .mockResolvedValueOnce({ ok: true });
    const a = api([], { send });
    const { user, dialog } = await openSheet(a);
    await user.type(within(dialog).getByLabelText('Question'), 'Which van?');
    await user.type(within(dialog).getByRole('textbox', { name: 'Choice 1' }), 'Van A');
    await user.type(within(dialog).getByRole('textbox', { name: 'Choice 2' }), 'Van B');
    await user.click(sendKey(dialog));
    await user.type(within(dialog).getByLabelText('Question'), ' Thursday');
    await user.click(sendKey(dialog));
    const first = send.mock.calls[0]!;
    const second = send.mock.calls[1]!;
    // The edit is a new poll (a new id) that names the one whose outcome is unknown.
    expect(second[2]).not.toBe(first[2]);
    expect(second[3]).toBe(first[2]);
    expect(await within(dialog).findByText('An earlier copy of this poll was already sent')).toBeTruthy();
    expect(dialog.querySelector('[data-ch-code="CH-7031"]')).not.toBeNull();
    // Nothing more is posted until the person chooses.
    expect(send).toHaveBeenCalledTimes(2);
    await user.click(within(dialog).getByRole('button', { name: 'Send this version' }));
    const third = send.mock.calls[2]!;
    expect(third[2]).not.toBe(second[2]);
    expect(third[3]).toBeUndefined();
  });
});
