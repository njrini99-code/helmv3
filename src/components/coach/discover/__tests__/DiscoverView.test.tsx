/**
 * DiscoverView — regression coverage for two bugs found in the 2026-07
 * visual audit (lane: discover-emptystate):
 *
 * 1) [BROKEN] DiscoverView.tsx used to pass a hardcoded empty object literal
 *    into SmartEmptyState's `stateCounts` prop instead of the real
 *    `playerStateCounts` prop already in scope (populated by DiscoverClient's
 *    own state-count fetch). That permanently killed the "suggest
 *    neighboring states" and "Top states for {position}" suggestion UIs
 *    inside SmartEmptyState, regardless of how much real recruiting data
 *    ever exists.
 *
 * 2) [BROKEN, found while verifying #1] `hasActiveFilters` used
 *    `Object.values(filters).some(...)` over the same filters object, which
 *    at runtime always carries a `mode: 'players' | 'teams'` field (never a
 *    user-set filter). That made `hasActiveFilters` permanently `true`,
 *    which in turn permanently hid the plain "N players/teams found" count
 *    line (gated on `!hasActiveFilters`) any time zero filters were actually
 *    set — the exact same "looks fine at 0 players, breaks once real data
 *    exists" failure mode as #1.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Server actions — not exercised by this render (no watchlist interaction),
// but the module itself pulls in next/cache + the Supabase server client,
// neither of which run under Vitest/jsdom.
vi.mock('@/app/baseball/actions/watchlist', () => ({
  addToWatchlist: vi.fn(async () => ({ success: true })),
  removeFromWatchlist: vi.fn(async () => ({ success: true })),
}));

import { DiscoverView } from '../DiscoverView';

describe('DiscoverView — empty state state-counts wiring', () => {
  it('passes the real playerStateCounts prop into SmartEmptyState, not a hardcoded {}', () => {
    render(
      <DiscoverView
        players={[]}
        watchlistIds={[]}
        coachId="coach-1"
        playerCount={0}
        playerPages={0}
        teams={[]}
        teamCount={0}
        teamPages={0}
        currentPage={1}
        filters={{ position: 'SS' }}
        playerStateCounts={{ CA: 10, TX: 4 }}
        teamStateCounts={{}}
      />
    );

    // Only reachable if SmartEmptyState actually received the non-empty
    // playerStateCounts — a regression back to `stateCounts={{}}` makes this
    // permanently absent even with real player data available.
    expect(screen.getByText('Top states for SSs')).toBeInTheDocument();
    expect(screen.getByText('California')).toBeInTheDocument();
  });

  it('shows the plain "N players found" count when zero real filters are set, even though `mode` is always present', () => {
    // Real shape DiscoverClient.tsx builds: `mode` is always present; no
    // user-facing filter is actually set. `position` is declared (but left
    // undefined) purely so this type structurally overlaps with
    // DiscoverView's `filters` prop type — TS2559 otherwise flags an
    // all-optional-properties target type with zero shared keys.
    const filters: { mode: 'players' | 'teams'; position?: string } = { mode: 'players' };

    render(
      <DiscoverView
        players={[]}
        watchlistIds={[]}
        coachId="coach-1"
        playerCount={24}
        playerPages={1}
        teams={[]}
        teamCount={0}
        teamPages={0}
        currentPage={1}
        filters={filters}
        playerStateCounts={{}}
        teamStateCounts={{}}
      />
    );

    // Match on the paragraph's own full text content (its `24` count and
    // "players found" label are separate DOM nodes) rather than a bare "24",
    // which also appears elsewhere on the page (e.g. the Players/Teams
    // toggle's count pill).
    const countLine = screen.getByText((_content, element) => {
      if (!element || element.tagName.toLowerCase() !== 'p') return false;
      return element.textContent?.replace(/\s+/g, ' ').trim() === '24 players found';
    });
    expect(countLine).toBeInTheDocument();
  });
});
