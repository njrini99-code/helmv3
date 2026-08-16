// @vitest-environment jsdom
/**
 * ============================================================================
 * FocusAreaCard — the completed row asks "How did it go?" (#1290)
 * ----------------------------------------------------------------------------
 * Production shows `outcome_status` NULL on 594 of 596 insight-linked focus
 * areas. Root cause: the outcome-capture control only ever lived on the
 * ACTIVE card and vanished the instant a coach hit "Mark complete" — the
 * exact moment a verdict is most answerable, and the last chance before the
 * card collapses into its quiet completed row forever.
 *
 * Fix under test: the completed row now ALSO offers the capture control
 * (relabelled "How did it go?") until a verdict exists, coach-only, and only
 * when a live `onRecordOutcome` handler is wired — never a dead prompt, never
 * a player-facing capture control, and never shown again once a verdict is
 * on record (the read-only "Outcome: …" pill already speaks for that case).
 * ========================================================================== */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FocusAreaCard, type FocusAreaCardData } from './FocusAreaCard';

function completedArea(overrides: Partial<FocusAreaCardData> = {}): FocusAreaCardData {
  return {
    id: 'fa-completed-1',
    area_type: 'putting',
    title: 'Tighten lag putting',
    status: 'completed',
    completed_at: '2026-08-01T00:00:00.000Z',
    target_metric: null,
    current_value: null,
    target_value: null,
    outcome_status: null,
    ...overrides,
  };
}

describe('FocusAreaCard — completed-row outcome capture (#1290)', () => {
  it('coach + no recorded verdict + onRecordOutcome wired: shows the "How did it go?" prompt with all three verdict buttons', () => {
    const onRecordOutcome = vi.fn();
    render(
      <FocusAreaCard
        focusArea={completedArea()}
        // eslint-disable-next-line jsx-a11y/aria-role -- FocusAreaCard's own coach/player prop
        role="coach"
        onRecordOutcome={onRecordOutcome}
      />,
    );

    expect(screen.getByText('How did it go?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Record outcome: Improved/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Record outcome: No change/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Record outcome: Worsened/i })).toBeInTheDocument();
  });

  it('clicking a verdict calls onRecordOutcome with the focus area and the chosen outcome', async () => {
    const user = userEvent.setup();
    const onRecordOutcome = vi.fn().mockResolvedValue({ success: true });
    const focusArea = completedArea();
    render(
      <FocusAreaCard
        focusArea={focusArea}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        onRecordOutcome={onRecordOutcome}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Record outcome: Improved/i }));
    expect(onRecordOutcome).toHaveBeenCalledWith(focusArea, 'improved');
  });

  it('never shows the prompt once a verdict is already recorded — the read-only pill speaks for it instead', () => {
    const onRecordOutcome = vi.fn();
    render(
      <FocusAreaCard
        focusArea={completedArea({ outcome_status: 'improved' })}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        onRecordOutcome={onRecordOutcome}
      />,
    );

    expect(screen.queryByText('How did it go?')).not.toBeInTheDocument();
    expect(screen.getByText(/Outcome: Improved/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Record outcome/i })).not.toBeInTheDocument();
  });

  it('never shows the prompt for a player viewer (outcome capture is coach-only)', () => {
    render(
      <FocusAreaCard
        focusArea={completedArea()}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="player"
      />,
    );

    expect(screen.queryByText('How did it go?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Record outcome/i })).not.toBeInTheDocument();
  });

  it('never shows the prompt when no onRecordOutcome handler is wired (never a dead control)', () => {
    render(
      <FocusAreaCard
        focusArea={completedArea()}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
      />,
    );

    expect(screen.queryByText('How did it go?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Record outcome/i })).not.toBeInTheDocument();
  });
});
