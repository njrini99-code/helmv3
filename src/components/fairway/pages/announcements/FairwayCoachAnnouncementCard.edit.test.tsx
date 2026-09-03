/**
 * ============================================================================
 * FairwayCoachAnnouncementCard — Edit control (GAPS_AUDIT_INTERACTION_CRUD
 * 2026-09-02: no Edit action existed anywhere on a posted announcement;
 * expanding only revealed Delete, forcing destructive delete+recreate to
 * change a typo).
 * ----------------------------------------------------------------------------
 * Direct repro + regression: an Edit control sits next to Delete once the
 * card is expanded; clicking it opens the shared AnnouncementFormSheet in
 * edit mode, prefilled from the announcement's own title/body/urgency/
 * requires_acknowledgement — not the lazily-fetched detail — and the
 * create-only sections (Send to, Attachments, Tasks) do not render. A
 * successful save calls updateAnnouncement and patches the collapsed card's
 * header immediately (optimistic `override`), without waiting on
 * router.refresh() to deliver fresh props.
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

const { updateAnnouncementMock } = vi.hoisted(() => ({
  updateAnnouncementMock: vi.fn(async () => ({ success: true })),
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
  createEnrichedAnnouncement: vi.fn(async () => ({ success: true })),
  updateAnnouncement: updateAnnouncementMock,
}));

function makeAnnouncement(overrides: Partial<GolfAnnouncementMeta> = {}): GolfAnnouncementMeta {
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
    ...overrides,
  } as GolfAnnouncementMeta;
}

describe('FairwayCoachAnnouncementCard — Edit control', () => {
  it('renders Edit alongside Delete once expanded, and opens the sheet prefilled from the announcement — not the create-only sections', async () => {
    render(<FairwayCoachAnnouncementCard announcement={makeAnnouncement()} />);

    // Edit/Delete only render in the expanded detail.
    fireEvent.click(screen.getByRole('button', { name: /practice moved/i }));
    await waitFor(() => expect(screen.getByText('Full body text')).toBeInTheDocument());

    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));

    await waitFor(() => expect(screen.getByText('Edit announcement')).toBeInTheDocument());
    expect(screen.getByDisplayValue('Practice moved')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Short preview')).toBeInTheDocument();

    // Recipients/attachments/tasks are create-only — not editable here (see
    // the note on updateAnnouncement in announcements.ts).
    expect(screen.queryByText('Send to')).toBeNull();
    expect(screen.queryByText('Attachments')).toBeNull();
    expect(screen.queryByText('Tasks')).toBeNull();

    // The acknowledgement toggle IS shared with create mode.
    expect(screen.getByText('Require acknowledgement')).toBeInTheDocument();
  });

  it('saves via updateAnnouncement scoped to this announcement, and patches the collapsed header immediately', async () => {
    render(<FairwayCoachAnnouncementCard announcement={makeAnnouncement()} />);

    fireEvent.click(screen.getByRole('button', { name: /practice moved/i }));
    await waitFor(() => expect(screen.getByText('Full body text')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    await waitFor(() => expect(screen.getByText('Edit announcement')).toBeInTheDocument());

    fireEvent.change(screen.getByDisplayValue('Practice moved'), {
      target: { value: 'Practice moved again' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() =>
      expect(updateAnnouncementMock).toHaveBeenCalledWith(
        'a1',
        expect.objectContaining({ title: 'Practice moved again', body: 'Short preview' }),
      ),
    );

    // Optimistic patch — the collapsed header reflects the edit without a
    // full reload.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /practice moved again/i })).toBeInTheDocument(),
    );
  });
});
