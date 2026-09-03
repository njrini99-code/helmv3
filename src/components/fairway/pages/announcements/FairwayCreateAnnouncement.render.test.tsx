/**
 * ============================================================================
 * FairwayCreateAnnouncement / AnnouncementFormSheet — create mode is
 * unchanged by the mode-aware refactor (2026-09-02 Edit control work).
 * ----------------------------------------------------------------------------
 * The shared sheet in FairwayCreateAnnouncement.tsx was split into
 * create/edit modes so FairwayCoachAnnouncementCard's Edit control could
 * reuse it (see FairwayCoachAnnouncementCard.edit.test.tsx, which proves the
 * create-only sections are ABSENT in edit mode). This is the other half of
 * that contract: proves the "Send to", "Attachments", and "Tasks" sections —
 * and the "Post" submit — still render in create mode, so a mode gate that
 * was inverted or over-scoped would fail a test instead of silently shipping.
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';

import { FairwayCreateAnnouncement } from './FairwayCreateAnnouncement';

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
  createEnrichedAnnouncement: vi.fn(async () => ({ success: true })),
  updateAnnouncement: vi.fn(async () => ({ success: true })),
}));

const players = [
  { id: 'p1', first_name: 'Alex', last_name: 'Rivera' },
  { id: 'p2', first_name: 'Sam', last_name: 'Lee' },
];

describe('FairwayCreateAnnouncement — create mode sections still render', () => {
  it('opens the sheet titled "New announcement" with Send to / Attachments / Tasks and a Post submit', () => {
    // Non-null teamId + at least one player so the Attachments section's own
    // gate (teamId !== null || documents.length > 0) is satisfied too.
    render(<FairwayCreateAnnouncement players={players} documents={[]} teamId="team-1" />);

    fireEvent.click(screen.getByRole('button', { name: /new announcement/i }));

    expect(screen.getByText('New announcement')).toBeInTheDocument();
    expect(screen.getByText('Send to')).toBeInTheDocument();
    expect(screen.getByText('Attachments')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^post$/i })).toBeInTheDocument();

    // "All team" targeting is the default and visible.
    expect(screen.getByRole('button', { name: /all team/i })).toBeInTheDocument();
  });
});
