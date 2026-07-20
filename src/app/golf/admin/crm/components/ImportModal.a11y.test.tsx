/**
 * ============================================================================
 * ImportModal.tsx — modal a11y consistency (audit: modals lacking
 * useFocusTrap; ImportModal additionally had NO backdrop click at all)
 * ----------------------------------------------------------------------------
 * Locks in the two standard dismiss paths (Escape key, backdrop click) now
 * wired through the shared useFocusTrap hook.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@/test/utils';
import { fireEvent } from '@testing-library/react';
import { ImportModal } from './ImportModal';

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ in: vi.fn(async () => ({ data: [] })) }),
      insert: vi.fn(async () => ({ error: null })),
    }),
  }),
}));

describe('ImportModal — a11y dismiss paths', () => {
  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const { user } = render(<ImportModal onClose={onClose} onSuccess={vi.fn()} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click (previously had none), not on content click', () => {
    const onClose = vi.fn();
    const { container, getByText } = render(<ImportModal onClose={onClose} onSuccess={vi.fn()} />);

    fireEvent.click(getByText('Import Coaches'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });
});
