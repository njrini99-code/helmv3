/**
 * useFocusTrap — the shared hand-rolled-dialog primitive (ConfirmDialog,
 * JoinRequestsModal, EventDetailModal, PeekPanel, CoachDetailPanel,
 * PatternValidationModal, TeamsClient) and, as of the a11y sweep, the three
 * hand-rolled command palettes (CommandPalette ×2, CrmCommandPalette) and
 * confirms the exact contract those consumers rely on:
 *
 *  - auto-focuses the first focusable element inside the trap container
 *    when it opens,
 *  - Tab/Shift+Tab cycle WITHIN the container instead of escaping to
 *    background controls (WCAG 2.4.3 / 4.1.2),
 *  - Escape invokes onClose,
 *  - focus is restored to whatever was focused before the dialog opened
 *    (the trigger button) once it closes,
 *  - body scroll is locked while open and released on close.
 *
 * None of the consumers above have their own focus-trap test (several even
 * mock this hook out — see EventDetailModal.test.tsx), so this is the only
 * place the shared contract itself is exercised.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Button } from '@/components/ui/button';
import { useFocusTrap } from '../use-focus-trap';

function TestHarness({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { modalRef } = useFocusTrap(isOpen, onClose);
  return (
    <div>
      <Button>Opener</Button>
      {isOpen && (
        <div ref={modalRef} role="dialog" aria-modal="true">
          <Button>First</Button>
          <Button>Middle</Button>
          <Button>Last</Button>
        </div>
      )}
    </div>
  );
}

describe('useFocusTrap', () => {
  it('auto-focuses the first focusable element inside the container on open', async () => {
    render(<TestHarness isOpen onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('First')).toHaveFocus();
    });
  });

  it('wraps Tab from the last focusable element back to the first', async () => {
    render(<TestHarness isOpen onClose={() => {}} />);
    screen.getByText('Last').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByText('First')).toHaveFocus();
  });

  it('wraps Shift+Tab from the first focusable element back to the last', async () => {
    render(<TestHarness isOpen onClose={() => {}} />);
    screen.getByText('First').focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByText('Last')).toHaveFocus();
  });

  it('does not intercept Tab between two elements that both sit inside the trap', () => {
    render(<TestHarness isOpen onClose={() => {}} />);
    const middle = screen.getByText('Middle');
    middle.focus();
    const event = fireEvent.keyDown(document, { key: 'Tab' });
    // Only first/last are special-cased — Tab from the middle element is left
    // to the browser's native traversal (preventDefault would break normal
    // in-panel tabbing), so the synthetic event isn't cancelled here.
    expect(event).toBe(true);
  });

  it('calls onClose on Escape while open', () => {
    const onClose = vi.fn();
    render(<TestHarness isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not listen for Escape once closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(<TestHarness isOpen onClose={onClose} />);
    rerender(<TestHarness isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('restores focus to the element that was focused before opening', async () => {
    const { rerender } = render(<TestHarness isOpen={false} onClose={() => {}} />);
    const opener = screen.getByText('Opener');
    opener.focus();
    expect(opener).toHaveFocus();

    rerender(<TestHarness isOpen onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('First')).toHaveFocus();
    });

    rerender(<TestHarness isOpen={false} onClose={() => {}} />);
    expect(opener).toHaveFocus();
  });

  it('locks body scroll while open and releases it on close', () => {
    const { rerender } = render(<TestHarness isOpen={false} onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('');

    rerender(<TestHarness isOpen onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');

    rerender(<TestHarness isOpen={false} onClose={() => {}} />);
    expect(document.body.style.overflow).toBe('');
  });
});
