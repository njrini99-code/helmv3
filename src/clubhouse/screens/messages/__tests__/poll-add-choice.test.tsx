import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

// #12 (preview walk, 11 Nov): "Should be the ability to add more than one poll". With two empty choices nothing said a
// third was possible. An "Add a choice" key now sits under the rows until there are six.

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));

import '../../../__tests__/dialog-polyfill';
import type { ChMessagesApi } from '../MessagesView';
import type { ChConv } from '../model';
import { clearPollDrafts, PollButton, type ChPollsApi } from '../polls';

afterEach(() => {
  clearPollDrafts();
  cleanup();
});

const conv: ChConv = {
  id: 'c1', group: true, title: 'Travel squad', subtitle: '', memberIds: ['ana', 'ben'], memberCount: 3,
  unread: 0, lastAt: null, lastSenderId: null, lastText: '', creatorId: 'me',
};

function api(): ChMessagesApi {
  const polls: ChPollsApi = { tally: () => null, vote: vi.fn(), pending: new Set<string>(), send: vi.fn(async () => ({ ok: true as const })) } as unknown as ChPollsApi;
  return { polls, meId: 'me', timeZone: 'America/New_York', clock: '12', now: '2026-10-24T15:00:00.000Z', people: {} } as unknown as ChMessagesApi;
}

async function openSheet() {
  const user = userEvent.setup();
  render(<PollButton api={api()} conv={conv} />);
  await user.click(screen.getByRole('button', { name: 'New poll' }));
  return { user, dialog: await screen.findByRole('dialog', { name: 'New poll' }) };
}
const choices = (dialog: HTMLElement) => within(dialog).getAllByRole('textbox', { name: /^Choice \d$/ });

describe('#12 the poll sheet shows how to add a choice', () => {
  it('an empty sheet already offers Add a choice under its two rows', async () => {
    const { dialog } = await openSheet();
    expect(choices(dialog)).toHaveLength(2);
    expect(within(dialog).getByRole('button', { name: 'Add a choice' })).toBeTruthy();
  });

  it('Add a choice adds a third row and moves to it; the key hides while that spare is empty', async () => {
    const { user, dialog } = await openSheet();
    await user.type(choices(dialog)[0]!, 'Van A');
    await user.type(choices(dialog)[1]!, 'Van B');
    // Filling both already brought the automatic spare; the key waits until it is used.
    expect(choices(dialog)).toHaveLength(3);
    expect(within(dialog).queryByRole('button', { name: 'Add a choice' })).toBeNull();
    await user.type(choices(dialog)[2]!, 'Van C');
    expect(choices(dialog)).toHaveLength(4);
    expect(within(dialog).queryByRole('button', { name: 'Add a choice' })).toBeNull();
  });

  it('pressed on an empty sheet it adds row 3 and focuses it', async () => {
    const { user, dialog } = await openSheet();
    await user.click(within(dialog).getByRole('button', { name: 'Add a choice' }));
    const rows = choices(dialog);
    expect(rows).toHaveLength(3);
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(document.activeElement).toBe(rows[2]);
  });

  it('stops at six', async () => {
    const { user, dialog } = await openSheet();
    for (let i = 0; i < 6; i++) await user.type(choices(dialog)[i]!, `Van ${i + 1}`);
    expect(choices(dialog)).toHaveLength(6);
    expect(within(dialog).queryByRole('button', { name: 'Add a choice' })).toBeNull();
    expect(within(dialog).getByText('A poll takes up to 6 choices.')).toBeTruthy();
  });
});
