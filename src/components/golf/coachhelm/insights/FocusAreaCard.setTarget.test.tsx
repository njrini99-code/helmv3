// @vitest-environment jsdom
/**
 * ============================================================================
 * FocusAreaCard (golf/coachhelm/insights) — "Set a target" CTA parity (#58/#75)
 * ----------------------------------------------------------------------------
 * This is the OTHER FocusAreaCard — the read-only one rendered from
 * `PlayerFocusAreas` (a player's own "Focus areas" section) — distinct from
 * the Fairway `FocusAreaCard` (which already got its own "Set a target" CTA
 * in the round-1 pass). This card had no target-less affordance at all: a
 * focus area with no `target_improvement` rendered nothing where the target
 * pill would go, leaving the whole-card click as the only (undiscoverable)
 * way to act on it. Fix: render a visible "Set a target" CTA in that slot,
 * wired to the SAME `onClick` handler the card already uses (My Development),
 * gated on `onClick` being wired so it never renders a dead button.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FocusAreaCard } from './FocusAreaCard';
import type { PlayerFocusArea } from '@/lib/coachhelm/insight-types';

function area(overrides: Partial<PlayerFocusArea> = {}): PlayerFocusArea {
  return {
    id: 'fa-1',
    player_id: 'p-1',
    coach_id: 'c-1',
    category: 'putting',
    priority: 1,
    title: 'Tighten lag putting',
    description: 'Focus on speed control from 20+ feet.',
    specific_drills: [],
    current_performance: {},
    target_improvement: null,
    status: 'active',
    progress_notes: null,
    is_auto_generated: false,
    last_reviewed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('FocusAreaCard (golf/insights) — "Set a target" CTA (#58/#75)', () => {
  // CONTRACT CHANGE (audit 2026-07-24, P-10): "Set a target" is a
  // NON-INTERACTIVE chip, not a nested <button>.
  //
  // The card root is already `role="button"` carrying this exact handler, so a
  // real button inside it was a nested interactive control (axe
  // nested-interactive, serious) that did nothing the card didn't already do —
  // its `stopPropagation` existed only to stop the handler firing twice. The
  // affordance stays; the duplicate control is gone. What matters now is that
  // the chip is VISIBLE and that clicking it still reaches the card's handler
  // exactly once (it bubbles, rather than firing its own copy).

  it('with a wired onClick and no target_improvement: shows a "Set a target" affordance', () => {
    render(<FocusAreaCard focusArea={area()} onClick={vi.fn()} />);

    expect(screen.getByText('Set a target')).toBeInTheDocument();
  });

  it('the affordance is NOT its own button — the card is the only interactive control', () => {
    render(<FocusAreaCard focusArea={area()} onClick={vi.fn()} />);

    // Exact-match name: the outer card's accessible name concatenates all
    // descendant text, so a loose regex would match the card itself.
    expect(
      screen.queryByRole('button', { name: 'Set a target' }),
    ).not.toBeInTheDocument();
  });

  it('clicking "Set a target" invokes the card onClick exactly once', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<FocusAreaCard focusArea={area()} onClick={onClick} />);

    await user.click(screen.getByText('Set a target'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('with no onClick wired: renders no CTA at all (never a dead affordance)', () => {
    render(<FocusAreaCard focusArea={area()} />);
    expect(screen.queryByText('Set a target')).not.toBeInTheDocument();
  });

  it('with a real target_improvement: shows the target pill, not the CTA', () => {
    render(
      <FocusAreaCard
        focusArea={area({ target_improvement: 'Putts per round: 32 -> 28' })}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText('Putts per round: 32 -> 28')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Set a target' }),
    ).not.toBeInTheDocument();
  });
});
