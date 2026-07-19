// @vitest-environment jsdom
/**
 * ============================================================================
 * RosterPlayerCard — the phone-native roster row (audit W2)
 * ----------------------------------------------------------------------------
 * Bug: below `sm`, the roster's ONLY presentation was the desktop DataTable
 * squeezed to a 390px viewport — Player/Avg score/Trend stayed visible but
 * the Focus-status / "Add focus area" / "View genome" columns clipped off
 * the right edge, and DataTable's row-action buttons only reveal on
 * hover/focus-within (no hover on touch), so a coach on a phone had no way
 * to reach either action from the roster.
 *
 * Fix: PlayersGridView now renders RosterPlayerCard for < sm — a native card
 * with identity + avg score + trend, and "Add focus area" / "View genome" as
 * their own always-visible <Button>s below a divider (not a hover-revealed
 * column). This locks in that those two actions render as real, always-
 * present buttons — never nested inside a <table> where they'd be subject to
 * the table's auto-layout squeeze — and that each calls its own handler.
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { RosterPlayerCard, type RosterRow } from './PlayersGridView';

function makeRow(overrides: Partial<RosterRow['player']> = {}): RosterRow {
  return {
    player: {
      id: 'p1',
      first_name: 'Jordan',
      last_name: 'Lee',
      avatar_url: null,
      graduation_year: 2027,
      handicap: 2,
      hometown: null,
      state: null,
      ...overrides,
    },
    stats: {
      rounds_played: 5,
      avg_score: 74.2,
      avg_putts: null,
      fairway_pct: null,
      gir_pct: null,
      best_score: null,
      recent_trend: 'improving',
    },
    activeCount: 1,
    completedCount: 0,
  };
}

describe('RosterPlayerCard — always-visible, non-table tap targets', () => {
  it('renders identity, avg score and trend, plus Add focus area / View genome as real buttons', () => {
    render(
      <RosterPlayerCard
        row={makeRow()}
        muted={false}
        onOpenAreas={vi.fn()}
        onAddFocusArea={vi.fn()}
        onViewGenome={vi.fn()}
      />,
    );

    // The Avatar's own sr-only fallback text also matches "Jordan Lee" —
    // assert at least one visible instance rather than picking one query.
    expect(screen.getAllByText('Jordan Lee').length).toBeGreaterThan(0);
    expect(screen.getByText('74.2')).toBeInTheDocument();

    const addButton = screen.getByRole('button', { name: 'Add focus area' });
    const genomeButton = screen.getByRole('button', { name: 'View genome' });

    // Real, always-present controls — not a hover-only reveal, and not a
    // descendant of a <table> (the desktop DataTable's own action column).
    expect(addButton.closest('table')).toBeNull();
    expect(genomeButton.closest('table')).toBeNull();
    // Never opacity-gated on rest — the DataTable row-action treatment this
    // replaces starts at `opacity-0` until hover/focus-within.
    expect(addButton.className).not.toMatch(/opacity-0/);
    expect(genomeButton.className).not.toMatch(/opacity-0/);
  });

  it('routes each tap target to its own handler, independent of the card body', async () => {
    const user = userEvent.setup();
    const onOpenAreas = vi.fn();
    const onAddFocusArea = vi.fn();
    const onViewGenome = vi.fn();

    render(
      <RosterPlayerCard
        row={makeRow()}
        muted={false}
        onOpenAreas={onOpenAreas}
        onAddFocusArea={onAddFocusArea}
        onViewGenome={onViewGenome}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add focus area' }));
    expect(onAddFocusArea).toHaveBeenCalledTimes(1);
    expect(onOpenAreas).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'View genome' }));
    expect(onViewGenome).toHaveBeenCalledTimes(1);
    expect(onOpenAreas).not.toHaveBeenCalled();

    // The card's identity row is its own (unlabeled) button — the FIRST button
    // in the card, ahead of the two named action buttons already asserted.
    const openAreasButton = screen.getAllByRole('button')[0]!;
    await user.click(openAreasButton);
    expect(onOpenAreas).toHaveBeenCalledTimes(1);
  });

  it('shows the "Insights muted" badge only when the player has a silent alert posture', () => {
    const { rerender } = render(
      <RosterPlayerCard
        row={makeRow()}
        muted={false}
        onOpenAreas={vi.fn()}
        onAddFocusArea={vi.fn()}
        onViewGenome={vi.fn()}
      />,
    );
    expect(screen.queryByText('Insights muted')).toBeNull();

    rerender(
      <RosterPlayerCard
        row={makeRow()}
        muted
        onOpenAreas={vi.fn()}
        onAddFocusArea={vi.fn()}
        onViewGenome={vi.fn()}
      />,
    );
    expect(screen.getByText('Insights muted')).toBeInTheDocument();
  });
});
