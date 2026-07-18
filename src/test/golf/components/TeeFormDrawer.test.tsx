/**
 * TeeFormDrawer — Front 9 / Back 9 toggle regression (audit W1).
 *
 * The per-hole editor used to render all 18 hole cards in one long list with
 * no way to jump straight to the back nine — on a real viewport that silently
 * clipped holes 9-18 out of easy reach. It now shows one nine at a time behind
 * a Segmented toggle, so both nines are always directly reachable.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/ui/sonner', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/app/golf/actions/course-library', () => ({
  createTee: vi.fn(async () => ({ success: true })),
  updateTee: vi.fn(async () => ({ success: true })),
}));

import { TeeFormDrawer } from '@/components/golf/courses/TeeFormDrawer';

describe('TeeFormDrawer — hole editor nine toggle', () => {
  it('shows only the front nine by default, with a toggle to reach the back nine', () => {
    render(
      <TeeFormDrawer
        open
        onOpenChange={() => {}}
        mode="create"
        courseId="course-1"
      />,
    );

    // Front 9 visible by default.
    expect(screen.getByLabelText('Hole 1 par')).toBeInTheDocument();
    expect(screen.getByLabelText('Hole 9 par')).toBeInTheDocument();
    // Back 9 not yet in the DOM.
    expect(screen.queryByLabelText('Hole 10 par')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Hole 18 par')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: 'Back 9' }));

    // Back 9 now reachable; front 9 rows are gone (one nine at a time).
    expect(screen.getByLabelText('Hole 10 par')).toBeInTheDocument();
    expect(screen.getByLabelText('Hole 18 par')).toBeInTheDocument();
    expect(screen.queryByLabelText('Hole 1 par')).not.toBeInTheDocument();
  });

  it('does not render a nine toggle for a 9-hole tee — every hole is already visible', () => {
    render(
      <TeeFormDrawer
        open
        onOpenChange={() => {}}
        mode="create"
        courseId="course-1"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '9' }));

    expect(screen.queryByRole('radio', { name: 'Front 9' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Back 9' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Hole 1 par')).toBeInTheDocument();
    expect(screen.getByLabelText('Hole 9 par')).toBeInTheDocument();
  });

  it('preserves edits to a hole after switching nines and back', () => {
    render(
      <TeeFormDrawer
        open
        onOpenChange={() => {}}
        mode="create"
        courseId="course-1"
      />,
    );

    fireEvent.change(screen.getByLabelText('Hole 1 yardage'), { target: { value: '412' } });

    fireEvent.click(screen.getByRole('radio', { name: 'Back 9' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Front 9' }));

    expect(screen.getByLabelText('Hole 1 yardage')).toHaveValue(412);
  });
});
