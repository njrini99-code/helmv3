/**
 * ResolutionCelebration tests — Wave 1D.
 *
 * Covers:
 *  - Renders child content
 *  - Fires confetti + calls markCelebrationShown on first view
 *  - Skips confetti when `metadata.celebration_shown_at` is already set
 *  - Unmounts confetti layer after ~1.8s
 *  - Honors `disableConfetti` (accessibility / reduced-motion path)
 *  - Renders a header with "Resolved N days ago" framing
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { ResolutionCelebration } from '@/components/golf/coachhelm/insight-card/ResolutionCelebration';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEvidence(overrides: Partial<InsightEvidence> = {}): InsightEvidence {
  return {
    metric: 'putt_make_rate_6_10ft',
    metric_label: '6-10 ft make rate',
    unit: 'percent',
    your_value: 0.55,
    your_value_display: '55%',
    comparison_value: 0.52,
    comparison_label: 'D2 average',
    comparison_source: 'd2_avg',
    sample_n: 47,
    window_days: 30,
    window_start: '2026-03-23T00:00:00.000Z',
    window_end: '2026-04-22T00:00:00.000Z',
    strokes_impact: 0.5,
    strokes_impact_method: 'peer_delta',
    confidence: 0.78,
    confidence_factors: { sample_adequacy: 1, recency: 1, variance: 0.5 },
    ...overrides,
  };
}

function makeResolvedInsight(
  overrides: Partial<EvidenceInsight> = {},
): EvidenceInsight {
  return {
    id: 'insight-1',
    player_id: 'player-1',
    category: 'putting',
    title: '6-10ft putting — resolved',
    content: 'You are back to league average on 6-10ft putts.',
    signature: 'putt_make_rate_6_10ft',
    evidence: makeEvidence(),
    metadata: null,
    lifecycle_state: 'resolved',
    status: 'resolved',
    priority: 'low',
    acknowledged_at: null,
    resolved_at: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-18T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('ResolutionCelebration render', () => {
  it('renders children', async () => {
    const onMarkShown = vi.fn(async () => ({ success: true }));
    render(
      <ResolutionCelebration insight={makeResolvedInsight()} onMarkShown={onMarkShown}>
        <div data-testid="child-card">card body</div>
      </ResolutionCelebration>,
    );
    expect(screen.getByTestId('child-card')).toBeInTheDocument();
  });

  it('renders a celebratory header with "Resolved N days ago"', () => {
    const onMarkShown = vi.fn(async () => ({ success: true }));
    render(
      <ResolutionCelebration insight={makeResolvedInsight()} onMarkShown={onMarkShown}>
        <div />
      </ResolutionCelebration>,
    );
    const header = screen.getByTestId('resolution-header');
    expect(header.textContent).toMatch(/Resolved/);
    expect(header.textContent).toMatch(/3 days ago/);
  });

  it('shows "Resolved today" when resolved_at is within the day', () => {
    const onMarkShown = vi.fn(async () => ({ success: true }));
    render(
      <ResolutionCelebration
        insight={makeResolvedInsight({ resolved_at: new Date().toISOString() })}
        onMarkShown={onMarkShown}
      >
        <div />
      </ResolutionCelebration>,
    );
    expect(screen.getByTestId('resolution-header').textContent).toMatch(/Resolved today/);
  });
});

// ---------------------------------------------------------------------------
// Confetti gating — first view only
// ---------------------------------------------------------------------------

describe('ResolutionCelebration confetti gating', () => {
  it('fires confetti + calls markCelebrationShown on first view', async () => {
    // Real timers here — `waitFor` polls via setTimeout and deadlocks under
    // the fake-timer harness. The `unmounts after the animation window`
    // test below runs with fake timers to cover the timer path.
    vi.useRealTimers();
    const onMarkShown = vi.fn(async () => ({ success: true }));
    render(
      <ResolutionCelebration insight={makeResolvedInsight()} onMarkShown={onMarkShown}>
        <div />
      </ResolutionCelebration>,
    );

    expect(screen.getByTestId('resolution-confetti')).toBeInTheDocument();
    await waitFor(() => expect(onMarkShown).toHaveBeenCalledWith('insight-1'));
  });

  it('skips confetti when metadata.celebration_shown_at is already set', () => {
    const onMarkShown = vi.fn(async () => ({ success: true }));
    const insight = makeResolvedInsight({
      metadata: { celebration_shown_at: '2026-04-01T00:00:00.000Z' },
    });
    render(
      <ResolutionCelebration insight={insight} onMarkShown={onMarkShown}>
        <div />
      </ResolutionCelebration>,
    );

    expect(screen.queryByTestId('resolution-confetti')).toBeNull();
    expect(onMarkShown).not.toHaveBeenCalled();

    // The wrapper still renders the celebratory header even on repeat views.
    expect(screen.getByTestId('resolution-header')).toBeInTheDocument();
  });

  it('honors disableConfetti (reduced-motion path)', () => {
    const onMarkShown = vi.fn(async () => ({ success: true }));
    render(
      <ResolutionCelebration
        insight={makeResolvedInsight()}
        onMarkShown={onMarkShown}
        disableConfetti
      >
        <div />
      </ResolutionCelebration>,
    );

    expect(screen.queryByTestId('resolution-confetti')).toBeNull();
    // When disabled we don't stamp the row — user can still see confetti
    // if they flip prefers-reduced-motion back off.
    expect(onMarkShown).not.toHaveBeenCalled();
  });

  it('unmounts the confetti layer after the animation window', () => {
    const onMarkShown = vi.fn(async () => ({ success: true }));
    render(
      <ResolutionCelebration insight={makeResolvedInsight()} onMarkShown={onMarkShown}>
        <div />
      </ResolutionCelebration>,
    );
    expect(screen.getByTestId('resolution-confetti')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByTestId('resolution-confetti')).toBeNull();
  });

  it('sets data-celebration-first-view on the wrapper', () => {
    const onMarkShown = vi.fn(async () => ({ success: true }));

    const { rerender, getByTestId } = render(
      <ResolutionCelebration insight={makeResolvedInsight()} onMarkShown={onMarkShown}>
        <div />
      </ResolutionCelebration>,
    );
    expect(getByTestId('resolution-celebration').dataset.celebrationFirstView).toBe('true');

    rerender(
      <ResolutionCelebration
        insight={makeResolvedInsight({
          metadata: { celebration_shown_at: '2026-04-01T00:00:00.000Z' },
        })}
        onMarkShown={onMarkShown}
      >
        <div />
      </ResolutionCelebration>,
    );
    expect(getByTestId('resolution-celebration').dataset.celebrationFirstView).toBe('false');
  });
});
