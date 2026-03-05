import { describe, it, expect } from 'vitest';
import {
  shotReducer,
  computeRestoredState,
  getShotTypeFromState,
  type ShotTrackingState,
  type ShotAction,
} from '../use-shot-state-machine';
import type { PuttMissTag } from '@/lib/types/golf';
import { makeShotRecord, makeRoundHole } from '@/test/fixtures/golf-shots';

// ============================================================================
// HELPERS
// ============================================================================

function makeInitialState(overrides: Partial<ShotTrackingState> = {}): ShotTrackingState {
  return {
    currentShot: 1,
    shotHistory: [],
    distanceToHole: 400,
    distanceUnit: 'yards',
    currentLie: 'tee',
    holeYardage: 400,
    usedDriver: null,
    resultOfShot: null,
    missDirection: null,
    puttBreak: null,
    puttSlope: null,
    puttMissTags: [],
    approachMissDirection: null,
    approachMissLieType: undefined,
    distanceAfterShot: '',
    distanceAfterUnit: 'yards',
    autoSaveStatus: 'idle',
    showPenaltyModal: false,
    penaltyType: null,
    showUndoConfirm: false,
    undoSaving: false,
    editingShot: null,
    showEditModal: false,
    showDeleteConfirm: false,
    editFormData: null,
    editSaving: false,
    editError: null,
    selectedShotNumber: null,
    pendingSaveCount: 0,
    autoSaveRetryAttempt: 0,
    undoError: null,
    ...overrides,
  };
}

// ============================================================================
// computeRestoredState
// ============================================================================

