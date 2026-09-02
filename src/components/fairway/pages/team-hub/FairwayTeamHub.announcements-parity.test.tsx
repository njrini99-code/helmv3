/**
 * ============================================================================
 * FairwayTeamHub's Announcements card vs the dedicated FairwayAnnouncements
 * page — presentation-layer coherence (#152, restated for the bento hub)
 * ----------------------------------------------------------------------------
 * #152: the old Team Hub showed "No announcements" while the dedicated
 * /dashboard/announcements page showed 4 real posts for the SAME account.
 * Root cause: two DIFFERENT server queries —
 *
 *   • Team Hub card  → getPlayerHubAnnouncements() → the
 *     get_player_hub_announcements() Postgres RPC, which hard-filters to
 *     `published_at >= now() - interval '30 days'` (see
 *     supabase/migrations/20260527000000_prod_public_baseline.sql).
 *   • Dedicated page → getAnnouncementsWithMeta() (src/app/golf/actions/
 *     announcements.ts), no date window, no cap.
 *
 * Neither query lives in this package's owned files, so this test cannot
 * patch that mismatch. What it CAN prove, for the bento card that replaced
 * the old embedded tab, is that the presentation layer is never an
 * INDEPENDENT source of data loss or dishonesty:
 *
 *   1. The card is a deliberate one-item PREVIEW — it must show the newest
 *      post's real title and an honest "Latest of N recent" count for the
 *      set it was given, while the dedicated page renders every post.
 *   2. An empty (successful) fetch renders the scope-honest "last 30 days"
 *      copy with a route to the full history — never "your coach has never
 *      posted".
 *   3. A FAILED fetch renders the failure state with a retry, never the
 *      quiet-team empty state (W1 count-coherence; #1514 gave this card the
 *      same retry affordance as its siblings).
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import { FairwayTeamHub } from './FairwayTeamHub';
import { TEAM_HUB_CARD_ROUTES } from './team-hub-routes';
import { FairwayAnnouncements } from '../announcements/FairwayAnnouncements';

// The dedicated page's cards lazily call these server actions only once a
// card is EXPANDED or acknowledged — never at initial collapsed render — but
// they're mocked anyway so importing the module tree never reaches for a real
// Supabase client in jsdom.
vi.mock('@/app/golf/actions/announcements', () => ({
  getAnnouncementDetail: vi.fn(async () => ({ success: false, error: 'not needed' })),
  completeAnnouncementTask: vi.fn(async () => ({ success: true })),
}));
vi.mock('@/app/golf/actions/communication', () => ({
  acknowledgeAnnouncement: vi.fn(async () => ({ success: true })),
}));

function makeAnnouncement(id: string, title: string): GolfAnnouncementMeta {
  return {
    id,
    title,
    body: `Body for ${title}`,
    urgency: 'normal',
    requires_acknowledgement: false,
    published_at: new Date('2026-07-01T12:00:00.000Z').toISOString(),
    has_player_acknowledged: false,
    recipient_count: 0,
    acknowledged_count: 0,
    total_recipients: 0,
    task_count: 0,
    completed_task_count: 0,
    document_count: 0,
  } as GolfAnnouncementMeta;
}

// Newest-first, matching get_player_hub_announcements() ordering.
const SAME_ACCOUNT_ANNOUNCEMENTS: GolfAnnouncementMeta[] = [
  makeAnnouncement('a1', 'Practice moved to 4pm'),
  makeAnnouncement('a2', 'Bring your rain gear Thursday'),
];

function teamHubBaseProps() {
  return {
    tasks: [],
    classes: [],
    teammates: [],
    todayInTeamZone: '2026-08-18',
    teamName: 'Wildcats Golf',
    onCompleteTask: async () => {},
  };
}

describe('Announcements card/page coherence (#152)', () => {
  it('previews the newest announcement with an honest count while the dedicated page renders every post', () => {
    const { unmount } = render(
      <FairwayTeamHub {...teamHubBaseProps()} announcements={SAME_ACCOUNT_ANNOUNCEMENTS} />,
    );

    // The card is a one-item preview: newest post's real title + honest count.
    expect(screen.getByText('Practice moved to 4pm')).toBeInTheDocument();
    expect(screen.getByText('Latest of 2 recent')).toBeInTheDocument();
    unmount();

    render(
      <FairwayAnnouncements
        announcements={SAME_ACCOUNT_ANNOUNCEMENTS}
        players={[]}
        documents={[]}
        teamId={null}
        isCoach={false}
        playerId="player-1"
        recentCount={0}
      />,
    );

    for (const ann of SAME_ACCOUNT_ANNOUNCEMENTS) {
      expect(screen.getByText(ann.title)).toBeInTheDocument();
    }
  });

  it('shows the honest "No recent announcements" state (not a bare "no announcements ever" claim) with a route to the full history when the card receives an empty set', () => {
    render(<FairwayTeamHub {...teamHubBaseProps()} announcements={[]} />);

    expect(screen.getByText('No recent announcements')).toBeInTheDocument();
    expect(screen.getByText(/last 30 days/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view all announcements/i })).toHaveAttribute(
      'href',
      TEAM_HUB_CARD_ROUTES.announcements,
    );
  });

  it('shows the failure state with a retry — never the quiet-team state — when the fetch itself failed', () => {
    render(
      <FairwayTeamHub {...teamHubBaseProps()} announcements={[]} announcementsLoadError />,
    );

    expect(screen.getByText("Couldn't load announcements")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText('No recent announcements')).not.toBeInTheDocument();
  });
});
