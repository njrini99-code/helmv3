// @vitest-environment jsdom
/**
 * ============================================================================
 * FocusAreaCard — A8 slices 1 + 3 evidence-revision indicator
 * ----------------------------------------------------------------------------
 * `evidence_revision` is only ever populated when the
 * `coachhelm_focus_area_evidence_revision` flag was on and the source insight
 * was well-formed at approval time (see development.ts / evidence-revision-
 * source.ts). Every focus area created before this slice, or with the flag
 * off, or with no source insight has it absent — the card must render
 * nothing extra in that case, never a placeholder, and must never print the
 * raw fingerprint (a 64-char hex string is meaningless to a coach).
 *
 * `evidence_revision_status` (slice 3) is the read-time-only verdict the page
 * loader computes by comparing that stored fingerprint against the source
 * insight's LIVE one (`computeEvidenceRevisionStatuses`) — `'changed'`
 * swaps the plain presence badge for a mismatch warning; `'match'` or absent
 * leaves the plain presence badge as-is.
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

  it('renders the plain presence badge, not the mismatch badge, when the status is "match"', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ evidence_revision: 'a'.repeat(64), evidence_revision_status: 'match' })}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText(/evidence snapshot recorded/i)).not.toBeNull();
    expect(screen.queryByText(/evidence has changed/i)).toBeNull();
  });

  it('renders the mismatch badge, not the plain presence badge, when the status is "changed"', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ evidence_revision: 'a'.repeat(64), evidence_revision_status: 'changed' })}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.getByText(/evidence has changed since this was approved/i)).not.toBeNull();
    expect(screen.queryByText(/evidence snapshot recorded/i)).toBeNull();
  });

  it('never renders the mismatch badge when evidence_revision itself is absent, even if a stale status prop were passed', () => {
    render(
      <FocusAreaCard
        focusArea={makeArea({ evidence_revision: null, evidence_revision_status: 'changed' })}
        // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
        role="player"
        onLogProgress={vi.fn()}
        onComplete={vi.fn()}
      />,
    );
    expect(screen.queryByText(/evidence has changed/i)).toBeNull();
    expect(screen.queryByText(/evidence snapshot recorded/i)).toBeNull();
  });
});
