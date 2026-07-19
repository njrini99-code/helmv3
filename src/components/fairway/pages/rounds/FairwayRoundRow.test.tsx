/**
 * ============================================================================
 * FairwayRoundRow — mobile pill-flow (audit W2)
 * ----------------------------------------------------------------------------
 * Regression coverage for the "Putts/FIR/GIR pills collapse into a one-per-
 * line vertical stack at 390px" finding. Root cause: the coach-view avatar +
 * player-name block is `flex-shrink-0` on the row's shared flex axis — it
 * never yields width, so at a 390px viewport it (plus the fixed Date/Score
 * columns) squeezed the ONLY shrinkable column (Course + the mobile condensed
 * stat line) down to a sliver too narrow for even one "FIR 71%"-width chip.
 * `flex-wrap` on the stat line was already correct; the bug was upstream
 * width starvation, not the wrap itself.
 *
 * jsdom has no real layout engine (no CSS box model), so this can't assert
 * literal pixel widths — it asserts the STRUCTURAL fix instead: the player
 * name text is gated behind `md:` (freeing the width on phones) while the
 * Avatar — which already carries the same name accessibly via its own
 * alt/sr-only fallback — stays visible at every breakpoint, and the stat
 * line itself still renders every chip with the honest content it always did.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FairwayRoundRow } from './FairwayRoundRow';
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
    player: {
      first_name: 'Alexandria',
      last_name: 'Montgomery-Whitfield',
      avatar_url: null,
    },
    ...overrides,
  };
}

describe('FairwayRoundRow — coach avatar block does not starve the pill-flow column', () => {
  it('gates the player name text behind md: so it never competes with the mobile stat line for width', () => {
    render(
      <FairwayRoundRow round={makeRound()} isBestOfPeriod={false} userRole="coach" />,
    );

    // The Avatar's own `sr-only` fallback ALSO renders the name (for
    // screen-reader identity when there's no image) — match against the
    // one visible-text label specifically, not the sr-only duplicate.
    const matches = screen.getAllByText('Alexandria Montgomery-Whitfield');
    const label = matches.find((el) => !el.className.includes('sr-only'));
    expect(label).toBeDefined();
    // `hidden` (display:none below `md`) + `md:inline-block` (restored at
    // `md:` and up) — the exact gate that frees the ~130px this block used
    // to always occupy on a 390px row.
    expect(label!.className).toMatch(/\bhidden\b/);
    expect(label!.className).toMatch(/\bmd:inline-block\b/);
  });

  it('still renders the Avatar (the accessible identity carrier) at every breakpoint', () => {
    render(
      <FairwayRoundRow round={makeRound()} isBestOfPeriod={false} userRole="coach" />,
    );

    // No image src → Avatar falls back to initials, sr-only-named after the
    // real player name — the row's accessible identity survives the text hide.
    expect(screen.getByText('AM')).toBeInTheDocument();
  });

  it('renders the mobile condensed Putts/FIR/GIR stat line as one flex-wrap row (honest content, still flowing)', () => {
    const { container } = render(
      <FairwayRoundRow round={makeRound()} isBestOfPeriod={false} userRole="coach" />,
    );

    expect(screen.getByText('P32')).toBeInTheDocument();
    expect(screen.getByText('FIR 71%')).toBeInTheDocument();
    expect(screen.getByText('GIR 67%')).toBeInTheDocument();

    const statLine = screen.getByText('P32').parentElement;
    expect(statLine).not.toBeNull();
    expect(statLine!.className).toMatch(/\bflex-wrap\b/);
    expect(statLine!.className).not.toMatch(/\bflex-col\b/);
    void container;
  });

  it('player view (no avatar block at all) is unaffected — the stat line still flows', () => {
    render(<FairwayRoundRow round={makeRound()} isBestOfPeriod={false} userRole="player" />);

    expect(screen.queryByText('Alexandria Montgomery-Whitfield')).not.toBeInTheDocument();
    expect(screen.getByText('FIR 71%')).toBeInTheDocument();
  });
});
