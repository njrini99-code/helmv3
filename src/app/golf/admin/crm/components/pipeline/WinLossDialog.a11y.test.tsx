/**
 * ============================================================================
 * WinLossDialog.tsx — modal a11y consistency (audit: modals lacking
 * useFocusTrap)
 * ----------------------------------------------------------------------------
 * WinLossDialog already had a manual Escape-key useEffect and a backdrop
 * click target, but no Tab-cycle focus trap, no body scroll lock, and its
 * dismiss paths were additionally gated behind `!submitting` (inconsistent
 * with every sibling dialog, which always allow Escape/backdrop to close).
 * Locks in the now-consistent, always-available dismiss paths via the
 * shared useFocusTrap hook.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@/test/utils';
import { WinLossDialog } from './WinLossDialog';
import type { Coach } from '../../crm-config';

const COACH: Coach = {
  id: 'coach-1',
  name: 'Pat Coach',
  title: 'Head Coach',
  email: 'pat@example.edu',
  phone: null,
  school: 'Example State',
  conference: 'Example Conference',
  division: 'D2',
  program: 'both',
  status: 'proposal',
  priority: 0,
  highlight_color: null,
  is_starred: false,
  notes: null,
  internal_comments: null,
  tags: null,
  team_size: null,
  current_software: null,
  budget_range: null,
  decision_timeline: null,
  pain_points: null,
  best_contact_method: null,
  best_contact_time: null,
  timezone: null,
  last_contacted_at: null,
  next_follow_up_at: null,
  email_status: 'unknown',
  source: null,
  is_archived: false,
  archived_at: null,
  archived_by: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  athletics_url: null,
  role_level: null,
  is_primary_contact: false,
};

describe('WinLossDialog — a11y dismiss paths', () => {
  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const { user } = render(
      <WinLossDialog coach={COACH} newStatus="lost" onClose={onClose} onSubmit={vi.fn()} />
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', async () => {
    const onClose = vi.fn();
    const { user } = render(
      <WinLossDialog coach={COACH} newStatus="lost" onClose={onClose} onSubmit={vi.fn()} />
    );
    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalled();
  });
});
