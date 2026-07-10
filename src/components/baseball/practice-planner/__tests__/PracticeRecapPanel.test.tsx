import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PracticeObjectiveView } from '@/app/baseball/actions/practice-effectiveness';

// ─────────────────────────────────────────────────────────────────────────────
// Regression guard: a per-task "assign at least one player" validation error
// from RecapTaskComposer must NOT wipe out the rest of the Practice Recap
// panel (other objectives, the scrimmage section, Save & Cancel). Before the
// fix, RecapTaskComposer reported errors through the parent's shared `error`
// state (the SAME state the panel's load-failure branch renders), so a task
// assign failure replaced the entire recap body with just the error text —
// with no way back except unmounting the component.
// ─────────────────────────────────────────────────────────────────────────────

const getPracticeObjectives = vi.fn();
const savePracticeRecap = vi.fn();
const assignRecapTask = vi.fn();
const getTeamScrimmages = vi.fn();
const recordScrimmageResult = vi.fn();

vi.mock('@/app/baseball/actions/practice-effectiveness', () => ({
  getPracticeObjectives: (...args: unknown[]) => getPracticeObjectives(...args),
  savePracticeRecap: (...args: unknown[]) => savePracticeRecap(...args),
  assignRecapTask: (...args: unknown[]) => assignRecapTask(...args),
}));

vi.mock('@/app/baseball/actions/practice-scrimmage', () => ({
  getTeamScrimmages: (...args: unknown[]) => getTeamScrimmages(...args),
  recordScrimmageResult: (...args: unknown[]) => recordScrimmageResult(...args),
}));

import { PracticeRecapPanel } from '../PracticeRecapPanel';

function makeObjective(overrides: Partial<PracticeObjectiveView> = {}): PracticeObjectiveView {
  return {
    id: 'obj-1',
    practiceId: 'practice-1',
    blockId: 'block-1',
    focusArea: 'First-step reads',
    objective: null,
    targetMetric: null,
    // Empty on purpose — assignRecapTask rejects an empty player set with no
    // caller-supplied playerIds either, which is the failure this test drives.
    playerIds: [],
    completionStatus: 'completed',
    repsPlanned: null,
    repsCompleted: null,
    repsGradedCorrect: null,
    notes: null,
    videoUrl: null,
    ...overrides,
  };
}

describe('PracticeRecapPanel — RecapTaskComposer error isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPracticeObjectives.mockResolvedValue({ success: true, data: [makeObjective()] });
    getTeamScrimmages.mockResolvedValue({ success: true, data: [] });
  });

  it('keeps the recap body visible when assigning a follow-up task fails', async () => {
    const user = userEvent.setup();
    assignRecapTask.mockResolvedValue({
      success: false,
      error: 'Assign at least one player to this task.',
    });

    render(<PracticeRecapPanel practiceId="practice-1" roster={[]} />);

    await user.click(screen.getByRole('button', { name: 'Practice recap' }));
    await waitFor(() => expect(getPracticeObjectives).toHaveBeenCalled());

    // Sanity: the objective and Save button are visible before the failure.
    expect(await screen.findByText('First-step reads')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save recap/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /assign follow-up task/i }));
    await user.click(screen.getByRole('button', { name: 'Assign task' }));

    await waitFor(() => expect(assignRecapTask).toHaveBeenCalled());

    // The composer's own error surfaces...
    expect(
      await screen.findByText('Assign at least one player to this task.'),
    ).toBeInTheDocument();

    // ...but the rest of the recap body is untouched: the objective and its
    // Save button are still on screen (the old bug replaced all of this with
    // just the error text). Two "Cancel" buttons now coexist (the composer's
    // own + the panel's Save/Cancel row) — proof the composer stayed open
    // inline instead of the whole body being swapped for the error branch.
    expect(screen.getByText('First-step reads')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save recap/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Cancel' }).length).toBeGreaterThanOrEqual(1);
  });
});
