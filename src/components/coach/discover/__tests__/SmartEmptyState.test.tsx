/**
 * SmartEmptyState — the coach Discover page's "no players match" empty state.
 *
 * Regression coverage for two related bugs found in the same 2026-07 visual
 * audit (lane: discover-emptystate):
 *
 * 1) [DISHONEST] `activeFilterCount` used to be
 *    `Object.values(filters).filter(v => v !== undefined && v !== '').length`
 *    over the *entire* filters object DiscoverView passes through — which at
 *    runtime also carries `mode: 'players' | 'teams'` (always a non-empty
 *    string, never a user-set filter). That inflated this component's count
 *    by one above DiscoverClient.tsx's own curated `activeFilterCount` (the
 *    number on the "Filters" button badge), so a coach could see "no active
 *    filters" on the badge and "You have 2 filters active" two inches below
 *    it for the exact same render. The fix counts from the same curated
 *    field list DiscoverClient.tsx uses.
 *
 * 2) [BROKEN] the "suggest neighboring states" block keyed off `filters.state`
 *    (singular) — a field that has never existed on the real filters object,
 *    which has always used `states` (a multi-select array) instead. The
 *    block was permanently dead regardless of `stateCounts`. Fixed by
 *    deriving a `singleSelectedState` from `filters.states`.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(),
}));

import { SmartEmptyState } from '../SmartEmptyState';

// The real filters object DiscoverClient.tsx builds (and DiscoverView.tsx
// passes straight through) always carries `mode`, which is not part of
// SmartEmptyState's declared `filters` prop shape (it's never a user-set
// filter). Typed as a plain variable — not an inline object literal at the
// JSX call site — so this compiles without an excess-property-check error
// while still exercising the real runtime shape.
type RealDiscoverFilters = {
  mode: 'players' | 'teams';
  gradYear?: number;
  position?: string;
  states?: string[];
};

describe('SmartEmptyState', () => {
  it('does not count the mode field as a user-set filter', () => {
    // Real shape DiscoverView passes through: `mode` is always present, and
    // exactly one real filter (`position`) is set.
    const filters: RealDiscoverFilters = { mode: 'players', position: 'SS' };
    render(
      <SmartEmptyState filters={filters} stateCounts={{}} totalPlayersUnfiltered={0} />
    );

    // 1 real filter → the `> 1` copy branch must NOT fire.
    expect(screen.queryByText(/You have \d+ filters? active/i)).not.toBeInTheDocument();
    expect(
      screen.getByText('Try adjusting your search criteria to find more players.')
    ).toBeInTheDocument();
  });

  it('reports the true curated count, matching DiscoverClient’s own badge math', () => {
    // Two real filters set (position + gradYear), plus the always-present
    // `mode` field that must be excluded.
    const filters: RealDiscoverFilters = { mode: 'players', position: 'SS', gradYear: 2026 };
    render(
      <SmartEmptyState filters={filters} stateCounts={{}} totalPlayersUnfiltered={0} />
    );

    expect(screen.getByText(/You have 2 filters active/i)).toBeInTheDocument();
  });

  it('renders "Top states for {position}" once real per-state counts are supplied', () => {
    render(
      <SmartEmptyState
        filters={{ position: 'SS' }}
        stateCounts={{ CA: 10, TX: 4 }}
        totalPlayersUnfiltered={14}
      />
    );

    expect(screen.getByText('Top states for SSs')).toBeInTheDocument();
    expect(screen.getByText('California')).toBeInTheDocument();
    expect(screen.getByText('10 players')).toBeInTheDocument();
  });

  it('suggests neighboring states for a single selected state (states array, not the old singular `state` field)', () => {
    render(
      <SmartEmptyState
        filters={{ states: ['NC'] }}
        stateCounts={{ GA: 8, SC: 3, VA: 1, TN: 0 }}
        totalPlayersUnfiltered={12}
      />
    );

    expect(screen.getByText('Try Georgia')).toBeInTheDocument();
    expect(screen.getByText('8 players')).toBeInTheDocument();
    // TN has a 0 count and must be filtered out.
    expect(screen.queryByText('Try Tennessee')).not.toBeInTheDocument();
  });

  it('suppresses neighboring-state suggestions when multiple states are selected (no single neighbor set to offer)', () => {
    render(
      <SmartEmptyState
        filters={{ states: ['NC', 'GA'] }}
        stateCounts={{ SC: 5, VA: 2 }}
        totalPlayersUnfiltered={7}
      />
    );

    expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
    expect(screen.queryByText(/^Try (Georgia|South Carolina|Virginia)$/)).not.toBeInTheDocument();
  });
});
