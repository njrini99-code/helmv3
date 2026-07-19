/**
 * ============================================================================
 * FairwayTeamHub's Announcements tab vs the dedicated FairwayAnnouncements
 * page — presentation-layer parity (#152)
 * ----------------------------------------------------------------------------
 * #152: the Team Hub's embedded Announcements tab showed "No announcements"
 * while the dedicated /dashboard/announcements page showed 4 real posts for
 * the SAME account. Root-caused (see the comment above the Announcements
 * <TabsContent> in FairwayTeamHub.tsx): the two surfaces are fed by two
 * DIFFERENT server queries —
 *
 *   • Team Hub tab   → getPlayerHubAnnouncements() → the
 *     get_player_hub_announcements() Postgres RPC, which hard-filters to
 *     `published_at >= now() - interval '30 days'` LIMIT 10 (further capped
 *     to LIMIT 5 in its `visible` CTE) — see
 *     supabase/migrations/20260527000000_prod_public_baseline.sql.
 *   • Dedicated page → getAnnouncementsWithMeta() (src/app/golf/actions/
 *     announcements.ts), no date window, no cap.
 *
 * Neither query lives in this package's owned files (team-hub/page.tsx,
 * announcements/page.tsx, the RPC migration, and the actions files are all
 * out of scope for this component-level package) — so THIS test cannot patch
 * that mismatch. What it CAN prove, and what it asserts, is that the two
 * PRESENTATION components in this package are not an independent source of
 * data loss: given the IDENTICAL announcement set for the identical account,
 * FairwayTeamHub's Announcements tab and FairwayAnnouncements' player feed
 * render the exact same posts, with no additional CLIENT-SIDE filtering or
 * dropped rows beyond a deliberate, documented preview cap.
 *
 * One more narrowing layer was found while writing this test (also outside
 * this package): the Team Hub tab's list renderer (AnnouncementsList,
 * hub-parts.tsx `../hub/hub-parts.tsx`, NOT owned by this package) caps its
 * OWN display at the 3 most-recent/unread items — `.slice(0, 3)` — as a
 * deliberate "preview" design (its "View all" link routes to the full page),
 * unlike the dedicated Announcements page which shows everything it's given.
 * So the parity check below uses a 2-item fixture set (under that cap) to
 * isolate genuine data loss from that intentional preview truncation.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import { FairwayTeamHub } from './FairwayTeamHub';
import { FairwayAnnouncements } from '../announcements/FairwayAnnouncements';

// Both surfaces' cards lazily call these server actions only once a card is
// EXPANDED or acknowledged — never at initial collapsed render — but they're
// mocked anyway so importing the module tree never reaches for a real
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

// Kept at 2 items — under AnnouncementsList's own 3-item preview cap (see
// header comment) — so this test isolates presentation-layer parity from
// that separate, deliberate, out-of-scope truncation.
const SAME_ACCOUNT_ANNOUNCEMENTS: GolfAnnouncementMeta[] = [
  makeAnnouncement('a1', 'Practice moved to 4pm'),
  makeAnnouncement('a2', 'Bring your rain gear Thursday'),
];

function teamHubBaseProps() {
  return {
    tasks: [],
    trips: [],
    classes: [],
    teammates: [],
    playerName: 'Jamie Player',
    teamName: 'Wildcats Golf',
    initialTab: 'announcements',
    onCompleteTask: async () => {},
  };
}

describe('Announcements tab/page parity (#152)', () => {
  it('renders every announcement title the dedicated Announcements page renders, for the SAME account', () => {
    const { unmount } = render(
      <FairwayTeamHub {...teamHubBaseProps()} announcements={SAME_ACCOUNT_ANNOUNCEMENTS} />,
    );

    for (const ann of SAME_ACCOUNT_ANNOUNCEMENTS) {
      expect(screen.getByText(ann.title)).toBeInTheDocument();
    }
    unmount();

    render(
      <FairwayAnnouncements
        announcements={SAME_ACCOUNT_ANNOUNCEMENTS}
        players={[]}
        documents={[]}
        isCoach={false}
        playerId="player-1"
        recentCount={0}
      />,
    );

    for (const ann of SAME_ACCOUNT_ANNOUNCEMENTS) {
      expect(screen.getByText(ann.title)).toBeInTheDocument();
    }
  });

  it('shows the honest "No recent announcements" state (not a bare "no announcements ever" claim) with a path to the full history when the tab receives an empty set', () => {
    render(<FairwayTeamHub {...teamHubBaseProps()} announcements={[]} />);

    expect(screen.getByText('No recent announcements')).toBeInTheDocument();
    expect(screen.getByText(/last 30 days/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view all announcements/i })).toHaveAttribute(
      'href',
      '/golf/dashboard/announcements',
    );
  });
});
