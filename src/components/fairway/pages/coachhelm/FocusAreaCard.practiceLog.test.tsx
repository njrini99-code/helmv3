// @vitest-environment jsdom
/**
 * ============================================================================
 * FocusAreaCard — A8 slice 2 (read side): criteria checklist + practice-log
 * rollup
 * ----------------------------------------------------------------------------
 * `criteria` and `practiceSummary` are only ever populated when
 * coachhelm_focus_area_practice_log is on (loadFocusAreaPracticeLogData
 * checks the flag before any read). Absent/null must render nothing extra —
 * the same honest-degrade contract `evidence_revision` already follows.
 * Read-only: no mark-met/log-practice affordance on the card yet.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FocusAreaCard, type FocusAreaCardData } from './FocusAreaCard';

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

describe('FocusAreaCard — criteria checklist', () => {
  it('renders nothing when criteria is absent (flag off / pre-slice-2 row)', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea()}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/criteria/i)).toBeNull();
  });

  it('renders nothing when criteria is an empty array', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ criteria: [] })}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/criteria/i)).toBeNull();
  });

  it('renders each criterion label, met and unmet', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({
          criteria: [
            { id: 'c1', label: 'Consistent tempo', met: true },
            { id: 'c2', label: 'Square clubface at impact', met: false },
          ],
        })}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText('Consistent tempo')).not.toBeNull();
    expect(screen.getByText('Square clubface at impact')).not.toBeNull();
  });
});

describe('FocusAreaCard — practice-log summary', () => {
  it('renders nothing when practiceSummary is absent', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea()}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/practice session/i)).toBeNull();
  });

  it('renders nothing when the count is 0', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ practiceSummary: { count: 0, lastPracticedAt: null } })}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/practice session/i)).toBeNull();
  });

  it('renders the singular form for exactly 1 session', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ practiceSummary: { count: 1, lastPracticedAt: '2026-09-20T00:00:00Z' } })}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText(/1 practice session logged/i)).not.toBeNull();
  });

  it('renders the plural form + last-practiced date for multiple sessions', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ practiceSummary: { count: 4, lastPracticedAt: '2026-09-20T00:00:00Z' } })}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText(/4 practice sessions logged/i)).not.toBeNull();
    expect(screen.getByText(/last/i)).not.toBeNull();
  });
});
