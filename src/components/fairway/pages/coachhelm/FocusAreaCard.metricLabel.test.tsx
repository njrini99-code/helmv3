// @vitest-environment jsdom
/**
 * ============================================================================
 * FocusAreaCard — ProgressMeter never leaks a raw metric key + 44px touch
 * targets (audit fix)
 * ----------------------------------------------------------------------------
 * Bugs fixed (round 2, mustFix on wf/fix-player-my-development):
 *   #202/#60 — the ProgressMeter row (`{metric || 'Progress'}`) rendered the
 *     raw snake_case `target_metric` DB identifier verbatim (e.g.
 *     `putts_made_5_10ft_pct`) instead of the same human label the
 *     log-progress drawer + prescribed-area chip already resolve via
 *     formatTargetMetricLabel.
 *   #194 — the Log progress / Mark complete (active card) and Reopen
 *     (completed card) buttons rendered with the Button `size="sm"` prop,
 *     which is only 44px tall on coarse-pointer media queries — 36px on
 *     every other pointer.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FocusAreaCard, type FocusAreaCardData } from './FocusAreaCard';

// PracticeRxForInsight self-fetches via a server action keyed on
// from_insight_id; our fixtures never set one so it already collapses to
// null per its own contract, but mock it out to keep this suite hermetic.
vi.mock('./PracticeRxForInsight', () => ({
  PracticeRxForInsight: () => null,
}));

function makeArea(overrides: Partial<FocusAreaCardData> = {}): FocusAreaCardData {
  return {
    id: 'fa-1',
    area_type: 'putting',
    title: 'Putting under pressure',
    status: 'active',
    target_metric: 'putts_made_5_10ft_pct',
    target_value: 65,
    current_value: 42,
    ...overrides,
  };
}

describe('FocusAreaCard ProgressMeter — no raw snake_case metric key leaks', () => {
  it('renders a human label, never the raw target_metric, in the progress row', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea()}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByText('putts_made_5_10ft_pct')).toBeNull();
    expect(screen.getByText(/putts made 5-10 ft/i)).not.toBeNull();
  });

  it('falls back to a title-cased de-snake for a metric not in any registry', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ target_metric: 'custom_swing_tempo' })}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByText('custom_swing_tempo')).toBeNull();
    expect(screen.getByText(/custom swing tempo/i)).not.toBeNull();
  });
});

describe('FocusAreaCard — 44px touch targets', () => {
  it('renders Log progress / Mark complete at the 44px md size (never 36px sm)', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea()}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    const logProgress = screen.getByRole('button', { name: /log progress/i });
    const markComplete = screen.getByRole('button', { name: /mark complete/i });
    expect(logProgress.className).toMatch(/min-h-\[44px\]/);
    expect(logProgress.className).not.toMatch(/min-h-\[36px\]/);
    expect(markComplete.className).toMatch(/min-h-\[44px\]/);
    expect(markComplete.className).not.toMatch(/min-h-\[36px\]/);
  });

  it('renders the completed-card Reopen button at the 44px md size (never 36px sm)', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ status: 'completed', completed_at: '2026-07-01T00:00:00.000Z' })}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onReopen={vi.fn()}
      />,
    );
    const reopen = screen.getByRole('button', { name: /reopen/i });
    expect(reopen.className).toMatch(/min-h-\[44px\]/);
    expect(reopen.className).not.toMatch(/min-h-\[36px\]/);
  });
});
