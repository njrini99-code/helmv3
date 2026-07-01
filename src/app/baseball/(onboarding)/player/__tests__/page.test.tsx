// =============================================================================
// src/app/baseball/(onboarding)/player/__tests__/page.test.tsx
//
// GUARD (#464 AC): "handleComplete calls completePlayerOnboarding with the
// collected form data instead of a client `.update()`." This is the
// component-level wiring test — complete-player-onboarding.test.ts covers the
// server action itself, but nothing previously asserted the *page* actually
// calls it. Also guards the verify mustFix: the six measurables fields
// (height_feet, pitch_velo, exit_velo, sixty_time, bats, throws) collected in
// the wizard must be threaded through to the server action call, not silently
// dropped.
// =============================================================================

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const completePlayerOnboardingMock = vi.fn();
const processTeamInvitationMock = vi.fn();

vi.mock('@/app/baseball/actions/onboarding', () => ({
  completePlayerOnboarding: (...args: unknown[]) => completePlayerOnboardingMock(...args),
}));

vi.mock('@/app/baseball/actions/teams', () => ({
  processTeamInvitation: (...args: unknown[]) => processTeamInvitationMock(...args),
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              single: async () => ({ data: null }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', role: 'player', email: 'p@example.com' },
    // No baseball_players row yet — the #464 repro case (failed seed / alternate
    // auth path). `player` is undefined so onboarding_completed is falsy and the
    // wizard renders instead of bouncing to the dashboard.
    player: undefined,
    loading: false,
  }),
}));

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => false,
    LazyMotion: ({ children }: { children: ReactNode }) => children,
    domAnimation: {},
    m: new Proxy(
      {},
      {
        get: (_target, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>((props, ref) => {
            const {
              children,
              initial: _initial,
              animate: _animate,
              exit: _exit,
              variants: _variants,
              transition: _transition,
              custom: _custom,
              ...rest
            } = props;
            void _initial;
            void _animate;
            void _exit;
            void _variants;
            void _transition;
            void _custom;
            return React.createElement(prop as string, { ...rest, ref }, children);
          }),
      },
    ),
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
  };
});

import BaseballPlayerOnboarding from '../page';

describe('BaseballPlayerOnboarding — Complete step wiring (#464)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    completePlayerOnboardingMock.mockResolvedValue({
      success: true,
      redirectTo: '/baseball/dashboard',
    });
    sessionStorage.clear();
  });

  it('calls completePlayerOnboarding (not a client .update()) with the collected form data, including all six measurables', async () => {
    render(<BaseballPlayerOnboarding />);

    // Pre-step: player type selection.
    fireEvent.click(screen.getByText('High School Player'));

    // Step 1: About You — required fields + bats/throws (collected on this step).
    // getByLabelText uses regex matches: required-field labels append a "*" span.
    fireEvent.change(screen.getByLabelText(/^First Name/), { target: { value: 'Jordan' } });
    fireEvent.change(screen.getByLabelText(/^Last Name/), { target: { value: 'Rivera' } });
    fireEvent.change(screen.getByLabelText(/^Primary Position/), { target: { value: 'SS' } });
    fireEvent.change(screen.getByLabelText(/^Bats/), { target: { value: 'L' } });
    fireEvent.change(screen.getByLabelText(/^Throws/), { target: { value: 'R' } });
    fireEvent.click(screen.getByText('Continue'));

    // Step 2: Measurables.
    await screen.findByRole('heading', { name: 'Measurables' });
    fireEvent.change(screen.getByLabelText('Weight (lbs)'), { target: { value: '190' } });
    fireEvent.change(screen.getByLabelText('Pitch Velo'), { target: { value: '88' } });
    fireEvent.change(screen.getByLabelText('Exit Velo'), { target: { value: '95' } });
    fireEvent.change(screen.getByLabelText('60-Yard'), { target: { value: '6.7' } });
    fireEvent.click(screen.getByText('Continue'));

    // Step 3: Join a Team — skip.
    await screen.findByText('Skip for Now');
    fireEvent.click(screen.getByText('Skip for Now'));

    // Step 4: Complete.
    await screen.findByText('Go to Dashboard');
    fireEvent.click(screen.getByText('Go to Dashboard'));

    await waitFor(() => expect(completePlayerOnboardingMock).toHaveBeenCalledTimes(1));

    const input = completePlayerOnboardingMock.mock.calls[0]![0];
    expect(input.firstName).toBe('Jordan');
    expect(input.lastName).toBe('Rivera');
    expect(input.primaryPosition).toBe('SS');
    // The six measurables the verify mustFix requires be threaded through —
    // none of these have any other write path in the app.
    expect(input.bats).toBe('L');
    expect(input.throws).toBe('R');
    expect(input.heightFeet).toBeTruthy();
    expect(input.pitchVelo).toBe(88);
    expect(input.exitVelo).toBe(95);
    expect(input.sixtyTime).toBe(6.7);
  });
});
