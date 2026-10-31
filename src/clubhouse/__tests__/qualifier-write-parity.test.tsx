import { LazyMotion, domAnimation } from 'motion/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Qualifier writes, Clubhouse against production (P009, 2026-10-17 parity pass): each Clubhouse write calls the same
 * shared action Fairway calls, with the same arguments, and every refusal those actions give is told in words that
 * fit it. The actions are mocked at their module, so these tests read the payloads Clubhouse hands them.
 */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('@/hooks/golf/use-appearance-preferences', () => ({ useAppearancePreferences: () => ({ showAnimations: true, updatePreferences: vi.fn() }) }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const actions = vi.hoisted(() => ({
  createGolfQualifier: vi.fn(),
  updateGolfQualifierDetails: vi.fn(),
  setQualifierRoundCourses: vi.fn(),
  updateQualifierStatus: vi.fn(),
  setQualifierEntrants: vi.fn(),
  setQualifierSquadSize: vi.fn(),
  advanceSelectionState: vi.fn(),
  confirmQualifierSelection: vi.fn(),
  chooseQualifierTiePlace: vi.fn(),
  setQualifierCoachPick: vi.fn(),
  removeQualifierCoachPick: vi.fn(),
}));
vi.mock('@/app/golf/actions/qualifier-actions', () => ({
  createGolfQualifier: actions.createGolfQualifier,
  updateGolfQualifierDetails: actions.updateGolfQualifierDetails,
  setQualifierRoundCourses: actions.setQualifierRoundCourses,
  updateQualifierStatus: actions.updateQualifierStatus,
}));
vi.mock('@/app/golf/actions/qualifier-setup', () => ({ setQualifierEntrants: actions.setQualifierEntrants, setQualifierSquadSize: actions.setQualifierSquadSize }));
vi.mock('@/app/golf/actions/v3/qualifying', () => ({
  advanceSelectionState: actions.advanceSelectionState,
  confirmQualifierSelection: actions.confirmQualifierSelection,
  chooseQualifierTiePlace: actions.chooseQualifierTiePlace,
  setQualifierCoachPick: actions.setQualifierCoachPick,
  removeQualifierCoachPick: actions.removeQualifierCoachPick,
}));
vi.mock('@/app/golf/actions/course-library', () => ({ getCourseDetail: vi.fn(), getTeamSavedCourses: vi.fn(async () => []), listCoursesStrict: vi.fn(async () => []) }));

import { keptDeadline, QualifierForm } from '../screens/qualifiers/QualifierForm';
import { LIVE_SELECTION_WRITES, LIVE_WRITES, selectionReason, type ChQWrites } from '../screens/qualifiers/writes';
import { previewEditForm } from '../preview/fixtures-qualifiers';
import { ToastProvider } from '../ui/Toast';

const wrap = (node: ReactNode) =>
  render(
    <LazyMotion features={domAnimation}>
      <ToastProvider>
        <div className="ch-root" data-ui="clubhouse">
          {node}
        </div>
      </ToastProvider>
    </LazyMotion>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  for (const f of Object.values(actions)) f.mockResolvedValue({ success: true, ok: true, data: undefined });
});

describe('the live writes call the shared actions Fairway calls, unchanged', () => {
  it('create, close and reopen pass straight through (FairwayNewQualifier, FairwayQualifyingWorkspace)', async () => {
    actions.createGolfQualifier.mockResolvedValue({ success: true, data: { qualifierId: 'q-new' } });
    const input = { name: 'Q', startDate: '2026-10-19', playerIds: ['p1'], numRounds: 2, selectionSlotsTotal: 5, selectionSlotsCoachPick: 1 };
    await expect(LIVE_WRITES.create(input)).resolves.toEqual({ success: true, data: { qualifierId: 'q-new' } });
    expect(actions.createGolfQualifier).toHaveBeenCalledWith(input);
    await LIVE_WRITES.setStatus('q1', 'completed');
    await LIVE_WRITES.setStatus('q1', 'in_progress');
    // Reopen is in_progress, never upcoming: the workspace's Reopen does the same.
    expect(actions.updateQualifierStatus.mock.calls).toEqual([
      ['q1', 'completed'],
      ['q1', 'in_progress'],
    ]);
  });

  it('an edit runs details, then rounds and courses, then the held squad and entrant writes, each with the form’s values', async () => {
    const plan = {
      details: { name: 'Q', entryDeadline: null, startDate: '2026-10-19' },
      numRounds: 3,
      roundCourses: [{ roundNumber: 1, courseId: 'c1', courseName: 'Finley GC', teeId: 't1' }],
      squad: { total: 6, coachPicks: 2 },
      playerIds: ['p1', 'p2'],
    };
    const order: string[] = [];
    actions.updateGolfQualifierDetails.mockImplementation(async () => (order.push('details'), { success: true }));
    actions.setQualifierRoundCourses.mockImplementation(async () => (order.push('rounds'), { success: true }));
    actions.setQualifierSquadSize.mockImplementation(async () => (order.push('squad'), { success: true }));
    actions.setQualifierEntrants.mockImplementation(async () => (order.push('entrants'), { success: true, data: { added: 1, removed: 0 } }));
    await expect(LIVE_WRITES.saveEdit('q1', plan)).resolves.toEqual({ success: true });
    expect(order).toEqual(['details', 'rounds', 'squad', 'entrants']);
    expect(actions.updateGolfQualifierDetails).toHaveBeenCalledWith('q1', plan.details);
    expect(actions.setQualifierRoundCourses).toHaveBeenCalledWith('q1', 3, plan.roundCourses);
    expect(actions.setQualifierSquadSize).toHaveBeenCalledWith('q1', { total: 6, coachPicks: 2 });
    expect(actions.setQualifierEntrants).toHaveBeenCalledWith('q1', ['p1', 'p2']);
  });

  it('round courses that did not load are sent as none, so setQualifierRoundCourses keeps what is stored', async () => {
    await LIVE_WRITES.saveEdit('q1', { details: {}, numRounds: 2, roundCourses: null, squad: null, playerIds: null });
    expect(actions.setQualifierRoundCourses).toHaveBeenCalledWith('q1', 2, []);
    expect(actions.setQualifierSquadSize).not.toHaveBeenCalled();
    expect(actions.setQualifierEntrants).not.toHaveBeenCalled();
  });

  it('the selection writes are the CoachHelm workspace’s actions, with its arguments; no order is passed (the server decides it)', async () => {
    await LIVE_SELECTION_WRITES.advance('q1', 'scoring');
    await LIVE_SELECTION_WRITES.setPick('q1', 'p1', 'Steady in the wind');
    await LIVE_SELECTION_WRITES.removePick('q1', 'p1');
    await LIVE_SELECTION_WRITES.chooseTie('q1', 'p2', true);
    await LIVE_SELECTION_WRITES.chooseTie('q1', 'p2', false);
    expect(actions.advanceSelectionState).toHaveBeenCalledWith('q1', 'scoring');
    expect(actions.setQualifierCoachPick).toHaveBeenCalledWith('q1', 'p1', 'Steady in the wind');
    expect(actions.removeQualifierCoachPick).toHaveBeenCalledWith('q1', 'p1');
    // Owner, 2026-10-28: the server decides the tie order once (the board's), so Clubhouse calls the action exactly as
    // Fairway's workspace does, with no order of its own.
    expect(actions.chooseQualifierTiePlace.mock.calls).toEqual([
      ['q1', 'p2', true],
      ['q1', 'p2', false],
    ]);
  });

  it('confirm says when the squad committed but the players were not told (Q-116)', async () => {
    actions.confirmQualifierSelection.mockResolvedValueOnce({ ok: true, notified: false });
    await expect(LIVE_SELECTION_WRITES.confirm('q1')).resolves.toEqual({ success: true, data: { notified: false } });
    actions.confirmQualifierSelection.mockResolvedValueOnce({ ok: true });
    await expect(LIVE_SELECTION_WRITES.confirm('q1')).resolves.toEqual({ success: true, data: { notified: true } });
    // The squad confirmed is the one the board showed above the line: the server's order, not one Clubhouse passes.
    // Clubhouse sends the squad it showed only as a guard: the server refuses when the standings moved since.
    expect(actions.confirmQualifierSelection).toHaveBeenLastCalledWith('q1', undefined);
    actions.confirmQualifierSelection.mockResolvedValueOnce({ ok: false, error: 'cannot confirm: standings changed since this page loaded' });
    await expect(LIVE_SELECTION_WRITES.confirm('q1', ['p1', 'p2'])).resolves.toEqual({ success: false, error: 'A round came in since this page loaded and the squad changed. Review it, then confirm again.' });
    expect(actions.confirmQualifierSelection).toHaveBeenLastCalledWith('q1', ['p1', 'p2']);
  });
});

describe('every refusal the selection service gives has its own words (service.ts strings, verbatim)', () => {
  it.each([
    ['cannot confirm: tie at the cut, choose 2 of the level players (1 chosen)', 'Give every place at the cut to a level player before confirming.'],
    ['player is not tied at the cut', 'That player isn’t level at the cut any more. Reload to see the standings.'],
    ['all 2 places at the cut are chosen', 'Every place at the cut is given. Take one back first.'],
    ['places at the cut locked in state scoring', 'Places at the cut are given once you start selecting.'],
    ['player has no scored round in this qualifier', 'That player has no score in this qualifier yet, so they can’t be a coach’s pick.'],
    ['could not verify the player has a scored round; please try again', 'That player’s rounds couldn’t be checked just now. Try again.'],
    ['could not verify remaining coach-pick slots; please try again', 'The picks already made couldn’t be checked just now. Try again.'],
    ['could not verify the player is entered; please try again', 'The entrants couldn’t be checked just now. Try again.'],
    ['workspace not loadable', 'The squad couldn’t be read just now. Try again, or reload the page.'],
    // Unchanged ones, kept in their order: the general confirm refusal still asks for every pick.
    ['cannot confirm: state must be closed, all coach picks chosen with reasoning', 'Choose every pick, each with a reason, before confirming.'],
    ['illegal transition: the squad was already confirmed', 'The squad moved on since this page loaded. Reload to see where it stands.'],
    ['Qualifier not found', 'This qualifier couldn’t be found. It may have been deleted.'],
  ])('%s', (error, words) => {
    expect(selectionReason(error)).toBe(words);
  });

  it('a refused tie place reaches the coach in those words, and the raw refusal never does', async () => {
    actions.chooseQualifierTiePlace.mockResolvedValueOnce({ ok: false, error: 'all 1 places at the cut are chosen' });
    await expect(LIVE_SELECTION_WRITES.chooseTie('q1', 'p2', true)).resolves.toEqual({ success: false, error: 'Every place at the cut is given. Take one back first.' });
  });
});

describe('the retired entry deadline never blocks an edit (owner, 2026-10-16: no deadline field)', () => {
  it('keptDeadline keeps a stored deadline while it fits, and clears it once the start date passes it', () => {
    expect(keptDeadline({ entryDeadline: '2026-09-21', startDate: '2026-09-22' })).toBe('2026-09-21');
    expect(keptDeadline({ entryDeadline: '2026-09-22', startDate: '2026-09-22' })).toBe('2026-09-22');
    expect(keptDeadline({ entryDeadline: '2026-09-21', startDate: '2026-09-20' })).toBe('');
    expect(keptDeadline({ entryDeadline: '', startDate: '2026-09-20' })).toBe('');
  });

  const writes = (): ChQWrites & { saveEdit: ReturnType<typeof vi.fn> } => ({
    create: vi.fn(),
    saveEdit: vi.fn(async () => ({ success: true })),
    setStatus: vi.fn(),
    courses: vi.fn(async () => []),
    tees: vi.fn(async () => []),
  });

  it('moving the start before a stored deadline saves, with the deadline cleared; no hidden-field problem (CH-09104) appears', async () => {
    const user = userEvent.setup();
    const w = writes();
    wrap(<QualifierForm data={previewEditForm()} writes={w} />);
    fireEvent.change(document.getElementById('qf-start')!, { target: { value: '2026-09-15' } });
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(w.saveEdit).toHaveBeenCalled());
    expect(document.querySelector('[data-ch-code="CH-09104"]')).toBeNull();
    expect(w.saveEdit.mock.calls[0]![1].details).toMatchObject({ startDate: '2026-09-15', entryDeadline: null });
  });

  it('an untouched start keeps the stored deadline as it is', async () => {
    const user = userEvent.setup();
    const w = writes();
    wrap(<QualifierForm data={previewEditForm()} writes={w} />);
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(w.saveEdit).toHaveBeenCalled());
    expect(w.saveEdit.mock.calls[0]![1].details).toMatchObject({ startDate: '2026-09-22', entryDeadline: '2026-09-21' });
  });
});
