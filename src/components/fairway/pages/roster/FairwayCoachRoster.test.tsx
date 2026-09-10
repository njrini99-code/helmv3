/**
 * ============================================================================
 * FairwayCoachRoster — Wave 2 "Who needs your attention" header band
 * ----------------------------------------------------------------------------
 * The roster-health instrument (originally PlayersGridView.tsx's
 * RosterHealthHeader, extracted to a `RosterHealthHeader.tsx` JSX component
 * that ended up with no render call sites and was deleted — see
 * roster-health.ts) is ported into the canonical Roster page as its own
 * header band, instead of sitting orphaned behind the hidden `?view=players`
 * route. This pins that the band renders above the
 * player grid and that its "Add focus area" affordance (no in-page modal on
 * this page) navigates to the canonical prescribe flow scoped to the player.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FairwayCoachRoster } from './FairwayCoachRoster';
import type { RosterPlayer } from './FairwayPlayerCard';
import type { PlayersGridFocusArea } from '@/components/fairway/pages/coachhelm/PlayersGridView';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/golf/dashboard/roster',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

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
    active_focus_areas: 0,
    active_goals: 0,
    ...overrides,
  };
}

describe('FairwayCoachRoster — roster-health header band', () => {
  it('renders the "Who needs your attention" instrument above the player grid', () => {
    render(
      <FairwayCoachRoster
        players={[makePlayer()]}
        teamName="Helm Golf"
        inviteCode="ABC123"
        intents={{}}
        joinRequests={[]}
        focusAreas={[]}
      />,
    );
    expect(screen.getByText('Who needs your attention')).toBeInTheDocument();
    // The flagged (declining, uncoached) player surfaces in the ranked list.
    expect(screen.getAllByText('Jordan Lee').length).toBeGreaterThan(0);
  });

  it('navigates to the intelligence Players/Focus-areas drill, scoped to the player, when "Add focus area" is clicked from the needs list', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    render(
      <FairwayCoachRoster
        players={[makePlayer()]}
        teamName="Helm Golf"
        inviteCode="ABC123"
        intents={{}}
        joinRequests={[]}
        focusAreas={[]}
      />,
    );

    const addButtons = screen.getAllByRole('button', { name: 'Add focus area' });
    await user.click(addButtons[0]!);
    expect(pushMock).toHaveBeenCalledWith(
      '/golf/dashboard/intelligence?view=players&player=p1&playersTab=areas',
    );
  });

  it('does not render the health header on the empty-roster state (avoids a second "awaiting" instrument stacked on Build your team)', () => {
    render(
      <FairwayCoachRoster
        players={[]}
        teamName="Helm Golf"
        inviteCode={null}
        intents={{}}
        joinRequests={[]}
        focusAreas={[]}
      />,
    );
    expect(screen.queryByText('Who needs your attention')).toBeNull();
    expect(screen.getByText('Build your team')).toBeInTheDocument();
  });

  /**
   * Facelift (docs/design/fairway-facelift/screens/roster.md) replaced the
   * per-player card gallery with a MatrixBoard — one row per player, not a
   * responsive card grid. The `lg:grid-cols-2` / `md:grid-cols-2` assertion
   * this test used to make (GAPS_AUDIT_TABLET_LANDSCAPE_2026-09-02.md #1)
   * guarded a card-grid-too-narrow defect that no longer exists now that the
   * card gallery is gone; MatrixBoard owns its own internal breakpoint
   * (940px, in MatrixBoard.tsx) instead. Replaced below by
   * "renders one row per player" and the attention-filter test.
   */
  it('renders one MatrixBoard row per player', () => {
    render(
      <FairwayCoachRoster
        players={[makePlayer({ id: 'p1', first_name: 'Jordan', last_name: 'Lee' }), makePlayer({ id: 'p2', first_name: 'Casey', last_name: 'Kim', recent_trend: 'improving' })]}
        teamName="Helm Golf"
        inviteCode="ABC123"
        intents={{}}
        joinRequests={[]}
        focusAreas={[]}
      />,
    );
    // Each MatrixBoard row is an expandable button carrying the player's row aria-label.
    expect(screen.getByRole('button', { name: /Jordan Lee, expandable row/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Casey Kim, expandable row/ })).toBeInTheDocument();
  });

  it('filters the board to only the flagged players when the "Needs attention" control is used', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    const flagged = makePlayer({ id: 'p1', first_name: 'Jordan', last_name: 'Lee', recent_trend: 'declining' });
    const onTrack = makePlayer({
      id: 'p2',
      first_name: 'Casey',
      last_name: 'Kim',
      recent_trend: 'improving',
      active_focus_areas: 1,
    });
    const focusAreas: PlayersGridFocusArea[] = [
      { id: 'fa1', area_type: 'general', title: null, player_id: 'p2', status: 'active' },
    ];
    render(
      <FairwayCoachRoster
        players={[flagged, onTrack]}
        teamName="Helm Golf"
        inviteCode="ABC123"
        intents={{}}
        joinRequests={[]}
        focusAreas={focusAreas}
      />,
    );

    expect(screen.getByRole('button', { name: /Jordan Lee, expandable row/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Casey Kim, expandable row/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Needs attention/ }));

    expect(screen.getByRole('button', { name: /Jordan Lee, expandable row/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Casey Kim, expandable row/ })).toBeNull();
  });

  it('reflects a covered, non-flagged roster as the honest "covered" state', () => {
    const covered = makePlayer({
      id: 'p2',
      recent_trend: 'improving',
      active_focus_areas: 1,
    });
    const focusAreas: PlayersGridFocusArea[] = [
      { id: 'fa1', area_type: 'general', title: null, player_id: 'p2', status: 'active' },
    ];
    render(
      <FairwayCoachRoster
        players={[covered]}
        teamName="Helm Golf"
        inviteCode="ABC123"
        intents={{}}
        joinRequests={[]}
        focusAreas={focusAreas}
      />,
    );
    expect(screen.getByText(/Roster.?s covered/)).toBeInTheDocument();
  });
});
