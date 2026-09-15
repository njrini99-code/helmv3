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
 * Facelift — the page's only Surface is the stage (rounds-library.v3.md
 * "The table" → "Bare on the canvas, no Surface"; LANGUAGE.md:32/:60)
 * ----------------------------------------------------------------------------
 * Pre-v3, this test asserted one ledger Surface wrapping the grouped table.
 * v3 removes that wrapper entirely — the table (and its group seam headers)
 * render bare on the canvas — and moves the page's one-and-only Surface to
 * the stage (`RoundField`'s "Round scatter" region), which renders
 * unconditionally off `rounds.length > 0`, not off the `stats` prop this
 * test passes as `null`. So this now asserts: exactly one Surface total,
 * and it's the stage, not the ledger; the month labels live directly in the
 * (bare) document, not nested inside that Surface.
 * ========================================================================== */
describe('FairwayRoundsLibrary — facelift: the stage is the page\'s only Surface', () => {
  it('renders exactly one Surface — the stage — with the bare table outside it', () => {
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

    // Both months' rounds are present, directly on the canvas…
    expect(screen.getByText('June 2026')).toBeInTheDocument();
    expect(screen.getByText('July 2026')).toBeInTheDocument();

    // …exactly one Surface on the page, and it's the stage, not the ledger:
    // a regression that re-wraps the table (or drops the stage) would fail
    // this either by count or by which node it is.
    const surfaces = Array.from(container.querySelectorAll('[data-slot="surface"]'));
    expect(surfaces).toHaveLength(1);
    const stage = screen.getByRole('region', { name: 'Round scatter' });
    expect(surfaces[0]).toBe(stage);

    // …and the month labels are NOT nested inside that Surface — they live
    // in the bare table beside it.
    expect(stage.textContent ?? '').not.toContain('June 2026');
    expect(stage.textContent ?? '').not.toContain('July 2026');
  });
});

/**
 * ============================================================================
 * Facelift follow-up — ledger pagination (owner-reported lag on accounts
 * with a lot of history: a real ledger can be 90+ rounds, ~8,300px of page,
 * rendered eagerly in one pass)
 * ----------------------------------------------------------------------------
 * Only the first page of rows renders across ALL groups (never per group);
 * a "Show 30 more" Button grows it. Row count is asserted via each TABLE
 * row's own `<a href="/golf/dashboard/rounds/:id">` link (one per round),
 * scoped to `[data-slot="rounds-table"]` — the v3 stage above also links
 * every plotted round (`RoundField`), so an unscoped count would double-count.
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
    const rowLinks = () =>
      container.querySelector('[data-slot="rounds-table"]')!.querySelectorAll('a[href^="/golf/dashboard/rounds/"]');

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

/**
 * ============================================================================
 * player-rounds.v2.md / rounds-library.v3.md — both roles open with their own
 * stage now: the player's scoring stage (unchanged), the coach's v3 Round
 * scatter stage (replacing the old Cockpit cluster, see the next describe
 * block). Neither role has a ledger Surface anymore — the table is bare.
 * ========================================================================== */
describe('FairwayRoundsLibrary — player v2 stage (role fork)', () => {
  const stats = {
    totalRounds: 3,
    avg: 74.3,
    best: 72,
    avgToPar: 2.3,
    underParPct: 0,
    trend: null,
  } as const;
  const rounds = [
    makeRound({ id: 'r1', round_date: '2026-06-15', total_score: 76, score_to_par: 4 }),
    makeRound({ id: 'r2', round_date: '2026-07-02', total_score: 75, score_to_par: 3 }),
    makeRound({ id: 'r3', round_date: '2026-08-31', total_score: 72, score_to_par: 0 }),
  ];

  it('player: the stage names the newest round, the masthead keeps its static title, no cockpit', () => {
    render(
      <FairwayRoundsLibrary rounds={rounds} inProgressRounds={[]} userRole="player" stats={stats} />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Your rounds.' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Scoring' })).toBeInTheDocument();
    expect(screen.getByText('Six scored rounds unlock the trend.')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Last \(E\) · Pebble Beach Golf Links · Aug 31/ }),
    ).toHaveAttribute('href', '/golf/dashboard/rounds/r3');
    expect(screen.getByRole('region', { name: 'Where your scores land' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Round summary instrument cluster')).not.toBeInTheDocument();
  });

  it('coach: the v3 Round scatter stage renders and the old cockpit does not', () => {
    render(
      <FairwayRoundsLibrary rounds={rounds} inProgressRounds={[]} userRole="coach" stats={stats} />,
    );
    expect(screen.getByRole('region', { name: 'Round scatter' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Scoring' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Round summary instrument cluster')).not.toBeInTheDocument();
  });
});
