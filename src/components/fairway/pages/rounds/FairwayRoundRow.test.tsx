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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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

/**
 * ============================================================================
 * #139 (round-2 mustFix #1) — FairwayRoundRow's date-only display, in a host
 * timezone WEST of UTC.
 * ----------------------------------------------------------------------------
 * `round_date` is a bare 'YYYY-MM-DD' DATE column. `dateParts()` routes it
 * through the shared `@/lib/golf/date-only` helpers (UTC-pinned), so a round
 * dated the 1st of the month must display as the 1st — never the last day of
 * the PREVIOUS month — regardless of the host's local timezone. This is the
 * exact #916 bug class: `new Date('2026-02-01').toLocaleDateString()` with no
 * `timeZone: 'UTC'` pin parses as UTC midnight, then a LOCAL read-back prints
 * the previous calendar day in every timezone west of UTC (confirmed here
 * against America/Los_Angeles, 8 hours behind).
 * ========================================================================== */
describe('FairwayRoundRow — #139 date-only display agrees across surfaces (non-UTC host TZ)', () => {
  const ORIGINAL_TZ = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'America/Los_Angeles';
  });

  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ;
  });

  it('shows Feb 1 (not Jan 31) for a round_date of 2026-02-01 under America/Los_Angeles', () => {
    render(
      <FairwayRoundRow
        round={makeRound({ round_date: '2026-02-01' })}
        isBestOfPeriod={false}
        userRole="player"
      />,
    );

    expect(screen.getByText('Feb 1')).toBeInTheDocument();
    expect(screen.queryByText('Jan 31')).not.toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  it('agrees with the same UTC-pinned parse the Rounds Library month-group label and the ' +
    "coach dashboard's Recent Rounds shortDate() both use for the identical round_date", () => {
    // FairwayCoachDashboard.tsx's private `shortDate()` (not exported, and
    // outside this package's owned files) formats a date-only value as:
    //   new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    // — i.e. the SAME UTC-pinned recipe as `@/lib/golf/date-only`'s
    // `formatDateOnlyShort`. Mirrored here (not imported — cross-file, out of
    // scope) to pin the cross-surface agreement this row must never regress.
    const dashboardShortDate = (iso: string) =>
      new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

    render(
      <FairwayRoundRow
        round={makeRound({ round_date: '2026-02-01' })}
        isBestOfPeriod={false}
        userRole="player"
      />,
    );

    const rowDate = screen.getByText('Feb 1').textContent;
    expect(rowDate).toBe(dashboardShortDate('2026-02-01'));
  });
});
