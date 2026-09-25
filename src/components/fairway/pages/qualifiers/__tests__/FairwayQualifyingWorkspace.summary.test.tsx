// @vitest-environment jsdom
/**
 * FairwayQualifyingWorkspace opens on one summary card: spots filled of the
 * total, a next step for the current state, and the slot bar; coach picks stay
 * closed until they unlock.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FairwayQualifyingWorkspace, countSelection, selectionTakeaway } from '../FairwayQualifyingWorkspace';
import type { QualifyingWorkspace, SelectionCandidate } from '@/lib/coachhelm/v3/qualifying/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/golf/actions/v3/qualifying', () => ({
  advanceSelectionState: vi.fn(),
  confirmQualifierSelection: vi.fn(),
  setQualifierCoachPick: vi.fn(),
  removeQualifierCoachPick: vi.fn(),
}));
vi.mock('@/app/golf/actions/golf', () => ({ updateQualifierStatus: vi.fn() }));

function cand(i: number, over: Partial<SelectionCandidate> = {}): SelectionCandidate {
  return {
    player_id: `p${i}`,
    player_first_name: `First${i}`,
    player_last_name: `Last${i}`,
    rounds_completed: 2,
    total_to_par: i,
    leaderboard_rank: i,
    is_top_score_slot: false,
    selection: null,
    ...over,
  } as SelectionCandidate;
}

function workspace(over: Partial<QualifyingWorkspace> = {}): QualifyingWorkspace {
  return {
    qualifier_id: 'q1',
    name: 'Fall Qualifier',
    status: 'in_progress',
    selection_state: 'closed',
    selection_slots_total: 5,
    selection_slots_coach_pick: 2,
    coach_picks_complete: false,
    candidates: [
      cand(1, { is_top_score_slot: true }),
      cand(2, { is_top_score_slot: true }),
      cand(3, { is_top_score_slot: true }),
      cand(4, { selection: { selection_type: 'coach_pick', coach_reasoning: 'Clutch' } as SelectionCandidate['selection'] }),
      cand(5),
      cand(6, { rounds_completed: 0, total_to_par: null, leaderboard_rank: null }),
    ],
    ...over,
  } as QualifyingWorkspace;
}

describe('countSelection / selectionTakeaway', () => {
  it('counts locked, picked and open spots', () => {
    const w = workspace();
    const c = countSelection(w.candidates, 5, 2);
    expect(c).toMatchObject({ total: 5, locked: 3, picked: 1, open: 1, entered: 6, withRounds: 5 });
    expect(selectionTakeaway('closed', c, 2)).toBe('3 locked on score. Choose 1 more coach pick, with reasoning, to confirm.');
  });

  it('says what happens next in each state', () => {
    const c = countSelection(workspace().candidates, 5, 2);
    expect(selectionTakeaway('open', c, 2)).toMatch(/^6 players entered\. The top 3 lock on score/);
    expect(selectionTakeaway('scoring', c, 2)).toBe('5 of 6 players have posted a round. Close scoring to choose coach picks.');
    expect(selectionTakeaway('selected', c, 2)).toBe('Roster committed: 4 players going.');
    expect(selectionTakeaway('open', countSelection([], 5, 2), 2)).toMatch(/^No entries yet/);
  });
});

describe('FairwayQualifyingWorkspace', () => {
  it('opens on the summary card with spots filled and the slot bar', () => {
    const { container } = render(<FairwayQualifyingWorkspace workspace={workspace()} />);
    expect(container.querySelector('[data-slot="qualifying-filled"]')).toHaveTextContent('4 / 5');
    expect(screen.getByRole('img', { name: '3 locked on score, 1 coach pick, 1 open, of 5 spots.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm selection' })).toBeDisabled();
  });

  it('keeps coach picks closed before they unlock', () => {
    render(<FairwayQualifyingWorkspace workspace={workspace({ selection_state: 'scoring' })} />);
    expect(screen.getByRole('button', { name: /Coach picks/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Confirm selection' })).toBeNull();
  });
});
