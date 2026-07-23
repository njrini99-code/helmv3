// @vitest-environment jsdom
/**
 * ============================================================================
 * triage/PromoteToFocusAreaButton — "Prescribe" opens a prefilled
 * FocusAreaModal, not a silent zero-field create
 * ----------------------------------------------------------------------------
 * Locks the converge-onto-FocusAreaModal fix: a single "Prescribe" click used
 * to fire `createFocusAreaFromInsight` directly with no coach input at all.
 * It must now open the shared FocusAreaModal pre-filled from the signal
 * (player, title, claim, best-effort category) so the coach can confirm or
 * edit before anything is written — and the write, when it happens, must
 * still route through `createFocusAreaFromInsight` (not the v2 sibling) so
 * the effectiveness-ledger side effects (insight acknowledge +
 * `recordInsightAction('create_focus')`, exercised in
 * src/test/golf/actions/development.test.ts) keep firing exactly as before.
 * ========================================================================== */
import { render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { GroupedSignal } from '@/lib/coachhelm/signal-grouping';

vi.mock('@/app/golf/actions/development', () => ({
  createFocusAreaFromInsight: vi.fn(),
}));

// FocusAreaModal always renders a `sourceInsightId`-driven Practice Rx
// preview when a triage-sourced signal is open; stub the drills action
// module (server-only) so the import graph stays inert.
vi.mock('@/app/golf/actions/drills', () => ({
  getDrillsForInsights: vi.fn(async () => ({})),
  getDrillsForInsight: vi.fn(async () => []),
  recordDrillView: vi.fn(),
}));

import { createFocusAreaFromInsight } from '@/app/golf/actions/development';
import { PromoteToFocusAreaButton } from '../PromoteToFocusAreaButton';

function makeSignal(overrides: Partial<GroupedSignal> = {}): GroupedSignal {
  return {
    id: 'signal-1',
    kind: 'insight',
    category: 'putting',
    severity: 'high',
    title: 'Putting leak',
    claim: 'Short putts are costing strokes.',
    ageDays: 2,
    status: 'active',
    strokeImpact: 0.8,
    playerId: 'player-1',
    supersededCount: 0,
    ...overrides,
  };
}

describe('triage PromoteToFocusAreaButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing for a pattern-kind signal (no from_pattern_id link column)', () => {
    const { container } = render(
      <PromoteToFocusAreaButton signal={makeSignal({ kind: 'pattern' })} coachId="coach-1" onPromoted={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a team-level signal (no playerId)', () => {
    const { container } = render(
      <PromoteToFocusAreaButton signal={makeSignal({ playerId: null })} coachId="coach-1" onPromoted={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('opens a FocusAreaModal pre-filled from the signal on click, instead of creating immediately', async () => {
    render(
      <PromoteToFocusAreaButton
        signal={makeSignal()}
        coachId="coach-1"
        onPromoted={vi.fn()}
        playerName="Alex Rivera"
      />,
    );

    expect(createFocusAreaFromInsight).not.toHaveBeenCalled();

    screen.getByRole('button', { name: 'Prescribe' }).click();

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByDisplayValue('Putting leak')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Short putts are costing strokes.')).toBeInTheDocument();
    // Opening the modal is not itself a write — nothing saved until confirm.
    expect(createFocusAreaFromInsight).not.toHaveBeenCalled();
  });

  it('confirms through createFocusAreaFromInsight with the (possibly edited) category threaded through as area_type, and reports success', async () => {
    vi.mocked(createFocusAreaFromInsight).mockResolvedValue({
      success: true,
      data: { focusAreaId: 'fa-1' },
    });
    const onPromoted = vi.fn();

    render(
      <PromoteToFocusAreaButton
        signal={makeSignal()}
        coachId="coach-1"
        onPromoted={onPromoted}
        playerName="Alex Rivera"
      />,
    );

    screen.getByRole('button', { name: 'Prescribe' }).click();
    const dialog = await screen.findByRole('dialog');

    within(dialog).getByRole('button', { name: 'Prescribe focus area' }).click();

    await waitFor(() => {
      expect(createFocusAreaFromInsight).toHaveBeenCalledWith(
        expect.objectContaining({
          insight_id: 'signal-1',
          player_id: 'player-1',
          coach_id: 'coach-1',
          title: 'Putting leak',
          description: 'Short putts are costing strokes.',
          insight_type: 'putting',
          area_type: 'putting',
        }),
      );
    });
    expect(onPromoted).toHaveBeenCalledTimes(1);
  });

  it('does not report success when the create call fails', async () => {
    vi.mocked(createFocusAreaFromInsight).mockResolvedValue({
      success: false,
      error: 'Not authorized to create a focus area for this player',
    });
    const onPromoted = vi.fn();

    render(
      <PromoteToFocusAreaButton signal={makeSignal()} coachId="coach-1" onPromoted={onPromoted} />,
    );

    screen.getByRole('button', { name: 'Prescribe' }).click();
    const dialog = await screen.findByRole('dialog');
    within(dialog).getByRole('button', { name: 'Prescribe focus area' }).click();

    await waitFor(() => {
      expect(createFocusAreaFromInsight).toHaveBeenCalled();
    });
    expect(onPromoted).not.toHaveBeenCalled();
  });
});
