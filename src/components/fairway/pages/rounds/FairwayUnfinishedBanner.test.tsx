/**
 * ============================================================================
 * FairwayUnfinishedBanner — R8 "Finish submitting" affordance
 * ----------------------------------------------------------------------------
 * A round whose every hole already has a durable `golf_holes` score
 * (`hasPendingSubmission`, computed server-side in page.tsx) is stuck holding
 * a completed scorecard, most likely because a final submit was attempted
 * and never confirmed. Before this change nothing on the Rounds dashboard
 * distinguished such a round from one still being actively tracked — both
 * showed a plain warning "In progress" pill and a "Continue" CTA, so a
 * player scanning their unfinished rounds had no signal that one of them
 * just needs re-submitting, not more holes played.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FairwayUnfinishedBanner } from './FairwayUnfinishedBanner';
import type { RoundLibraryRound } from './FairwayRoundsLibrary';

function makeInProgressRound(overrides: Partial<RoundLibraryRound> = {}): RoundLibraryRound {
  return {
    id: 'round-1',
    course_name: 'Pebble Beach Golf Links',
    course_city: 'Pebble Beach',
    course_state: 'CA',
    round_date: '2026-09-20',
    round_type: 'practice',
    total_score: null,
    score_to_par: null,
    total_putts: null,
    total_fairways: null,
    total_fairways_hit: null,
    total_gir: null,
    total_gir_possible: null,
    holes_played: 18,
    status: 'in_progress',
    current_hole: 18,
    updated_at: '2026-09-20T18:00:00.000Z',
    created_at: '2026-09-20T14:00:00.000Z',
    player: { first_name: 'Nick', last_name: 'Rini', avatar_url: null },
    ...overrides,
  };
}

describe('FairwayUnfinishedBanner — R8 pending-submission affordance', () => {
  it('shows the ordinary "In progress" / "Continue" pair by default', () => {
    render(
      <FairwayUnfinishedBanner rounds={[makeInProgressRound()]} playerId="player-1" />,
    );

    // "In progress" also names the section heading, so the per-round PILL
    // showing it too means the text appears twice — heading + pill.
    expect(screen.getAllByText('In progress')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Continue/ })).toBeInTheDocument();
    expect(screen.queryByText('Ready to submit')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Finish submitting/ })).not.toBeInTheDocument();
  });

  it('shows "Ready to submit" / "Finish submitting" when the round carries a persisted submission backup', () => {
    render(
      <FairwayUnfinishedBanner
        rounds={[makeInProgressRound({ hasPendingSubmission: true })]}
        playerId="player-1"
      />,
    );

    expect(screen.getByText('Ready to submit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Finish submitting/ })).toBeInTheDocument();
    // Only the section heading says "In progress" now — the pill switched.
    expect(screen.getAllByText('In progress')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Continue$/ })).not.toBeInTheDocument();
  });
});
