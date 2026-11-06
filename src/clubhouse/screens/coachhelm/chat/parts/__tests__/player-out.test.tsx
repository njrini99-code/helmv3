import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

const actions = vi.hoisted(() => ({
  requestAskCredits: vi.fn(async () => ({ success: true, id: 'r1' })),
  undoAskCredits: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/golf/actions/coachhelm-ask-credits', () => actions);

import { PlayerOut } from '../Allowance';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const open = async () => {
  render(<PlayerOut from="Jonah · Varsity" />);
  await userEvent.click(screen.getByRole('button', { name: 'Request more' }));
};

/** FID-ASK-12, FID-ASK-14: why it paused and what's still there, then a request the player confirms and can undo. */
describe('out of Ask', () => {
  it('says why, keeps what the player still has, and writes nothing until they confirm', async () => {
    await open();
    expect(screen.getByRole('heading', { name: 'You’ve used this week’s Ask' })).toBeTruthy();
    expect(screen.getByText(/past answers and charts still open/)).toBeTruthy();
    expect(screen.getByText('Jonah · Varsity')).toBeTruthy();
    expect(screen.getByText(/Your coach isn’t emailed/)).toBeTruthy();
    expect(actions.requestAskCredits).not.toHaveBeenCalled();
  });

  it('Cancel sends nothing', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Cancelled. Nothing was sent.')).toBeTruthy();
    expect(actions.requestAskCredits).not.toHaveBeenCalled();
  });

  it('Send request holds with a ring, and Undo takes it back', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(actions.requestAskCredits).toHaveBeenCalledTimes(1);
    const undo = await screen.findByRole('button', { name: 'Undo' });
    expect(undo.querySelector('.drn')).toBeTruthy();
    await userEvent.click(undo);
    expect(actions.undoAskCredits).toHaveBeenCalledWith('r1');
    expect(await screen.findByText('Undone. Nothing was sent.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Request more' })).toBeTruthy();
  });

  it('when Undo closes it says sent, and Request more is spent', async () => {
    vi.useFakeTimers();
    render(<PlayerOut from="Jonah" />);
    fireEvent.click(screen.getByRole('button', { name: 'Request more' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    expect(screen.getByText('Sent. You’ll hear back here.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sent' }).hasAttribute('disabled')).toBe(true);
  });

  it('a second ask this week is told, not offered a card', async () => {
    actions.requestAskCredits.mockResolvedValueOnce({ success: false, error: 'You already asked this week.' } as never);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('button', { name: 'Sent' })).toBeTruthy();
  });
});
