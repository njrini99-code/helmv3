import { act, cleanup, render, screen, within } from '@testing-library/react';
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
import { PollButton, PollCard, type ChPollsApi } from '../screens/messages/polls';

afterEach(() => {
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
    pending: null,
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
    expect(screen.getByText('Choose one')).toBeTruthy();
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
    expect(screen.getByText('Choose any')).toBeTruthy();
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
    expect(screen.getByText('Poll closed')).toBeTruthy();
  });

  it('says when an open poll ends, in the viewer’s clock', () => {
    render(<PollCard api={api([])} messageId="m1" poll={poll({ closesAt: '2026-10-25T23:00:00Z' })} mine={false} />);
    expect(screen.getByText('Ends tomorrow at 6:00 PM')).toBeTruthy();
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
    expect(within(vanA).getByText('Ana Ruiz')).toBeTruthy();
    expect(within(vanA).getByText('You')).toBeTruthy();
    expect(within(dialog).getByText('Ben, Cal')).toBeTruthy();
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

  it('adds a spare choice as the last fills and sends the draft', async () => {
    const user = userEvent.setup();
    const a = api([]);
    render(<PollButton api={a} conv={conv()} />);
    await user.click(screen.getByRole('button', { name: 'New poll' }));
    const dialog = await screen.findByRole('dialog', { name: 'New poll' });
    const send = within(dialog).getByRole('button', { name: 'Send poll' });
    expect((send as HTMLButtonElement).disabled).toBe(true);

    await user.type(within(dialog).getByLabelText('Question'), 'Which van?');
    await user.type(within(dialog).getByRole('textbox', { name: 'Choice 1' }), 'Van A');
    await user.type(within(dialog).getByRole('textbox', { name: 'Choice 2' }), 'Van B');
    expect(within(dialog).getByRole('textbox', { name: 'Choice 3' })).toBeTruthy();

    await user.click(within(dialog).getByRole('switch', { name: 'Allow more than one answer' }));
    await act(async () => {
      await user.click(send);
    });
    expect(a.polls!.send).toHaveBeenCalledWith('c1', expect.objectContaining({ question: 'Which van?', options: ['Van A', 'Van B', ''], multi: true, closesAt: null }), expect.stringMatching(/^[0-9a-f-]{36}$/));
    expect(haptic).toHaveBeenCalledWith('success');
  });

  it('says what is wrong instead of sending', async () => {
    const user = userEvent.setup();
    const a = api([]);
    render(<PollButton api={a} conv={conv()} />);
    await user.click(screen.getByRole('button', { name: 'New poll' }));
    const dialog = await screen.findByRole('dialog', { name: 'New poll' });
    await user.type(within(dialog).getByLabelText('Question'), 'Which van?');
    await user.type(within(dialog).getByRole('textbox', { name: 'Choice 1' }), 'Van A');
    await user.type(within(dialog).getByRole('textbox', { name: 'Choice 2' }), 'van a');
    await user.click(within(dialog).getByRole('button', { name: 'Send poll' }));
    expect(within(dialog).getByRole('alert').textContent).toBe('Two choices say the same thing.');
    expect(a.polls!.send).not.toHaveBeenCalled();
    expect(haptic).toHaveBeenCalledWith('error');
  });

  it('a refused send keeps the draft and shows the reason', async () => {
    const user = userEvent.setup();
    const a = api([], { send: vi.fn(async () => ({ ok: false as const, error: 'Could not send the poll' })) });
    render(<PollButton api={a} conv={conv()} />);
    await user.click(screen.getByRole('button', { name: 'New poll' }));
    const dialog = await screen.findByRole('dialog', { name: 'New poll' });
    await user.type(within(dialog).getByLabelText('Question'), 'Which van?');
    await user.type(within(dialog).getByRole('textbox', { name: 'Choice 1' }), 'Van A');
    await user.type(within(dialog).getByRole('textbox', { name: 'Choice 2' }), 'Van B');
    await user.click(within(dialog).getByRole('button', { name: 'Send poll' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    expect(within(dialog).getByRole('alert').textContent).toBe('Could not send the poll');
    expect((within(dialog).getByLabelText('Question') as HTMLInputElement).value).toBe('Which van?');
    await user.click(within(dialog).getByRole('button', { name: 'Send poll' }));
    const calls = (a.polls!.send as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    // The same draft sent again keeps its id, so a send whose answer was lost can't post the poll twice.
    expect(calls[1]![2]).toBe(calls[0]![2]);
  });

  it('a draft changed after a refused send goes out with a new id', async () => {
    const user = userEvent.setup();
    const a = api([], { send: vi.fn(async () => ({ ok: false as const, error: 'Could not send the poll' })) });
    render(<PollButton api={a} conv={conv()} />);
    await user.click(screen.getByRole('button', { name: 'New poll' }));
    const dialog = await screen.findByRole('dialog', { name: 'New poll' });
    await user.type(within(dialog).getByLabelText('Question'), 'Which van?');
    await user.type(within(dialog).getByRole('textbox', { name: 'Choice 1' }), 'Van A');
    await user.type(within(dialog).getByRole('textbox', { name: 'Choice 2' }), 'Van B');
    await user.click(within(dialog).getByRole('button', { name: 'Send poll' }));
    expect(await within(dialog).findByRole('alert')).toBeTruthy();
    await user.type(within(dialog).getByLabelText('Question'), ' Thursday');
    await user.click(within(dialog).getByRole('button', { name: 'Send poll' }));
    const calls = (a.polls!.send as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    // An edited draft is a different poll; reusing the old id would let the server read it as a replay of the first.
    expect(calls[1]![1]).toMatchObject({ question: 'Which van? Thursday' });
    expect(calls[1]![2]).not.toBe(calls[0]![2]);
  });

  it('counts the end time from the moment Send is pressed, not from when the sheet opened', async () => {
    const user = userEvent.setup();
    const a = api([]);
    const opened = Date.parse('2026-10-24T15:00:00.000Z');
    const now = vi.spyOn(Date, 'now').mockReturnValue(opened);
    try {
      render(<PollButton api={a} conv={conv()} />);
      await user.click(screen.getByRole('button', { name: 'New poll' }));
      const dialog = await screen.findByRole('dialog', { name: 'New poll' });
      await user.type(within(dialog).getByLabelText('Question'), 'Which van?');
      await user.type(within(dialog).getByRole('textbox', { name: 'Choice 1' }), 'Van A');
      await user.type(within(dialog).getByRole('textbox', { name: 'Choice 2' }), 'Van B');
      await user.click(within(dialog).getByRole('radio', { name: '1 hour' }));
      // Twenty minutes pass while the coach finishes the draft.
      now.mockReturnValue(opened + 20 * 60_000);
      await act(async () => {
        await user.click(within(dialog).getByRole('button', { name: 'Send poll' }));
      });
    } finally {
      now.mockRestore();
    }
    expect(a.polls!.send).toHaveBeenCalledWith('c1', expect.objectContaining({ closesAt: '2026-10-24T16:20:00.000Z' }), expect.any(String));
  });
});
