/**
 * ============================================================================
 * EventDetailModal.tsx — modal a11y consistency (audit: modals lacking
 * useFocusTrap)
 * ----------------------------------------------------------------------------
 * Locks in the two standard dismiss paths (Escape key, backdrop click) now
 * wired through the shared useFocusTrap hook.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@/test/utils';
import { fireEvent } from '@testing-library/react';
import { EventDetailModal } from './EventDetailModal';
import type { CRMEvent } from './CalendarView';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      update: () => ({ eq: vi.fn(async () => ({ error: null })) }),
      delete: () => ({ eq: vi.fn(async () => ({ error: null })) }),
    }),
  }),
}));

const EVENT: CRMEvent = {
  id: 'event-1',
  title: 'Demo call',
  description: null,
  event_type: 'demo',
  start_time: '2026-08-01T14:00:00.000Z',
  end_time: '2026-08-01T14:30:00.000Z',
  all_day: false,
  location: null,
  meeting_url: null,
  coach_id: null,
  coach_name: null,
  coach_school: null,
  status: 'scheduled',
  google_event_id: null,
};

describe('EventDetailModal — a11y dismiss paths', () => {
  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const { user } = render(
      <EventDetailModal event={EVENT} onClose={onClose} onEdit={vi.fn()} onRefresh={vi.fn()} />
    );
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click, not on content click', () => {
    const onClose = vi.fn();
    const { container, getByText } = render(
      <EventDetailModal event={EVENT} onClose={onClose} onEdit={vi.fn()} onRefresh={vi.fn()} />
    );

    fireEvent.click(getByText(EVENT.title));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
