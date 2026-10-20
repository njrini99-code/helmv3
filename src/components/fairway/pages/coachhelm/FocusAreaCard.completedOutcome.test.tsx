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

/**
 * Q-86 (2026-09-30): `outcome_status` on the card data only reflects the SOURCE
 * INSIGHT. A focus area graded with no insight (or whose insight credit failed)
 * has its verdict only on its own column, so the completed row kept asking "How
 * did it go?" for an area the coach had already graded. The card now shows the
 * area's own `recordedOutcomeStatus` first.
 */
describe('FocusAreaCard — the area\'s own recorded outcome (Q-86)', () => {
  it('does not ask "How did it go?" when only the area\'s own column holds the verdict', () => {
    render(
      <FocusAreaCard
        focusArea={completedArea({ outcome_status: null, recordedOutcomeStatus: 'improved' })}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        onRecordOutcome={vi.fn()}
      />,
    );

    expect(screen.queryByText('How did it go?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Record outcome/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Outcome: Improved/i)).toBeInTheDocument();
  });

  it('shows the area\'s own verdict over the insight\'s when both exist', () => {
    render(
      <FocusAreaCard
        focusArea={completedArea({ outcome_status: 'worsened', recordedOutcomeStatus: 'no_change' })}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        onRecordOutcome={vi.fn()}
      />,
    );

    expect(screen.getByText(/Outcome: No change/i)).toBeInTheDocument();
    expect(screen.queryByText(/Outcome: Worsened/i)).not.toBeInTheDocument();
  });

  it('falls back to the insight\'s verdict when the area\'s own column is empty', () => {
    render(
      <FocusAreaCard
        focusArea={completedArea({ outcome_status: 'improved', recordedOutcomeStatus: null })}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        onRecordOutcome={vi.fn()}
      />,
    );

    expect(screen.queryByText('How did it go?')).not.toBeInTheDocument();
    expect(screen.getByText(/Outcome: Improved/i)).toBeInTheDocument();
  });

  it('an active card with its own verdict shows the read-only pill, not the capture buttons', () => {
    render(
      <FocusAreaCard
        focusArea={completedArea({
          status: 'active',
          completed_at: null,
          outcome_status: null,
          recordedOutcomeStatus: 'improved',
        })}
        // eslint-disable-next-line jsx-a11y/aria-role
        role="coach"
        onRecordOutcome={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /Record outcome/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Outcome: Improved/i)).toBeInTheDocument();
  });
});
