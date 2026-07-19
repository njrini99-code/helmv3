/**
 * ============================================================================
 * FairwayRoundsLibrary — regression coverage for #139 (date off-by-one) and
 * #129/#145 (duplicate in-progress drafts)
 * ----------------------------------------------------------------------------
 * #139: the month/week grouping used `new Date(round_date)` read back via
 * LOCAL-timezone getters — the exact #916 class of bug — so a round dated
 * (e.g.) the 1st of a month could land in the WRONG month bucket in every
 * timezone west of UTC, disagreeing with the calendar day
 * `formatDateOnlyFull`/`FairwayRoundRow` (both UTC-pinned) show for the very
 * same round. jsdom's default timezone in this repo's Vitest config is NOT
 * pinned to UTC, so a naive implementation would fail this test in CI.
 *
 * #129/#145: multiple in-progress rows with the same course/hole/type/round
 * — a real duplicate-draft scenario — must collapse to ONE resumable card.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FairwayRoundsLibrary } from './FairwayRoundsLibrary';
import type { RoundLibraryRound } from './FairwayRoundsLibrary';

function makeRound(overrides: Partial<RoundLibraryRound> = {}): RoundLibraryRound {
  return {
    id: 'round-1',
    course_name: 'Pebble Beach Golf Links',
    course_city: 'Pebble Beach',
    course_state: 'CA',
    round_date: '2026-06-15',
    round_type: 'practice',
    total_score: 74,
    score_to_par: 2,
    total_putts: 32,
    total_fairways: 14,
    total_fairways_hit: 10,
    total_gir: 12,
    total_gir_possible: 18,
    holes_played: 18,
    status: 'completed',
    player: { first_name: 'Nick', last_name: 'Rini', avatar_url: null },
    ...overrides,
  };
}

describe('FairwayRoundsLibrary — #139 date-only-safe grouping', () => {
  it('groups a round dated the 1st of the month under THAT month, never the previous one', () => {
    // The exact #916/#139 failure mode: `new Date('2026-06-01')` parses as
    // UTC midnight; read back via a LOCAL-timezone `.getMonth()` (or an
    // un-pinned `toLocaleDateString`) in any US timezone, this prints/groups
    // as May 31 — a different month bucket than June.
    render(
      <FairwayRoundsLibrary
        rounds={[makeRound({ id: 'r1', round_date: '2026-06-01' })]}
        inProgressRounds={[]}
        userRole="player"
        stats={null}
      />,
    );

    expect(screen.getByText('June 2026')).toBeInTheDocument();
    expect(screen.queryByText('May 2026')).not.toBeInTheDocument();
  });

  it('reports the honest month range using the same UTC-pinned parse (no boundary-day drift)', () => {
    render(
      <FairwayRoundsLibrary
        rounds={[
          makeRound({ id: 'r1', round_date: '2026-01-01' }),
          makeRound({ id: 'r2', round_date: '2026-04-30' }),
        ]}
        inProgressRounds={[]}
        userRole="player"
        stats={null}
      />,
    );

    // Same-year, different-month range reads "Jan–Apr". A local-timezone
    // read-back of either boundary date would silently roll it into the
    // adjacent month and change this label.
    expect(screen.getByText(/2 rounds recorded · Jan–Apr/)).toBeInTheDocument();
  });
});

describe('FairwayRoundsLibrary — #129/#145 in-progress draft dedup', () => {
  it('collapses pixel-identical in-progress drafts (same course/hole/type) to ONE card', () => {
    const dup: RoundLibraryRound = {
      ...makeRound({ round_date: '2026-06-15' }),
      status: 'in_progress',
      current_hole: 7,
      round_type: 'practice',
      updated_at: '2026-06-15T10:00:00.000Z',
      created_at: '2026-06-15T09:00:00.000Z',
    };

    render(
      <FairwayRoundsLibrary
        rounds={[]}
        inProgressRounds={[
          { ...dup, id: 'draft-a' },
          // A genuine duplicate: same course, same current hole, same holes
          // target, same round type — just a different id/timestamp.
          { ...dup, id: 'draft-b', updated_at: '2026-06-15T11:00:00.000Z' },
        ]}
        userRole="player"
        stats={null}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'In progress' });
    expect(heading).toBeInTheDocument();
    // The banner's own header count reflects the DEDUPED length, not the raw
    // 2 rows handed in.
    const header = heading.parentElement;
    expect(header?.textContent).toContain('1');
    // Only one "hole 7 of 18" readout renders, not two.
    expect(screen.getAllByText('7')).toHaveLength(1);
  });

  it('keeps genuinely distinct in-progress drafts (different course) as separate cards', () => {
    render(
      <FairwayRoundsLibrary
        rounds={[]}
        inProgressRounds={[
          makeRound({
            id: 'draft-a',
            course_name: 'Pebble Beach Golf Links',
            status: 'in_progress',
            current_hole: 3,
          }),
          makeRound({
            id: 'draft-b',
            course_name: 'Augusta National',
            status: 'in_progress',
            current_hole: 5,
          }),
        ]}
        userRole="player"
        stats={null}
      />,
    );

    expect(screen.getByText('Pebble Beach Golf Links')).toBeInTheDocument();
    expect(screen.getByText('Augusta National')).toBeInTheDocument();
  });
});
