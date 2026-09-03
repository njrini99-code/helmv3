import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import ForgotPasswordPage from './page';
import { requestPasswordResetAction } from '@/app/golf/actions/auth';

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard for the finding recorded in
// docs/ui-audits/GAPS_AUDIT_ONBOARDING_2026-09-02.md §2: submitting a
// malformed address like "not-an-email" used to be accepted with zero visible
// validation (the form is `noValidate` and `handleSubmit` called the server
// action with no format check), rendering a false-positive "sent" screen.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/app/golf/actions/auth', () => ({
  requestPasswordResetAction: vi.fn(),
}));

const mockedRequestPasswordResetAction = vi.mocked(requestPasswordResetAction);

afterEach(() => {
  vi.clearAllMocks();
});

describe('golf ForgotPasswordPage', () => {
  it('shows an inline error and never calls the action for a malformed email', async () => {
    const { user } = render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(mockedRequestPasswordResetAction).not.toHaveBeenCalled();
    // Still on the form — the false-positive "sent" screen must not render.
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });

  it('shows an inline error and never calls the action for an empty email', async () => {
    const { user } = render(<ForgotPasswordPage />);

    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your email address.');
    expect(mockedRequestPasswordResetAction).not.toHaveBeenCalled();
  });

  it('calls the action with the trimmed, lowercased email and shows the normalized confirmation', async () => {
    mockedRequestPasswordResetAction.mockResolvedValue({
      success: true,
      message: 'If an account exists with this email, a password reset link will be sent.',
    });

    const { user } = render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText(/email/i), '  Coach@Example.COM  ');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockedRequestPasswordResetAction).toHaveBeenCalledWith('coach@example.com');
    });

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText('coach@example.com')).toBeInTheDocument();
  });

  it('clears a validation error once the user edits the field again', async () => {
    const { user } = render(<ForgotPasswordPage />);

    const input = screen.getByLabelText(/email/i);
    await user.type(input, 'not-an-email');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await user.type(input, '.com');
    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