describe('computeRestoredState', () => {
  it('returns defaults for empty history', () => {
    const result = computeRestoredState([], 450);
    expect(result.distanceToHole).toBe(450);
    expect(result.distanceUnit).toBe('yards');
    expect(result.currentLie).toBe('tee');
    expect(result.distanceAfterUnit).toBe('yards');
  });

  it('restores state from last shot on green', () => {
    const history = [
      makeShotRecord({
        result: 'green',
        distanceToHoleAfter: 15,
        distanceUnitAfter: 'feet',
      }),
    ];
    const result = computeRestoredState(history, 400);
    expect(result.distanceToHole).toBe(15);
    expect(result.distanceUnit).toBe('feet');
    expect(result.currentLie).toBe('green');
    expect(result.distanceAfterUnit).toBe('feet');
  });

  it('restores state from last shot on fairway', () => {
    const history = [
      makeShotRecord({
        result: 'fairway',
        distanceToHoleAfter: 150,
        distanceUnitAfter: 'yards',
      }),
    ];
    const result = computeRestoredState(history, 400);
    expect(result.distanceToHole).toBe(150);
    expect(result.distanceUnit).toBe('yards');
    expect(result.currentLie).toBe('fairway');
    expect(result.distanceAfterUnit).toBe('yards');
  });

  it('uses last shot in multi-shot history', () => {
    const history = [
      makeShotRecord({ shotNumber: 1, result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards' }),
      makeShotRecord({ shotNumber: 2, result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet' }),
    ];
    const result = computeRestoredState(history, 400);
    expect(result.distanceToHole).toBe(20);
    expect(result.currentLie).toBe('green');
  });
});

// ============================================================================
// getShotTypeFromState
// ============================================================================

describe('getShotTypeFromState', () => {
  it('returns putting when on green', () => {
    const state = makeInitialState({ currentLie: 'green', distanceToHole: 20, distanceUnit: 'feet' });
    expect(getShotTypeFromState(state, makeRoundHole({ par: 4 }))).toBe('putting');
  });

  it('returns tee for shot 1 on par 4', () => {
    const state = makeInitialState({ currentShot: 1, currentLie: 'tee' });
    expect(getShotTypeFromState(state, makeRoundHole({ par: 4 }))).toBe('tee');
  });

  it('returns tee for shot 1 on par 5', () => {
    const state = makeInitialState({ currentShot: 1, currentLie: 'tee' });
    expect(getShotTypeFromState(state, makeRoundHole({ par: 5 }))).toBe('tee');
  });

  it('returns approach for shot 1 on par 3', () => {
    const state = makeInitialState({ currentShot: 1, currentLie: 'tee' });
    expect(getShotTypeFromState(state, makeRoundHole({ par: 3 }))).toBe('approach');
  });

  it('returns around_green when <= 30 yards', () => {
    const state = makeInitialState({ currentShot: 3, currentLie: 'rough', distanceToHole: 25, distanceUnit: 'yards' });
    expect(getShotTypeFromState(state, makeRoundHole({ par: 4 }))).toBe('around_green');
  });

  it('returns around_green when distance in feet converts to <= 30 yards', () => {
    const state = makeInitialState({ currentShot: 3, currentLie: 'rough', distanceToHole: 60, distanceUnit: 'feet' });
    // 60 feet / 3 = 20 yards → around_green
    expect(getShotTypeFromState(state, makeRoundHole({ par: 4 }))).toBe('around_green');
  });

  it('returns approach for shot 2+ when > 30 yards', () => {
    const state = makeInitialState({ currentShot: 2, currentLie: 'fairway', distanceToHole: 150, distanceUnit: 'yards' });
    expect(getShotTypeFromState(state, makeRoundHole({ par: 4 }))).toBe('approach');
  });

  it('returns putting when on green regardless of hole', () => {
    const state = makeInitialState({ currentLie: 'green', currentShot: 1 });
    expect(getShotTypeFromState(state, makeRoundHole({ par: 3 }))).toBe('putting');
  });
});

// ============================================================================
// shotReducer
// ============================================================================

describe('shotReducer', () => {
  describe('RESET_FOR_HOLE_CHANGE', () => {
    it('resets to fresh hole state', () => {
      const state = makeInitialState({ currentShot: 5, shotHistory: [makeShotRecord()] });
      const action: ShotAction = {
        type: 'RESET_FOR_HOLE_CHANGE',
        payload: { initialShots: [], initialShotNumber: 1, holeYardage: 450 },
      };
      const next = shotReducer(state, action);
      expect(next.currentShot).toBe(1);
      expect(next.shotHistory).toEqual([]);
      expect(next.distanceToHole).toBe(450);
      expect(next.holeYardage).toBe(450);
      expect(next.currentLie).toBe('tee');
      expect(next.distanceUnit).toBe('yards');
    });

    it('restores from existing shots', () => {
      const existingShots = [
        makeShotRecord({ shotNumber: 1, result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards' }),
        makeShotRecord({ shotNumber: 2, result: 'green', distanceToHoleAfter: 20, distanceUnitAfter: 'feet' }),
      ];
      const action: ShotAction = {
        type: 'RESET_FOR_HOLE_CHANGE',
        payload: { initialShots: existingShots, initialShotNumber: 3, holeYardage: 400 },
      };
      const next = shotReducer(makeInitialState(), action);
      expect(next.currentShot).toBe(3);
      expect(next.shotHistory).toEqual(existingShots);
      expect(next.distanceToHole).toBe(20);
      expect(next.currentLie).toBe('green');
      expect(next.distanceAfterUnit).toBe('feet');
    });

    it('clears input state on reset', () => {
      const state = makeInitialState({
        resultOfShot: 'fairway',
        missDirection: 'left',
        usedDriver: true,
      });
      const action: ShotAction = {
        type: 'RESET_FOR_HOLE_CHANGE',
        payload: { initialShots: [], initialShotNumber: 1, holeYardage: 400 },
      };
      const next = shotReducer(state, action);
      expect(next.resultOfShot).toBeNull();
      expect(next.missDirection).toBeNull();
      expect(next.usedDriver).toBeNull();
    });
  });

  describe('RECORD_SHOT', () => {
    it('appends shot to history', () => {
      const shot = makeShotRecord({ shotNumber: 1 });
      const action: ShotAction = {
        type: 'RECORD_SHOT',
        payload: { shot, isHoleComplete: false },
      };
      const next = shotReducer(makeInitialState(), action);
      expect(next.shotHistory).toHaveLength(1);
      expect(next.shotHistory[0]).toEqual(shot);
    });

    it('preserves existing history', () => {
      const existing = makeShotRecord({ shotNumber: 1 });
      const newShot = makeShotRecord({ shotNumber: 2 });
      const state = makeInitialState({ shotHistory: [existing] });
      const action: ShotAction = {
        type: 'RECORD_SHOT',
        payload: { shot: newShot, isHoleComplete: false },
      };
      const next = shotReducer(state, action);
      expect(next.shotHistory).toHaveLength(2);
    });
  });

  describe('UPDATE_AFTER_SHOT', () => {
    it('updates position and increments shot', () => {
      const state = makeInitialState({ currentShot: 1 });
      const action: ShotAction = {
        type: 'UPDATE_AFTER_SHOT',
        payload: { distanceAfter: 150, unitAfter: 'yards', newLie: 'fairway' },
      };
      const next = shotReducer(state, action);
      expect(next.currentShot).toBe(2);
      expect(next.distanceToHole).toBe(150);
      expect(next.distanceUnit).toBe('yards');
      expect(next.currentLie).toBe('fairway');
    });

    it('sets feet distance unit when landing on green', () => {
      const action: ShotAction = {
        type: 'UPDATE_AFTER_SHOT',
        payload: { distanceAfter: 20, unitAfter: 'feet', newLie: 'green' },
      };
      const next = shotReducer(makeInitialState(), action);
      expect(next.distanceAfterUnit).toBe('feet');
    });

    it('clears input state', () => {
      const state = makeInitialState({ resultOfShot: 'fairway', missDirection: 'left' });
      const action: ShotAction = {
        type: 'UPDATE_AFTER_SHOT',
        payload: { distanceAfter: 150, unitAfter: 'yards', newLie: 'fairway' },
      };
      const next = shotReducer(state, action);
      expect(next.resultOfShot).toBeNull();
      expect(next.missDirection).toBeNull();
    });
  });

  describe('Input setters', () => {
    it('SET_RESULT updates resultOfShot', () => {
      const next = shotReducer(makeInitialState(), { type: 'SET_RESULT', payload: 'fairway' });
      expect(next.resultOfShot).toBe('fairway');
    });

    it('SET_DRIVER updates usedDriver', () => {
      const next = shotReducer(makeInitialState(), { type: 'SET_DRIVER', payload: true });
      expect(next.usedDriver).toBe(true);
    });

    it('SET_MISS_DIRECTION updates missDirection', () => {
      const next = shotReducer(makeInitialState(), { type: 'SET_MISS_DIRECTION', payload: 'left' });
      expect(next.missDirection).toBe('left');
    });

    it('SET_PUTT_BREAK updates puttBreak', () => {
      const next = shotReducer(makeInitialState(), { type: 'SET_PUTT_BREAK', payload: 'left_to_right' });
      expect(next.puttBreak).toBe('left_to_right');
    });

    it('SET_PUTT_SLOPE updates puttSlope', () => {
      const next = shotReducer(makeInitialState(), { type: 'SET_PUTT_SLOPE', payload: 'uphill' });
      expect(next.puttSlope).toBe('uphill');
    });

    it('SET_PUTT_MISS_TAGS updates puttMissTags', () => {
      const next = shotReducer(makeInitialState(), { type: 'SET_PUTT_MISS_TAGS', payload: ['low', 'short'] });
      expect(next.puttMissTags).toEqual(['low', 'short']);
    });

    it('SET_APPROACH_MISS updates approach miss fields', () => {
      const next = shotReducer(makeInitialState(), {
        type: 'SET_APPROACH_MISS',
        payload: { direction: 'short_left', lieType: 'bunker' },
      });
      expect(next.approachMissDirection).toBe('short_left');
      expect(next.approachMissLieType).toBe('bunker');
    });

    it('SET_DISTANCE_AFTER updates distanceAfterShot', () => {
      const next = shotReducer(makeInitialState(), { type: 'SET_DISTANCE_AFTER', payload: '150' });
      expect(next.distanceAfterShot).toBe('150');
    });

    it('SET_DISTANCE_AFTER_UNIT updates distanceAfterUnit', () => {
      const next = shotReducer(makeInitialState(), { type: 'SET_DISTANCE_AFTER_UNIT', payload: 'feet' });
      expect(next.distanceAfterUnit).toBe('feet');
    });
  });

  describe('Auto-save', () => {
    it('SET_AUTO_SAVE_STATUS updates autoSaveStatus', () => {
      const next = shotReducer(makeInitialState(), { type: 'SET_AUTO_SAVE_STATUS', payload: 'saving' });
      expect(next.autoSaveStatus).toBe('saving');
    });
  });

  describe('Penalty workflow', () => {
    it('SHOW_PENALTY_MODAL opens modal', () => {
      const next = shotReducer(makeInitialState(), { type: 'SHOW_PENALTY_MODAL' });
      expect(next.showPenaltyModal).toBe(true);
    });

    it('SET_PENALTY_TYPE updates penalty type', () => {
      const next = shotReducer(makeInitialState(), { type: 'SET_PENALTY_TYPE', payload: 'ob' });
      expect(next.penaltyType).toBe('ob');
    });

    it('CONFIRM_PENALTY adds shot, increments, closes modal', () => {
      const state = makeInitialState({ showPenaltyModal: true, penaltyType: 'ob', currentShot: 2 });
      const penaltyShot = makeShotRecord({ shotNumber: 2, isPenalty: true, result: 'penalty' });
      const next = shotReducer(state, { type: 'CONFIRM_PENALTY', payload: penaltyShot });
      expect(next.shotHistory).toHaveLength(1);
      expect(next.currentShot).toBe(3);
      expect(next.showPenaltyModal).toBe(false);
      expect(next.penaltyType).toBeNull();
    });

    it('CLOSE_PENALTY_MODAL closes modal and clears type', () => {
      const state = makeInitialState({ showPenaltyModal: true, penaltyType: 'water' });
      const next = shotReducer(state, { type: 'CLOSE_PENALTY_MODAL' });
      expect(next.showPenaltyModal).toBe(false);
      expect(next.penaltyType).toBeNull();
    });
  });

  describe('Undo workflow', () => {
    it('SHOW_UNDO_CONFIRM opens confirmation', () => {
      const next = shotReducer(makeInitialState(), { type: 'SHOW_UNDO_CONFIRM' });
      expect(next.showUndoConfirm).toBe(true);
    });

    it('HIDE_UNDO_CONFIRM hides confirmation', () => {
      const state = makeInitialState({ showUndoConfirm: true });
      const next = shotReducer(state, { type: 'HIDE_UNDO_CONFIRM' });
      expect(next.showUndoConfirm).toBe(false);
    });

    it('UNDO_START sets saving state', () => {
      const next = shotReducer(makeInitialState(), { type: 'UNDO_START' });
      expect(next.undoSaving).toBe(true);
    });

    it('UNDO_COMPLETE restores state from shortened history', () => {
      const shot1 = makeShotRecord({
        shotNumber: 1, result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards',
      });
      const state = makeInitialState({
        shotHistory: [shot1, makeShotRecord({ shotNumber: 2 })],
        currentShot: 3,
        undoSaving: true,
        showUndoConfirm: true,
      });
      const next = shotReducer(state, {
        type: 'UNDO_COMPLETE',
        payload: { newHistory: [shot1] },
      });
      expect(next.shotHistory).toHaveLength(1);
      expect(next.currentShot).toBe(2);
      expect(next.distanceToHole).toBe(150);
      expect(next.currentLie).toBe('fairway');
      expect(next.undoSaving).toBe(false);
      expect(next.showUndoConfirm).toBe(false);
    });

    it('UNDO_COMPLETE with empty history resets to tee', () => {
      const state = makeInitialState({
        shotHistory: [makeShotRecord()],
        currentShot: 2,
        holeYardage: 400,
      });
      const next = shotReducer(state, {
        type: 'UNDO_COMPLETE',
        payload: { newHistory: [] },
      });
      expect(next.shotHistory).toHaveLength(0);
      expect(next.currentShot).toBe(1);
      expect(next.distanceToHole).toBe(400);
      expect(next.currentLie).toBe('tee');
    });

    it('UNDO_FAIL resets saving state', () => {
      const state = makeInitialState({ undoSaving: true });
      const next = shotReducer(state, { type: 'UNDO_FAIL' });
      expect(next.undoSaving).toBe(false);
    });
  });

  describe('Edit workflow', () => {
    it('OPEN_EDIT_MODAL sets editing state', () => {
      const shot = makeShotRecord({ shotNumber: 2 });
      const formData = {
        clubType: 'non_driver' as const,
        lieBefore: 'fairway' as const,
        result: 'green' as const,
        distanceToHoleBefore: '150',
        distanceUnitBefore: 'yards' as const,
        distanceToHoleAfter: '20',
        distanceUnitAfter: 'feet' as const,
        missDirection: null,
        puttBreak: null,
        puttSlope: null,
        isPenalty: false,
        penaltyType: null,
        puttMissTags: [] as PuttMissTag[],
        approachMissDirection: null,
        approachMissLieType: undefined,
      };
      const next = shotReducer(makeInitialState(), {
        type: 'OPEN_EDIT_MODAL',
        payload: { shot, formData },
      });
      expect(next.editingShot).toEqual(shot);
      expect(next.showEditModal).toBe(true);
      expect(next.editError).toBeNull();
    });

    it('CLOSE_EDIT_MODAL resets editing state', () => {
      const state = makeInitialState({ showEditModal: true, editingShot: makeShotRecord() });
      const next = shotReducer(state, { type: 'CLOSE_EDIT_MODAL' });
      expect(next.showEditModal).toBe(false);
      expect(next.editingShot).toBeNull();
      expect(next.editFormData).toBeNull();
    });

    it('EDIT_SAVE_START sets saving flag', () => {
      const next = shotReducer(makeInitialState(), { type: 'EDIT_SAVE_START' });
      expect(next.editSaving).toBe(true);
      expect(next.editError).toBeNull();
    });

    it('EDIT_SAVE_COMPLETE updates history and closes modal', () => {
      const updatedShot = makeShotRecord({ shotNumber: 1, result: 'green' });
      const state = makeInitialState({
        showEditModal: true,
        editSaving: true,
        editingShot: makeShotRecord({ shotNumber: 1, result: 'fairway' }),
      });
      const next = shotReducer(state, {
        type: 'EDIT_SAVE_COMPLETE',
        payload: { updatedHistory: [updatedShot] },
      });
      expect(next.shotHistory).toEqual([updatedShot]);
      expect(next.showEditModal).toBe(false);
      expect(next.editSaving).toBe(false);
    });

    it('EDIT_SAVE_ERROR sets error message', () => {
      const state = makeInitialState({ editSaving: true });
      const next = shotReducer(state, { type: 'EDIT_SAVE_ERROR', payload: 'Failed to save' });
      expect(next.editError).toBe('Failed to save');
      expect(next.editSaving).toBe(false);
    });

    it('DELETE_COMPLETE updates history and restores state', () => {
      const remaining = makeShotRecord({
        shotNumber: 1, result: 'fairway', distanceToHoleAfter: 150, distanceUnitAfter: 'yards',
      });
      const state = makeInitialState({
        shotHistory: [remaining, makeShotRecord({ shotNumber: 2 })],
        currentShot: 3,
      });
      const next = shotReducer(state, {
        type: 'DELETE_COMPLETE',
        payload: { newHistory: [remaining] },
      });
      expect(next.shotHistory).toHaveLength(1);
      expect(next.currentShot).toBe(2);
      expect(next.distanceToHole).toBe(150);
      expect(next.currentLie).toBe('fairway');
    });
  });

  describe('SELECT_SHOT', () => {
    it('sets selected shot number', () => {
      const next = shotReducer(makeInitialState(), { type: 'SELECT_SHOT', payload: 3 });
      expect(next.selectedShotNumber).toBe(3);
    });

    it('clears selected shot', () => {
      const state = makeInitialState({ selectedShotNumber: 3 });
      const next = shotReducer(state, { type: 'SELECT_SHOT', payload: null });
      expect(next.selectedShotNumber).toBeNull();
    });
  });

  describe('HANDLE_RESULT_SELECT', () => {
    it('sets resultOfShot from payload', () => {
      const next = shotReducer(makeInitialState(), {
        type: 'HANDLE_RESULT_SELECT',
        payload: { result: 'fairway', isTeeShot: true, isPutting: false, isApproachOrAroundGreen: false },
      });
      expect(next.resultOfShot).toBe('fairway');
    });

    it('clears miss directions when result is hole', () => {
      const state = makeInitialState({
        missDirection: 'left',
        approachMissDirection: 'short_left',
        approachMissLieType: 'bunker',
        puttMissTags: ['low'],
      });
      const next = shotReducer(state, {
        type: 'HANDLE_RESULT_SELECT',
        payload: { result: 'hole', isTeeShot: false, isPutting: true, isApproachOrAroundGreen: false },
      });
      expect(next.resultOfShot).toBe('hole');
      expect(next.missDirection).toBeNull();
      expect(next.approachMissDirection).toBeNull();
      expect(next.approachMissLieType).toBeUndefined();
      expect(next.puttMissTags).toEqual([]);
    });

    it('clears miss directions when result is green', () => {
      const state = makeInitialState({
        missDirection: 'right',
        approachMissDirection: 'long_right',
        puttMissTags: ['short'],
      });
      const next = shotReducer(state, {
        type: 'HANDLE_RESULT_SELECT',
        payload: { result: 'green', isTeeShot: false, isPutting: false, isApproachOrAroundGreen: true },
      });
      expect(next.resultOfShot).toBe('green');
      expect(next.missDirection).toBeNull();
      expect(next.approachMissDirection).toBeNull();
      expect(next.puttMissTags).toEqual([]);
    });

    it('clears approach and putt miss data for tee shots', () => {
      const state = makeInitialState({
        approachMissDirection: 'short',
        puttMissTags: ['low'],
      });
      const next = shotReducer(state, {
        type: 'HANDLE_RESULT_SELECT',
        payload: { result: 'rough', isTeeShot: true, isPutting: false, isApproachOrAroundGreen: false },
      });
      expect(next.resultOfShot).toBe('rough');
      expect(next.approachMissDirection).toBeNull();
      expect(next.approachMissLieType).toBeUndefined();
      expect(next.puttMissTags).toEqual([]);
    });

    it('clears tee miss direction and approach miss for putting', () => {
      const state = makeInitialState({
        missDirection: 'left',
        approachMissDirection: 'short_right',
      });
      const next = shotReducer(state, {
        type: 'HANDLE_RESULT_SELECT',
        payload: { result: 'green', isTeeShot: false, isPutting: true, isApproachOrAroundGreen: false },
      });
      // 'green' result clears everything
      expect(next.missDirection).toBeNull();
      expect(next.approachMissDirection).toBeNull();
    });

    it('derives approachMissLieType from result for approach shots', () => {
      const next = shotReducer(makeInitialState(), {
        type: 'HANDLE_RESULT_SELECT',
        payload: { result: 'sand', isTeeShot: false, isPutting: false, isApproachOrAroundGreen: true },
      });
      expect(next.approachMissLieType).toBe('bunker');
      expect(next.missDirection).toBeNull();
      expect(next.puttMissTags).toEqual([]);
    });

    it('derives rough lie type for approach miss to rough', () => {
      const next = shotReducer(makeInitialState(), {
        type: 'HANDLE_RESULT_SELECT',
        payload: { result: 'rough', isTeeShot: false, isPutting: false, isApproachOrAroundGreen: true },
      });
      expect(next.approachMissLieType).toBe('rough');
    });

    it('derives fairway lie type for approach miss to fairway', () => {
      const next = shotReducer(makeInitialState(), {
        type: 'HANDLE_RESULT_SELECT',
        payload: { result: 'fairway', isTeeShot: false, isPutting: false, isApproachOrAroundGreen: true },
      });
      expect(next.approachMissLieType).toBe('fairway');
    });

    it('clears distanceAfterShot when result changes', () => {
      const state = makeInitialState({ distanceAfterShot: '150' });
      const next = shotReducer(state, {
        type: 'HANDLE_RESULT_SELECT',
        payload: { result: 'rough', isTeeShot: true, isPutting: false, isApproachOrAroundGreen: false },
      });
      expect(next.distanceAfterShot).toBe('');
    });
  });

  describe('CLEAR_INPUT_STATE', () => {
    it('resets all input fields to defaults', () => {
      const state = makeInitialState({
        usedDriver: true,
        resultOfShot: 'fairway',
        missDirection: 'left',
        puttBreak: 'left_to_right',
        puttSlope: 'uphill',
        puttMissTags: ['low', 'short'],
        approachMissDirection: 'short_left',
        approachMissLieType: 'bunker',
        distanceAfterShot: '150',
      });
      const next = shotReducer(state, { type: 'CLEAR_INPUT_STATE' });
      expect(next.usedDriver).toBeNull();
      expect(next.resultOfShot).toBeNull();
      expect(next.missDirection).toBeNull();
      expect(next.puttBreak).toBeNull();
      expect(next.puttSlope).toBeNull();
      expect(next.puttMissTags).toEqual([]);
      expect(next.approachMissDirection).toBeNull();
      expect(next.approachMissLieType).toBeUndefined();
      expect(next.distanceAfterShot).toBe('');
    });

    it('preserves shot history and position state', () => {
      const shots = [makeShotRecord({ shotNumber: 1 }), makeShotRecord({ shotNumber: 2 })];
      const state = makeInitialState({
        shotHistory: shots,
        currentShot: 3,
        distanceToHole: 150,
        distanceUnit: 'yards',
        currentLie: 'fairway',
        holeYardage: 400,
        resultOfShot: 'green',
      });
      const next = shotReducer(state, { type: 'CLEAR_INPUT_STATE' });
      expect(next.shotHistory).toEqual(shots);
      expect(next.currentShot).toBe(3);
      expect(next.distanceToHole).toBe(150);
      expect(next.distanceUnit).toBe('yards');
      expect(next.currentLie).toBe('fairway');
      expect(next.holeYardage).toBe(400);
    });

    it('overrides distanceAfterUnit when provided in payload', () => {
      const state = makeInitialState({ distanceAfterUnit: 'yards' });
      const next = shotReducer(state, {
        type: 'CLEAR_INPUT_STATE',
        payload: { distanceAfterUnit: 'feet' },
      });
      expect(next.distanceAfterUnit).toBe('feet');
    });

    it('preserves existing distanceAfterUnit when no payload', () => {
      const state = makeInitialState({ distanceAfterUnit: 'feet' });
      const next = shotReducer(state, { type: 'CLEAR_INPUT_STATE' });
      expect(next.distanceAfterUnit).toBe('feet');
    });
  });
});
