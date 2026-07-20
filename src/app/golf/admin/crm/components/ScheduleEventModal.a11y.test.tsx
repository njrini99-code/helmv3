/**
 * ============================================================================
 * ScheduleEventModal.tsx — modal a11y consistency (audit: modals lacking
 * useFocusTrap)
 * ----------------------------------------------------------------------------
 * Locks in the two standard dismiss paths (Escape key, backdrop click) now
 * wired through the shared useFocusTrap hook.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@/test/utils';
import { fireEvent } from '@testing-library/react';
import { ScheduleEventModal } from './ScheduleEventModal';

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        or: () => ({ limit: vi.fn(async () => ({ data: [], error: null })) }),
      }),
      insert: vi.fn(async () => ({ error: null })),
    }),
  }),
}));

describe('ScheduleEventModal — a11y dismiss paths', () => {
  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const { user } = render(<ScheduleEventModal onClose={onClose} onSuccess={vi.fn()} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click, not on content click', () => {
    const onClose = vi.fn();
    const { container, getByText } = render(<ScheduleEventModal onClose={onClose} onSuccess={vi.fn()} />);

    fireEvent.click(getByText('Schedule Event'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
