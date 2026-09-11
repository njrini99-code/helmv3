/**
 * ============================================================================
 * FairwayCoachRoster — field-sheet composition (docs/design/fairway-facelift/
 * screens/roster.v3.md)
 * ----------------------------------------------------------------------------
 * Supersedes the MatrixBoard-era suite: this screen no longer has an
 * expandable row (roster.v3.md "What this deletes" — the inline expand band
 * and its phone Sheet are retired in favor of real row navigation), so the
 * `", expandable row"` aria-label pins and the "Who needs your attention"
 * header-Surface heading are gone. The underlying roster-health math these
 * tests protect (the flagged/covered states, the "Add focus area" wiring,
 * the attention filter) is preserved — only the render site and assertions
 * move to the new masthead/ledger/table composition.
 * ========================================================================== */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FairwayCoachRoster, type FairwayCoachRosterProps } from './FairwayCoachRoster';
import type { RosterPlayer } from './FairwayPlayerCard';
import type { PlayersGridFocusArea } from '@/components/fairway/pages/coachhelm/PlayersGridView';

const pushMock = vi.fn();
const refreshMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: refreshMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/golf/dashboard/roster',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

const TODAY = '2026-09-10';

function makePlayer(overrides: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    id: 'p1',
    first_name: 'Jordan',
    last_name: 'Lee',
    avatar_url: null,
    hometown: null,
    state: null,
    graduation_year: 2027,
    handicap: 2,
    status: 'active',
    rounds_count: 6,
    avg_score: 76.4,
    recent_trend: 'declining',
    recent_trend_delta: 2.1,
    active_focus_areas: 0,
    active_goals: 0,
    rounds: [],
    ...overrides,
  };
}

function renderRoster(overrides: Partial<FairwayCoachRosterProps> = {}) {
  return render(
    <FairwayCoachRoster
      players={[makePlayer()]}
      teamName="Helm Golf"
      inviteCode="ABC123"
      intents={{}}
      joinRequests={[]}
      focusAreas={[]}
      today={TODAY}
      roundsUnavailable={false}
      {...overrides}
    />,
  );
}

describe('FairwayCoachRoster — Attention ledger', () => {
  it('renders the Attention ledger column with the flagged (declining, uncoached) player', () => {
    renderRoster();
    expect(screen.getByText('Attention')).toBeInTheDocument();
    // The flagged player surfaces in the ledger's ranked list AND the table.
    expect(screen.getAllByText('Jordan Lee').length).toBeGreaterThan(0);
  });

  it('navigates to the intelligence Players/Focus-areas drill, scoped to the player, when "Add focus area" is clicked from the ledger', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    renderRoster();

    const addButtons = screen.getAllByRole('button', { name: 'Add focus area' });
    await user.click(addButtons[0]!);
    expect(pushMock).toHaveBeenCalledWith('/golf/dashboard/intelligence?view=players&player=p1&playersTab=areas');
  });

  it('does not render the ledger on the empty-roster state (avoids a second "awaiting" instrument stacked on Build your team)', () => {
    renderRoster({ players: [] });
    expect(screen.queryByText('Attention')).toBeNull();
    expect(screen.getByText('Build your team')).toBeInTheDocument();
  });

  it('filters the table to only the flagged players when the "Needs attention" control is used', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const flagged = makePlayer({ id: 'p1', first_name: 'Jordan', last_name: 'Lee', recent_trend: 'declining' });
    const onTrack = makePlayer({
      id: 'p2',
      first_name: 'Casey',
      last_name: 'Kim',
      recent_trend: 'improving',
      recent_trend_delta: -1.2,
      active_focus_areas: 1,
    });
    const focusAreas: PlayersGridFocusArea[] = [{ id: 'fa1', area_type: 'general', title: null, player_id: 'p2', status: 'active' }];
    renderRoster({ players: [flagged, onTrack], focusAreas });

    // Scoped to the table: both names also appear as linked names in the
    // masthead verdict (lead/slide/attention clauses), which isn't affected
    // by the table's own "Needs attention" filter.
    let table = within(screen.getByRole('table'));
    expect(table.getByRole('link', { name: /Jordan Lee/ })).toBeInTheDocument();
    expect(table.getByRole('link', { name: /Casey Kim/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Needs attention/ }));

    table = within(screen.getByRole('table'));
    expect(table.getByRole('link', { name: /Jordan Lee/ })).toBeInTheDocument();
    expect(table.queryByRole('link', { name: /Casey Kim/ })).toBeNull();
  });

  it("reflects a covered, non-flagged roster as the honest 'covered' state", () => {
    renderRoster({
      players: [makePlayer({ id: 'p2', recent_trend: 'improving', recent_trend_delta: -1, active_focus_areas: 1 })],
      focusAreas: [{ id: 'fa1', area_type: 'general', title: null, player_id: 'p2', status: 'active' }],
    });
    expect(screen.getAllByText(/Roster.?s covered/).length).toBeGreaterThan(0);
  });
});

describe('FairwayCoachRoster — table (replaces the MatrixBoard)', () => {
  it('renders one navigable row per player instead of an expandable board row', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    renderRoster({
      players: [
        makePlayer({ id: 'p1', first_name: 'Jordan', last_name: 'Lee' }),
        makePlayer({ id: 'p2', first_name: 'Casey', last_name: 'Kim', recent_trend: 'improving', recent_trend_delta: -0.8 }),
      ],
    });

    // No row ever "expands" on this screen anymore (roster.v3.md: MatrixBoard's
    // inline expand band and phone Sheet are both retired).
    expect(screen.queryByRole('button', { name: /expandable row/ })).toBeNull();

    // Scoped to the table: "Casey Kim" also appears as a linked name in the
    // masthead verdict (the roster's one improver).
    const table = within(screen.getByRole('table'));
    const row = table.getByRole('link', { name: /Casey Kim/ }).closest('tr');
    expect(row).not.toBeNull();
    await user.click(row!);
    expect(pushMock).toHaveBeenCalledWith('/golf/dashboard/roster/p2');
  });

  it('shows every player with no cap and no "View all" link (a roster is a bounded list, not a feed)', () => {
    // Every player here defaults to `recent_trend: 'declining'`, so several
    // ALSO surface as linked names in the masthead verdict and the Attention
    // ledger — scope these assertions to the table itself so the count
    // reflects the table's own row cap (none), not the whole page.
    const players = Array.from({ length: 12 }, (_, i) => makePlayer({ id: `p${i}`, first_name: `Player${i}`, last_name: 'Test' }));
    renderRoster({ players });
    const table = within(screen.getByRole('table'));
    for (const p of players) {
      expect(table.getByRole('link', { name: new RegExp(`Player${p.id.slice(1)} Test`) })).toBeInTheDocument();
    }
    expect(screen.queryByText(/View all/)).toBeNull();
  });
});

describe('FairwayCoachRoster — honesty branches', () => {
  it('renders a "couldn\'t load" notice on the stage instead of a fake empty state when the rounds read failed', () => {
    renderRoster({ roundsUnavailable: true });
    expect(screen.getByText(/Couldn.?t load the team.?s rounds/)).toBeInTheDocument();
  });

  it('does not head two columns "Avg" when they are different numbers', () => {
    // The stage averages the selected window; the table averages the career.
    // They disagree by strokes, so the table has to say which one it is.
    renderRoster();
    const table = document.querySelector('[data-slot="roster-table"]') as HTMLElement;
    expect(within(table).getByRole('columnheader', { name: 'Avg all-time' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Avg' })).not.toBeInTheDocument();
  });

});
