/**
 * AIInsightsPanel component tests — Team D / Task D2.
 *
 * Verifies the Helpful / Got It / Dismiss buttons render conditionally on the
 * callbacks being supplied, and that clicking them invokes the callback with
 * (rating, insightId) for onRate and (insightId) for onAcknowledge/onDismiss.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AIInsightsPanel } from '@/components/golf/coachhelm/player/AIInsightsPanel';
import type { ComposedInsight } from '@/lib/coachhelm/v2/types';

// framer-motion's full animation stack isn't needed for these click tests.
// Re-export its primitives as plain divs / passthroughs so buttons render
// without having to tick frames forward.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    m: new Proxy(
      {},
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: (_target, prop) => React.forwardRef<HTMLElement, any>((props, ref) => {
          const { children, ...rest } = props;
          return React.createElement(prop as string, { ...rest, ref }, children);
        }),
      }
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

// Build a test-only insight with an `id` tag — the real ComposedInsight
// doesn't have an id yet, but the panel reads it opportunistically so feedback
// handlers can target a persisted row when available.
function makeInsight(overrides: Partial<ComposedInsight & { id: string }> = {}): ComposedInsight & { id: string } {
  return {
    id: 'i1',
    headline: 'Work on driving',
    body: 'Your fairways % dropped this week.',
    tone: 'cautionary',
    confidence: 0.82,
    strokeImpact: 1.2,
    ...overrides,
  };
}

describe('AIInsightsPanel', () => {
  it('renders no feedback buttons when no callbacks provided', () => {
    render(<AIInsightsPanel insights={[makeInsight()]} maxDisplay={1} />);
    // No expanded card → no buttons visible. Even if expanded, no buttons
    // render when no callbacks are supplied.
    expect(screen.queryByRole('button', { name: /helpful/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /got it/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /dismiss/i })).not.toBeInTheDocument();
  });

  it('renders Helpful, Got It, Dismiss when callbacks provided', () => {
    render(
      <AIInsightsPanel
        insights={[makeInsight()]}
        maxDisplay={1}
        onRate={vi.fn()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    // Expand the insight so the actions row is visible.
    fireEvent.click(screen.getByRole('button', { name: /Work on driving/i }));

    expect(screen.getByRole('button', { name: /helpful/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /got it/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('calls onRate("helpful", insight.id) when Helpful clicked', async () => {
    const onRate = vi.fn().mockResolvedValue(undefined);
    render(
      <AIInsightsPanel
        insights={[makeInsight()]}
        maxDisplay={1}
        onRate={onRate}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Work on driving/i }));
    fireEvent.click(screen.getByRole('button', { name: /helpful/i }));

    await waitFor(() => expect(onRate).toHaveBeenCalledWith('helpful', 'i1'));
  });

  it('calls onAcknowledge(insight.id) when Got It clicked', async () => {
    const onAcknowledge = vi.fn().mockResolvedValue(undefined);
    render(
      <AIInsightsPanel
        insights={[makeInsight()]}
        maxDisplay={1}
        onAcknowledge={onAcknowledge}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Work on driving/i }));
    fireEvent.click(screen.getByRole('button', { name: /got it/i }));

    await waitFor(() => expect(onAcknowledge).toHaveBeenCalledWith('i1'));
  });

  it('calls onDismiss(insight.id) when Dismiss clicked', async () => {
    const onDismiss = vi.fn().mockResolvedValue(undefined);
    render(
      <AIInsightsPanel
        insights={[makeInsight()]}
        maxDisplay={1}
        onDismiss={onDismiss}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Work on driving/i }));
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    await waitFor(() => expect(onDismiss).toHaveBeenCalledWith('i1'));
  });
});
