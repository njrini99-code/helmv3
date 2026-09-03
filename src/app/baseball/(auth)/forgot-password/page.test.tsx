import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@/test/utils';
import ForgotPasswordPage from './page';

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard, mirroring the golf forgot-password fix
// (docs/ui-audits/GAPS_AUDIT_ONBOARDING_2026-09-02.md §2): this page has the
// identical structure and defect — `noValidate` with no format check before
// calling the reset request — so a malformed address used to be accepted
// with zero visible validation.
// ─────────────────────────────────────────────────────────────────────────────

const mockResetPasswordForEmail = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { resetPasswordForEmail: mockResetPasswordForEmail },
  }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('baseball ForgotPasswordPage', () => {
  it('shows an inline error and never calls resetPasswordForEmail for a malformed email', async () => {
    const { user } = render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument();
  });

  it('calls resetPasswordForEmail with the trimmed, lowercased email and shows the normalized confirmation', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    const { user } = render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText('Email'), '  Coach@Example.COM  ');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
        'coach@example.com',
        expect.objectContaining({ redirectTo: expect.stringContaining('/baseball/reset-password') }),
      );
    });

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(screen.getByText(/coach@example\.com/)).toBeInTheDocument();
  });
});
