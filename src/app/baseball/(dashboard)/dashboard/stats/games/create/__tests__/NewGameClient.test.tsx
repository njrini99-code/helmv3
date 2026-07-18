// =============================================================================
// NewGameClient.test.tsx — issue #952
//
// Before this fix, `handleSubmit` awaited `createGame()` with no try/catch.
// `createGame` is server-side wrapped and should always RESOLVE to a
// `CreateGameResult`, but the client-side call is a network round trip to
// invoke the server action, which CAN reject outright (dropped connection,
// server restart mid-request). A rejection stranded `saving=true` forever:
// the submit button stayed disabled at "Creating…" with no error shown at
// all. This guards the fix: a rejected `createGame()` call resets `saving`
// (the submit button becomes clickable again), surfaces the error inline AND
// via the repo's shared toast, and leaves the form fields untouched.
// =============================================================================

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createGameMock = vi.fn();
vi.mock('@/app/baseball/actions/games', () => ({
  createGame: (...args: unknown[]) => createGameMock(...args),
}));

const routerPushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock, back: vi.fn() }),
}));

const toastErrorMock = vi.fn();
vi.mock('@/components/ui/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: vi.fn(),
    warning: vi.fn(),
  },
}));

import { NewGameClient } from '../NewGameClient';

function submitButton() {
  return screen.getByRole('button', { name: /Create Game|Creating/i });
}

describe('NewGameClient — createGame() rejection is caught (#952)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resets saving, surfaces the error inline + via toast, and keeps form state when createGame() rejects', async () => {
    createGameMock.mockRejectedValue(new Error('fetch failed'));

    render(<NewGameClient teamId="team-1" teamName="Test Team" />);

    // Fill a field so we can assert it survives the failed submit.
    fireEvent.change(screen.getByLabelText(/Opponent Name/), {
      target: { value: 'State University' },
    });

    fireEvent.click(submitButton());

    // Immediately disabled + relabeled while the (doomed) request is in flight.
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();

    // The rejection is caught: the button recovers instead of hanging forever.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Create Game/i })).toBeEnabled(),
    );

    expect(screen.getByText('fetch failed')).toBeInTheDocument();
    expect(toastErrorMock).toHaveBeenCalledWith('Could not create game', {
      description: 'fetch failed',
    });
    expect(routerPushMock).not.toHaveBeenCalled();

    // Form state is preserved — nothing was cleared on failure.
    expect(screen.getByLabelText(/Opponent Name/)).toHaveValue('State University');
  });

  it('falls back to a generic message when createGame() rejects with a non-Error value', async () => {
    createGameMock.mockRejectedValue('boom');

    render(<NewGameClient teamId="team-1" teamName="Test Team" />);
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(screen.getByText('Failed to create game. Please try again.')).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Create Game/i })).toBeEnabled();
    expect(toastErrorMock).toHaveBeenCalledWith('Could not create game', {
      description: 'Failed to create game. Please try again.',
    });
  });

  it('resets saving and shows the inline error (no toast) when createGame() resolves with success: false', async () => {
    createGameMock.mockResolvedValue({ success: false, error: 'Team not found' });

    render(<NewGameClient teamId="team-1" teamName="Test Team" />);
    fireEvent.click(submitButton());

    await waitFor(() => expect(screen.getByText('Team not found')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Create Game/i })).toBeEnabled();
    // The logical `success: false` path is unchanged by this fix — it never
    // toasted before, and still shouldn't (only the newly-caught rejection
    // path gets the extra toast signal).
    expect(toastErrorMock).not.toHaveBeenCalled();
  });

  it('navigates to the new game and does not reset saving on success', async () => {
    createGameMock.mockResolvedValue({ success: true, data: { id: 'game-123' } });

    render(<NewGameClient teamId="team-1" teamName="Test Team" />);
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(routerPushMock).toHaveBeenCalledWith(
        '/baseball/dashboard/stats/games/game-123',
      ),
    );
    // Deliberately left disabled through navigation — see NewGameClient.tsx.
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  });
});
