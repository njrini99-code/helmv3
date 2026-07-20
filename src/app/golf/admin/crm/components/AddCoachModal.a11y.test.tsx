/**
 * ============================================================================
 * AddCoachModal.tsx — modal a11y consistency (audit: modals lacking
 * useFocusTrap)
 * ----------------------------------------------------------------------------
 * Locks in the two standard dismiss paths (Escape key, backdrop click) now
 * wired through the shared useFocusTrap hook.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@/test/utils';
import { fireEvent } from '@testing-library/react';
import { AddCoachModal } from './AddCoachModal';

// jsdom has no scrollIntoView; the Select's highlighted-option effect calls it.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ insert: vi.fn(async () => ({ error: null })) }),
  }),
}));

describe('AddCoachModal — a11y dismiss paths', () => {
  const statusConfig = {
    new_lead: { label: 'New Lead', iconLabel: null },
  } as never;

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const { user } = render(<AddCoachModal onClose={onClose} onSuccess={vi.fn()} statusConfig={statusConfig} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click, not on content click', () => {
    const onClose = vi.fn();
    const { container, getByText } = render(
      <AddCoachModal onClose={onClose} onSuccess={vi.fn()} statusConfig={statusConfig} />
    );

    fireEvent.click(getByText('Add New Coach'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
