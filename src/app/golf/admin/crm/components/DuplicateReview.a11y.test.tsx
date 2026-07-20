/**
 * ============================================================================
 * DuplicateReview.tsx — modal a11y consistency (audit: modals lacking
 * useFocusTrap)
 * ----------------------------------------------------------------------------
 * Locks in the two standard dismiss paths (Escape key, backdrop click) now
 * wired through the shared useFocusTrap hook. Also guards the "nested inside
 * ImportModal's own backdrop" case: DuplicateReview's backdrop click must
 * stopPropagation so one click/Escape can't cascade-close a parent modal.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@/test/utils';
import { fireEvent } from '@testing-library/react';
import { DuplicateReview } from './DuplicateReview';

vi.mock('@/app/golf/actions/crm-dedup', () => ({
  findDuplicateCoaches: vi.fn(async () => []),
  mergeCoaches: vi.fn(async () => ({ ok: true })),
}));

describe('DuplicateReview — a11y dismiss paths', () => {
  it('closes on Escape', async () => {
    const onClose = vi.fn();
    const { user } = render(<DuplicateReview onClose={onClose} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click, not on content click', () => {
    const onClose = vi.fn();
    const { container, getByText } = render(<DuplicateReview onClose={onClose} />);

    fireEvent.click(getByText('Review Duplicates'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(container.firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalled();
  });

  it('backdrop click does not bubble past DuplicateReview (nested-modal guard)', () => {
    const innerClose = vi.fn();
    const outerClose = vi.fn();
    // Simulate DuplicateReview mounted inside another modal's own backdrop
    // div (as it is from ImportModal) — a click on DuplicateReview's own
    // backdrop must not also fire the parent's onClick.
    const { container } = render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- test-only stand-in for a parent modal's backdrop onClick
      <div onClick={outerClose}>
        <DuplicateReview onClose={innerClose} />
      </div>
    );
    const backdrop = container.querySelector('.z-\\[60\\]') as HTMLElement;
    fireEvent.click(backdrop);
    expect(innerClose).toHaveBeenCalled();
    expect(outerClose).not.toHaveBeenCalled();
  });
});
