/**
 * W30 surface-integration — RoundReviewLlmCard render tests.
 *
 * Mirrors the HeroNarrativeCard pattern: card mounts with the
 * fallback string and swaps to LLM prose once the server action
 * resolves. Failure-silent — never renders empty/error UI when the
 * action returns ok=false or the LLM falls back.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Mock the server action before importing the component. The component
// imports the action eagerly (top-level import), so the mock must be in
// place before module evaluation.
const generateLlmRoundReviewMock = vi.fn();
vi.mock('@/app/golf/actions/v3/llm', () => ({
  generateLlmRoundReview: (...args: unknown[]) => generateLlmRoundReviewMock(...args),
}));

// Stub framer-motion the same way HeroInsightCard tests do — we only
// care that the DOM contents render, not that the animation runs.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    useReducedMotion: () => false,
    m: new Proxy(
      {},
      {
        get: (_target, prop) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.forwardRef<HTMLElement, any>((props, ref) => {
            const {
              children,
              whileTap: _whileTap,
              whileHover: _whileHover,
              initial: _i,
              animate: _a,
              exit: _e,
              transition: _t,
              variants: _v,
              ...rest
            } = props;
            void _whileTap;
            void _whileHover;
            void _i;
            void _a;
            void _e;
            void _t;
            void _v;
            return React.createElement(prop as string, { ...rest, ref }, children);
          }),
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

import { RoundReviewLlmCard } from '@/components/golf/coachhelm/v3/RoundReviewLlmCard';

describe('RoundReviewLlmCard', () => {
  beforeEach(() => {
    generateLlmRoundReviewMock.mockReset();
  });

  it('renders the fallback text immediately on mount', () => {
    generateLlmRoundReviewMock.mockImplementation(
      () => new Promise(() => undefined), // never resolves
    );
    render(
      <RoundReviewLlmCard
        roundId="round-1"
        fallbackText="You shot 76 (+4) at Lakewood. Solid round."
      />,
    );
    expect(
      screen.getByText(/You shot 76 \(\+4\) at Lakewood\. Solid round\./),
    ).toBeInTheDocument();
    expect(screen.getByTestId('round-review-llm-card')).toBeInTheDocument();
  });

  it('swaps in the LLM prose when the action resolves with used_llm=true', async () => {
    generateLlmRoundReviewMock.mockResolvedValue({
      ok: true,
      text: 'Sharp round at Lakewood — your iron play held the scorecard together. Lean into approach reps Tuesday.',
      used_llm: true,
    });
    render(
      <RoundReviewLlmCard
        roundId="round-1"
        fallbackText="You shot 76 (+4) at Lakewood. Solid round."
      />,
    );
    await waitFor(() => {
      expect(
        screen.getByText(/Sharp round at Lakewood/),
      ).toBeInTheDocument();
    });
    expect(screen.getByTestId('round-review-llm-card').dataset.usedLlm).toBe('true');
  });

  it('keeps the fallback text when the action returns ok=false (failure-silent)', async () => {
    generateLlmRoundReviewMock.mockResolvedValue({ ok: false, error: 'Round not found' });
    render(
      <RoundReviewLlmCard
        roundId="round-1"
        fallbackText="You shot 76 (+4) at Lakewood. Solid round."
      />,
    );
    // Wait for the effect's microtask to flush, then assert the
    // fallback is still onscreen and no error message rendered.
    await waitFor(() => {
      expect(generateLlmRoundReviewMock).toHaveBeenCalled();
    });
    expect(
      screen.getByText(/You shot 76 \(\+4\) at Lakewood\. Solid round\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Round not found/)).toBeNull();
    expect(screen.queryByText(/error/i)).toBeNull();
  });

  it('keeps the fallback text when the action returns used_llm=false (budget-gated)', async () => {
    // compose() returns ok=true + fallback text + used_llm=false when
    // the budget gate trips. The card should render that text (which
    // is the same fallback) and NOT show the AI badge.
    generateLlmRoundReviewMock.mockResolvedValue({
      ok: true,
      text: 'You shot 76 (+4) at Lakewood. Solid round.',
      used_llm: false,
    });
    render(
      <RoundReviewLlmCard
        roundId="round-1"
        fallbackText="You shot 76 (+4) at Lakewood. Solid round."
      />,
    );
    await waitFor(() => {
      expect(generateLlmRoundReviewMock).toHaveBeenCalled();
    });
    expect(
      screen.getByText(/You shot 76 \(\+4\) at Lakewood\. Solid round\./),
    ).toBeInTheDocument();
    expect(screen.getByTestId('round-review-llm-card').dataset.usedLlm).toBe('false');
  });

  it('passes the roundId and fallback to the server action', async () => {
    generateLlmRoundReviewMock.mockResolvedValue({
      ok: true,
      text: 'LLM text',
      used_llm: true,
    });
    render(
      <RoundReviewLlmCard
        roundId="round-xyz"
        fallbackText="fallback-text-marker"
      />,
    );
    await waitFor(() => {
      expect(generateLlmRoundReviewMock).toHaveBeenCalledWith(
        'round-xyz',
        'fallback-text-marker',
      );
    });
  });
});
