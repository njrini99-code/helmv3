/**
 * ============================================================================
 * FairwayCoachRoster — Wave 2 "Who needs your attention" header band
 * ----------------------------------------------------------------------------
 * The roster-health instrument (PlayersGridView.tsx's RosterHealthHeader,
 * extracted to RosterHealthHeader.tsx) is now ported into the canonical
 * Roster page as its header band, instead of sitting orphaned behind the
 * hidden `?view=players` route. This pins that the band renders above the
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
   * GAPS_AUDIT_TABLET_LANDSCAPE_2026-09-02.md #1 (HIGH) — at 810×1080 tablet
   * portrait and 844×390 mobile landscape, `md:grid-cols-2` (768px) put the
   * player grid into 2 columns while the app shell's sidebar still left only
   * a ~550px content column, so each card was ~265px: too narrow for a name
   * + year badge + hometown + the SG:Total/Focus/Goals row, and "Cole
   * Bennett" rendered as "C...". The grid now steps to 2-up at `lg` (1024px)
   * instead, so tablet/mobile-landscape widths get a full single column.
   */
  it('sizes the player grid at lg (1024px), not md (768px), so tablet/mobile-landscape width is not squeezed into 2 narrow columns', () => {
    const { container } = render(
      <FairwayCoachRoster
        players={[makePlayer()]}
        teamName="Helm Golf"
        inviteCode="ABC123"
        intents={{}}
        joinRequests={[]}
        focusAreas={[]}
      />,
    );
    expect(container.innerHTML).toMatch(/\blg:grid-cols-2\b/);
    expect(container.innerHTML).not.toMatch(/\bmd:grid-cols-2\b/);
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
