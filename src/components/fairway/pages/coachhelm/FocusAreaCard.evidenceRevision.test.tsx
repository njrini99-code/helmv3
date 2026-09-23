// @vitest-environment jsdom
/**
 * ============================================================================
 * FocusAreaCard — A8 slice 1 evidence-revision indicator
 * ----------------------------------------------------------------------------
 * `evidence_revision` is only ever populated when the
 * `coachhelm_focus_area_evidence_revision` flag was on and the source insight
 * was well-formed at approval time (see development.ts / evidence-revision-
 * source.ts). Every focus area created before this slice, or with the flag
 * off, or with no source insight has it absent — the card must render
 * nothing extra in that case, never a placeholder, and must never print the
 * raw fingerprint (a 64-char hex string is meaningless to a coach).
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

describe('FocusAreaCard — evidence-revision indicator', () => {
  it('renders no indicator when evidence_revision is absent (flag off / pre-slice-1 row)', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea()}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/evidence snapshot recorded/i)).toBeNull();
  });

  it('renders no indicator when evidence_revision is null', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ evidence_revision: null })}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/evidence snapshot recorded/i)).toBeNull();
  });

  it('renders the indicator, never the raw hash, when evidence_revision is present', () => {
    const revision = 'a'.repeat(64);
    render(
      <FocusAreaCard
        focusArea={makeArea({ evidence_revision: revision })}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText(/evidence snapshot recorded/i)).not.toBeNull();
    expect(screen.queryByText(revision)).toBeNull();
  });
});
