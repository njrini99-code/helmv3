// @vitest-environment jsdom
/**
 * ============================================================================
 * FocusAreaCard — "No target set yet" gets a real CTA (bug #58)
 * ----------------------------------------------------------------------------
 * The "No target set yet" placeholder used to be a dead end: a coach reading
 * it had no way to act from the card itself and had to hunt for the separate
 * Edit button lower down — easy to miss once several cards repeat the
 * identical placeholder (#75). Fix: a "Set a target" button renders inline
 * with the placeholder, wired to the SAME `onEdit` handler the card's Edit
 * button already uses, gated the same way (coach role + a wired handler) so
 * it never renders a button that does nothing.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FocusAreaCard, type FocusAreaCardData } from './FocusAreaCard';

function area(overrides: Partial<FocusAreaCardData> = {}): FocusAreaCardData {
  return {
    id: 'fa-1',
    area_type: 'putting',
    title: 'Tighten lag putting',
    description: 'Focus on speed control from 20+ feet.',
    status: 'active',
    target_metric: null,
    current_value: null,
    target_value: null,
    ...overrides,
  };
}

describe('FocusAreaCard — "No target set yet" CTA (#58)', () => {
  it('coach view with a wired onEdit: shows a "Set a target" button beside the placeholder', () => {
    const onEdit = vi.fn();
    render(
      <FocusAreaCard
        focusArea={area()}
        // eslint-disable-next-line jsx-a11y/aria-role -- FocusAreaCard's own coach/player prop
        role="coach"
        onEdit={onEdit}
      />,
    );

    expect(screen.getByText('No target set yet')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Set a target/i }),
    ).toBeInTheDocument();
  });

  it('clicking "Set a target" invokes the same onEdit handler as the card\'s Edit button', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const focusArea = area();
    render(
      <FocusAreaCard
        focusArea={focusArea}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        onEdit={onEdit}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Set a target/i }));
    expect(onEdit).toHaveBeenCalledWith(focusArea);
  });

  it('never renders the CTA when there is no onEdit handler (never a dead button)', () => {
    render(
      <FocusAreaCard
        focusArea={area()}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
      />,
    );
    expect(screen.getByText('No target set yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Set a target/i })).not.toBeInTheDocument();
  });

  it('never renders the CTA for a player viewer (edit is coach-only)', () => {
    const onEdit = vi.fn();
    render(
      <FocusAreaCard
        focusArea={area()}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="player"
        onEdit={onEdit}
      />,
    );
    expect(screen.getByText('No target set yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Set a target/i })).not.toBeInTheDocument();
  });

  it('does not render the CTA (or the placeholder) once a target IS set', () => {
    const onEdit = vi.fn();
    render(
      <FocusAreaCard
        focusArea={area({ target_metric: 'putts_per_round', target_value: 30, current_value: 32 })}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        onEdit={onEdit}
      />,
    );
    expect(screen.queryByText('No target set yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Set a target/i })).not.toBeInTheDocument();
  });
});
