import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ResolveErrorButton } from '@/app/admin/_components/ResolveErrorButton';
import { resolveErrorFingerprint } from '@/app/admin/actions/resolve-error';

/**
 * Covers the two-step confirm added to unify this button with
 * BulkResolveButton's shape (2026-08-25): resolveErrorFingerprint can flip
 * every open event for a fingerprint in one click, so a mis-click here used
 * to be exactly as irreversible as a bulk resolve, with no confirm step to
 * catch it.
 */

vi.mock('@/app/admin/actions/resolve-error', () => ({
  resolveErrorFingerprint: vi.fn(),
}));

const mockResolve = vi.mocked(resolveErrorFingerprint);

beforeEach(() => {
  mockResolve.mockReset();
});

describe('ResolveErrorButton', () => {
  it('does not resolve on the first click — it asks for confirmation first', () => {
    render(<ResolveErrorButton fingerprint="fp-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark this error resolved' }));

    expect(mockResolve).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('Cancel backs out without calling the action', () => {
    render(<ResolveErrorButton fingerprint="fp-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark this error resolved' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockResolve).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Mark this error resolved' })).toBeInTheDocument();
    expect(screen.queryByText('This cannot be undone.')).not.toBeInTheDocument();
  });

  it('Confirm calls resolveErrorFingerprint with the fingerprint and reports the resolved count', async () => {
    mockResolve.mockResolvedValue({ success: true, resolvedCount: 3 });
    render(<ResolveErrorButton fingerprint="fp-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark this error resolved' }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(mockResolve).toHaveBeenCalledWith('fp-1');
    await waitFor(() => expect(screen.getByText('Resolved 3 events')).toBeInTheDocument());
    // Back to the un-confirmed shape once settled.
    expect(screen.getByRole('button', { name: 'Mark this error resolved' })).toBeInTheDocument();
  });

  it('reports the boring case — "Already resolved" — as success, not failure', async () => {
    mockResolve.mockResolvedValue({ success: true, resolvedCount: 0 });
    render(<ResolveErrorButton fingerprint="fp-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark this error resolved' }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(screen.getByText('Already resolved')).toBeInTheDocument());
  });

  it('surfaces a failed resolve without claiming success', async () => {
    mockResolve.mockResolvedValue({ success: false, error: 'Could not resolve this error. Please try again.' });
    render(<ResolveErrorButton fingerprint="fp-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark this error resolved' }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() =>
      expect(screen.getByText('Could not resolve this error. Please try again.')).toBeInTheDocument(),
    );
  });

  it('shows "Not permitted" when requireSuperAdmin rejects rather than silently doing nothing', async () => {
    mockResolve.mockRejectedValue(new Error('Forbidden'));
    render(<ResolveErrorButton fingerprint="fp-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Mark this error resolved' }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    await waitFor(() => expect(screen.getByText('Not permitted')).toBeInTheDocument());
  });
});
