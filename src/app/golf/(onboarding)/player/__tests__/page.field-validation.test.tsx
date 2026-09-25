import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
    }),
  }),
}));
vi.mock('@/app/golf/actions/onboarding', () => ({
  ensurePlayerRecord: vi.fn(async () => ({ success: true })),
  completePlayerOnboarding: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/components/golf/scenes/CoastalScene', () => ({ CoastalScene: () => null }));
vi.mock('@/components/golf/scenes/CourseScene', () => ({ CourseScene: () => null }));
vi.mock('@/lib/coachhelm/v3/motion', () => ({ useReducedMotionGuard: () => true }));

const { default: GolfPlayerOnboarding } = await import('../page');

describe('player onboarding: field-level validation (STATE-O2)', () => {
  it('Continue marks each empty required field inline and focuses the first', async () => {
    render(<GolfPlayerOnboarding />);
    const first = await screen.findByLabelText(/First Name/);
    const cont = screen.getByRole('button', { name: /Continue/ });
    expect(cont).toBeEnabled();

    fireEvent.change(first, { target: { value: '' } });
    fireEvent.click(cont);

    await waitFor(() => expect(first).toHaveAttribute('aria-invalid', 'true'));
    expect(screen.getByText('Enter your first name.')).toBeInTheDocument();
    expect(screen.getByText('Enter your last name.')).toBeInTheDocument();
    expect(document.activeElement).toBe(first);

    fireEvent.change(first, { target: { value: 'Cole' } });
    expect(screen.queryByText('Enter your first name.')).toBeNull();
  });
});
