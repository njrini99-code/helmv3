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
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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

  describe('round-2 mustFix #1 — month-group label agrees with the ledger row (non-UTC host TZ)', () => {
    const ORIGINAL_TZ = process.env.TZ;

    beforeEach(() => {
      process.env.TZ = 'America/Los_Angeles';
    });

    afterEach(() => {
      process.env.TZ = ORIGINAL_TZ;
    });

    it('groups + displays 2026-02-01 as February 1st, not Jan 31st, under America/Los_Angeles', () => {
      render(
        <FairwayRoundsLibrary
          rounds={[makeRound({ id: 'r1', round_date: '2026-02-01' })]}
          inProgressRounds={[]}
          userRole="player"
          stats={null}
        />,
      );

      // The month-group header (getMonthKey) and the row inside it
      // (FairwayRoundRow's dateParts) must agree on the SAME calendar month —
      // both UTC-pinned, neither reading back via the host's local timezone.
      expect(screen.getByText('February 2026')).toBeInTheDocument();
      expect(screen.queryByText('January 2026')).not.toBeInTheDocument();
      expect(screen.getByText('Feb 1')).toBeInTheDocument();
      expect(screen.queryByText('Jan 31')).not.toBeInTheDocument();
    });
  });
});

describe('FairwayRoundsLibrary — in-progress round discoverability', () => {
  it('keeps same-looking in-progress rounds separately resumable', () => {
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
          // Same display attributes but a distinct durable parent. The player
          // must keep both Continue Round links until a deliberate server-side
          // resolution decides otherwise.
          { ...dup, id: 'draft-b', updated_at: '2026-06-15T11:00:00.000Z' },
        ]}
        userRole="player"
        playerId="player-1"
        stats={null}
      />,
    );

    const heading = screen.getByRole('heading', { name: 'In progress' });
    expect(heading).toBeInTheDocument();
    // The banner count reflects every durable row handed in.
    const header = heading.parentElement;
    expect(header?.textContent).toContain('2');
    expect(screen.getAllByText('7')).toHaveLength(2);
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
        playerId="player-1"
        stats={null}
      />,
    );

    expect(screen.getByText('Pebble Beach Golf Links')).toBeInTheDocument();
    expect(screen.getByText('Augusta National')).toBeInTheDocument();
  });
});

/**
 * ============================================================================
 * Facelift — ONE ledger Surface for every group (docs/design/fairway-facelift/
 * screens/rounds-library.md "CONTAINERS TO REMOVE" #3)
 * ----------------------------------------------------------------------------
 * The redesign replaced "one Surface per date group" with one matte Surface
 * holding every group as a sticky seam header + divided rows. `inProgressRounds`
 * is empty here so the only Surface in the tree is the ledger's own — the
 * player-only unfinished banner renders a Surface per row (a separate
 * component, out of scope for this assertion).
 * ========================================================================== */
describe('FairwayRoundsLibrary — facelift: single ledger Surface for every group', () => {
  it('renders exactly one Surface holding every date group, not one per group', () => {
    const { container } = render(
      <FairwayRoundsLibrary
        rounds={[
          makeRound({ id: 'r1', round_date: '2026-06-15' }),
          makeRound({ id: 'r2', round_date: '2026-07-02' }),
        ]}
        inProgressRounds={[]}
        userRole="coach"
        stats={null}
      />,
    );

    // Both months' rounds are present…
    expect(screen.getByText('June 2026')).toBeInTheDocument();
    expect(screen.getByText('July 2026')).toBeInTheDocument();

    // …inside exactly ONE Surface (the ledger), never one Surface per group.
    const surfaces = container.querySelectorAll('[data-slot="surface"]');
    expect(surfaces).toHaveLength(1);
    expect(surfaces[0]!.textContent).toContain('June 2026');
    expect(surfaces[0]!.textContent).toContain('July 2026');
  });
});

/**
 * ============================================================================
 * Facelift follow-up — ledger pagination (owner-reported lag on accounts
 * with a lot of history: a real ledger can be 90+ rounds, ~8,300px of page,
 * rendered eagerly in one pass)
 * ----------------------------------------------------------------------------
 * Only the first page of rows renders across ALL groups (never per group);
 * a "Show 30 more" Button grows it. Row count is asserted via each row's own
 * `<a href="/golf/dashboard/rounds/:id">` link, since that's the one DOM node
 * FairwayRoundRow always renders exactly once per round.
 * ========================================================================== */
describe('FairwayRoundsLibrary — pagination for long ledgers', () => {
  function makeManyRounds(count: number): RoundLibraryRound[] {
    return Array.from({ length: count }, (_, i) => {
      const month = 1 + Math.floor(i / 28);
      const day = (i % 28) + 1;
      return makeRound({
        id: `r${i}`,
        round_date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      });
    });
  }

  it('paints only the first 30 rows across groups, then reveals 30 more per click', () => {
    const { container } = render(
      <FairwayRoundsLibrary
        rounds={makeManyRounds(100)}
        inProgressRounds={[]}
        userRole="coach"
        stats={null}
      />,
    );
    const rowLinks = () => container.querySelectorAll('a[href^="/golf/dashboard/rounds/"]');

    expect(rowLinks()).toHaveLength(30);

    const showMore = screen.getByRole('button', { name: 'Show 30 more' });
    fireEvent.click(showMore);

    expect(rowLinks()).toHaveLength(60);
  });

  it('hides the "Show more" control once every row is on the page', () => {
    render(
      <FairwayRoundsLibrary
        rounds={makeManyRounds(20)}
        inProgressRounds={[]}
        userRole="coach"
        stats={null}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Show 30 more' })).not.toBeInTheDocument();
  });
});
