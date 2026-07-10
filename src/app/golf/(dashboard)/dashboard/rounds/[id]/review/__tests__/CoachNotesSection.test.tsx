/**
 * CoachNotesSection — gating + wiring regression test.
 *
 * Confirms the previously-inert `annotateReview` action (round-reviews.ts)
 * is actually called from the UI, that the save updates what's rendered
 * immediately (no full page refresh needed), and that the honest-empty
 * gating holds: a player with no note sees nothing, a coach with no note
 * sees an inviting "Add note" affordance.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const annotateReview = vi.fn();

vi.mock('@/app/golf/actions/round-reviews', () => ({
  annotateReview: (...args: unknown[]) => annotateReview(...args),
}));

const addToast = vi.fn();
vi.mock('@/components/ui/sonner', () => ({
  useToast: () => ({ addToast }),
}));

import { CoachNotesSection } from '../CoachNotesSection';

describe('CoachNotesSection', () => {
  beforeEach(() => {
    annotateReview.mockReset();
    addToast.mockReset();
  });

  it('renders nothing for a player with no coach note yet', () => {
    const { container } = render(
      <CoachNotesSection reviewId="review-1" initialNotes={null} canEdit={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the note read-only for a player (no edit affordance)', () => {
    render(
      <CoachNotesSection reviewId="review-1" initialNotes="Great tempo today." canEdit={false} />,
    );
    expect(screen.getByText('Great tempo today.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit|add note/i })).not.toBeInTheDocument();
  });

  it('shows an inviting empty state + "Add note" for a coach viewer', () => {
    render(<CoachNotesSection reviewId="review-1" initialNotes={null} canEdit />);
    expect(screen.getByText('No coaching note yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add note' })).toBeInTheDocument();
  });

  it('wires the Save button to annotateReview and reflects the saved note immediately', async () => {
    annotateReview.mockResolvedValue({ success: true });

    render(<CoachNotesSection reviewId="review-1" initialNotes={null} canEdit />);

    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    const textarea = screen.getByPlaceholderText('Add a coaching note for this round…');
    fireEvent.change(textarea, { target: { value: 'Work on lag putts.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(annotateReview).toHaveBeenCalledWith('review-1', 'Work on lag putts.');
    });

    // The saved note appears without a page refresh/reload.
    await waitFor(() => {
      expect(screen.getByText('Work on lag putts.')).toBeInTheDocument();
    });
    expect(screen.queryByPlaceholderText('Add a coaching note for this round…')).not.toBeInTheDocument();
  });

  it('surfaces a server error via toast and keeps the draft editable on failure', async () => {
    annotateReview.mockResolvedValue({ success: false, error: 'Not authorized' });

    render(<CoachNotesSection reviewId="review-1" initialNotes={null} canEdit />);

    fireEvent.click(screen.getByRole('button', { name: 'Add note' }));
    fireEvent.change(screen.getByPlaceholderText('Add a coaching note for this round…'), {
      target: { value: 'Note attempt.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', description: 'Not authorized' }),
      );
    });
    // Draft is still open for the user to retry.
    expect(screen.getByPlaceholderText('Add a coaching note for this round…')).toBeInTheDocument();
  });
});
