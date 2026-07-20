/**
 * ============================================================================
 * QuickActionsPanel.tsx — modal a11y consistency (audit: modals lacking
 * useFocusTrap)
 * ----------------------------------------------------------------------------
 * Locks in the two standard dismiss paths (Escape key, backdrop click) now
 * wired through the shared useFocusTrap hook, so this dialog can't silently
 * regress back to "click the X or nothing" again.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@/test/utils';
import { fireEvent } from '@testing-library/react';
import { QuickActionsPanel } from './QuickActionsPanel';
import type { Coach, CoachStatus } from '../crm-config';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ insert: vi.fn(async () => ({ error: null })) }),
  }),
}));

const STATUS_CONFIG = {
  new_lead: { label: 'New Lead', color: 'text-warm-700', bgColor: 'bg-warm-100', icon: null },
} as Record<CoachStatus, { label: string; color: string; bgColor: string; icon: React.ReactNode }>;

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
  status: 'new_lead',
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

describe('QuickActionsPanel — a11y dismiss paths', () => {
  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const { user } = render(
      <QuickActionsPanel coach={COACH} onClose={onClose} onUpdate={vi.fn()} statusConfig={STATUS_CONFIG} />
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click, not on content click', () => {
    const onClose = vi.fn();
    const { container, getByText } = render(
      <QuickActionsPanel coach={COACH} onClose={onClose} onUpdate={vi.fn()} statusConfig={STATUS_CONFIG} />
    );

    // Click inside the dialog content — must NOT close.
    fireEvent.click(getByText(COACH.school));
    expect(onClose).not.toHaveBeenCalled();

    // Click the backdrop (the modal's outer root node) — must close.
    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
