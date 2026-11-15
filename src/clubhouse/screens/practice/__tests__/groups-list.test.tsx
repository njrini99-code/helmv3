import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// router.refresh does nothing here: the list must not wait on the server's next render to show what the coach just did (coach audit
// 13 Nov 2026, §5 Groups: "Save works but the list doesn't refresh … until a reload").
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/golf/dashboard/practice/groups' }));
const actions = vi.hoisted(() => ({ savePracticeGroup: vi.fn(), deletePracticeGroup: vi.fn() }));
vi.mock('@/app/golf/actions/practice-library', () => ({ createTeamDrill: vi.fn(), archiveTeamDrill: vi.fn(), copyLibraryDrill: vi.fn(), updateTeamDrill: vi.fn(), savePracticeTemplate: vi.fn(), renamePracticeTemplate: vi.fn(), deletePracticeTemplate: vi.fn(), ...actions }));

import { ToastProvider } from '../../../ui/Toast';
import { GroupsPage } from '../LibraryPages';
import type { ChPracticeGroup } from '../../../data/practice-library-shape';

beforeEach(() => {
  // jsdom has no modal dialog: the sheet and the confirm open and close by their attribute.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const roster = [
  { id: 'p1', name: 'Ava Larsen' },
  { id: 'p2', name: 'Ben Sawyer' },
];
const pod: ChPracticeGroup = { id: 'g1', name: 'Putting pod', playerIds: ['p1'], usedIn: null };
const page = (groups: ChPracticeGroup[]) => <ToastProvider><GroupsPage teamId="t" groups={groups} roster={roster} /></ToastProvider>;

describe('Practice groups', () => {
  it('a saved group shows in the list without a reload', async () => {
    actions.savePracticeGroup.mockResolvedValue({ success: true, id: 'g9' });
    render(page([]));
    await userEvent.click(screen.getAllByRole('button', { name: 'New group' })[0]!);
    await userEvent.type(screen.getByLabelText('Name'), 'Wedge crew');
    await userEvent.click(screen.getByRole('checkbox', { name: /Ben Sawyer/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.savePracticeGroup).toHaveBeenCalledWith({ teamId: 't', groupId: null, name: 'Wedge crew', playerIds: ['p2'] });
    expect(screen.queryByText('No saved groups yet')).toBeNull();
    expect(screen.getByRole('button', { name: /Wedge crew/ })).toBeTruthy();
    expect(router.refresh).toHaveBeenCalled();
  });

  it('an edited group shows its new name and players without a reload', async () => {
    actions.savePracticeGroup.mockResolvedValue({ success: true, id: 'g1' });
    render(page([pod]));
    await userEvent.click(screen.getByRole('button', { name: /Putting pod/ }));
    const name = screen.getByLabelText('Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Lag pod');
    await userEvent.click(screen.getByRole('checkbox', { name: /Ben Sawyer/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const card = screen.getByRole('button', { name: /Lag pod/ });
    expect(within(card).getByText('2 players')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Putting pod/ })).toBeNull();
  });

  it('Edit group has Delete, which asks first and then leaves the list without a reload', async () => {
    actions.deletePracticeGroup.mockResolvedValue({ success: true });
    render(page([pod]));
    await userEvent.click(screen.getByRole('button', { name: /Putting pod/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete group' }));
    expect(screen.getByText('Delete this group?')).toBeTruthy();
    expect(actions.deletePracticeGroup).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(actions.deletePracticeGroup).toHaveBeenCalledWith({ teamId: 't', groupId: 'g1' });
    expect(screen.queryByRole('button', { name: /Putting pod/ })).toBeNull();
    expect(screen.getByText('No saved groups yet')).toBeTruthy();
  });

  it('a failed save keeps the sheet open with the reason and changes nothing in the list', async () => {
    actions.savePracticeGroup.mockResolvedValue({ success: false, error: 'Couldn’t save the group.' });
    render(page([pod]));
    await userEvent.click(screen.getAllByRole('button', { name: 'New group' })[0]!);
    await userEvent.type(screen.getByLabelText('Name'), 'Wedge crew');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert').textContent).toBe('Couldn’t save the group.');
    expect(screen.queryByRole('button', { name: /Wedge crew/ })).toBeNull();
  });

  it('the server’s next render replaces the list on screen', async () => {
    const { rerender } = render(page([pod]));
    rerender(page([{ ...pod, id: 'g2', name: 'Another coach’s group' }]));
    expect(screen.getByRole('button', { name: /Another coach’s group/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Putting pod/ })).toBeNull();
  });
});
