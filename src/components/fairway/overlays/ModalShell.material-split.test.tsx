/**
 * ============================================================================
 * ModalShell — material split off the framer-motion-transformed node
 * (perf, 2026-09-10)
 * ----------------------------------------------------------------------------
 * framer-motion applies an inline `transform` (scale/y) to the panel
 * `motion.div` for the entire materialize/exit tween. A `backdrop-filter` on
 * that SAME element gets resampled every frame of that tween — `fw-glass-
 * strong` is a 36px blur, so this was the modal-open jank. The material now
 * lives on a static inner child; the transformed node keeps only layout,
 * the radius clip, and the outward shadow.
 * ============================================================================
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ModalShell } from './ModalShell';

describe('ModalShell — material split off the transformed node', () => {
  it('never puts fw-glass-strong on the element role="dialog" (the node framer-motion transforms)', () => {
    render(
      <ModalShell open title="Confirm">
        <ModalShell.Body>content</ModalShell.Body>
      </ModalShell>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Confirm' });
    expect(dialog).not.toHaveClass('fw-glass-strong');

    const material = dialog.querySelector('[data-slot="modal-shell-material"]');
    expect(material).not.toBeNull();
    expect(material).toHaveClass('fw-glass-strong');
  });

  it('keeps focus management, the close button, and body content intact after the split', () => {
    render(
      <ModalShell open title="Confirm">
        <ModalShell.Body>content</ModalShell.Body>
      </ModalShell>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Confirm' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('tabIndex', '-1');
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(dialog.textContent).toContain('content');
  });

  it('splits the workspace presentation the same way', () => {
    render(
      <ModalShell open presentation="workspace" title="Find a time">
        <ModalShell.Body>workspace content</ModalShell.Body>
      </ModalShell>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Find a time' });
    expect(dialog).not.toHaveClass('fw-glass-strong');
    const material = dialog.querySelector('[data-slot="modal-shell-material"]');
    expect(material).toHaveClass('fw-glass-strong');
  });
});
