/**
 * ============================================================================
 * FairwayCoachAnnouncementCard — chevron disclosure regression (#100)
 * ----------------------------------------------------------------------------
 * #100 asked for direct re-verification that the collapsed card's chevron
 * toggle actually expands/collapses the detail region on tap, rather than
 * just rotating a decorative glyph with no visible content change. This is a
 * DIRECT repro: click the header toggle and assert the detail region mounts
 * (role="region", aria-controls target) and `aria-expanded` flips; click
 * again and assert it unmounts.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import type { GolfAnnouncementMeta } from '@/lib/types/golf';
import { FairwayCoachAnnouncementCard } from './FairwayCoachAnnouncementCard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/app/golf/actions/announcements', () => ({
  getAnnouncementDetail: vi.fn(async () => ({
    success: true,
    data: {
      id: 'a1',
      body: 'Full body text',
      requires_acknowledgement: false,
      total_recipients: 0,
      acknowledged_count: 0,
      documents: [],
      tasks: [],
      acknowledgements: [],
    },
  })),
  deleteAnnouncement: vi.fn(async () => ({ success: true })),
}));

function makeAnnouncement(): GolfAnnouncementMeta {
  return {
    id: 'a1',
    title: 'Practice moved',
    body: 'Short preview',
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

describe('FairwayCoachAnnouncementCard — chevron expand/collapse', () => {
  it('mounts the detail region and flips aria-expanded on click, and unmounts it on a second click', async () => {
    render(<FairwayCoachAnnouncementCard announcement={makeAnnouncement()} />);

    const toggle = screen.getByRole('button', { name: /practice moved/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: /details for practice moved/i })).toBeNull();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() =>
      expect(screen.getByRole('region', { name: /details for practice moved/i })).toBeInTheDocument(),
    );
    await waitFor(() => expect(screen.getByText('Full body text')).toBeInTheDocument());

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('region', { name: /details for practice moved/i })).toBeNull();
  });
});
