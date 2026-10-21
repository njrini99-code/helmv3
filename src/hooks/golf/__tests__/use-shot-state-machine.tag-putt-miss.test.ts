/**
 * TAG_PUTT_MISS (CoachHelm Slice 8a, the one-tap data-gap prompt): sets a
 * recorded putt's miss tags exactly as handleNextShot writes them and leaves
 * everything else, including the next shot's in-progress input, alone.
 */
import { describe, expect, it } from 'vitest';
import { shotReducer, tagPuttMiss, type ShotTrackingState } from '../use-shot-state-machine';
import type { ShotRecord } from '@/lib/types/golf';

const approach: ShotRecord = {
  shotNumber: 1,
  shotType: 'approach',
  clubType: 'non_driver',
  lieBefore: 'tee',
  distanceToHoleBefore: 150,
  distanceUnitBefore: 'yards',
  result: 'green',
  distanceToHoleAfter: 7,
  distanceUnitAfter: 'feet',
  shotDistance: 148,
  isPenalty: false,
};
const putt: ShotRecord = {
  ...approach,
  shotNumber: 2,
  shotType: 'putting',
  clubType: 'putter',
  lieBefore: 'green',
  distanceToHoleBefore: 7,
  distanceUnitBefore: 'feet',
  distanceToHoleAfter: 1,
  shotDistance: 2,
};

describe('tagPuttMiss', () => {
  it('sets puttMissTags and missDirection (joined with _) on that putt only', () => {
    const out = tagPuttMiss([approach, putt], 2, ['short']);
    expect(out[1]).toEqual({ ...putt, puttMissTags: ['short'], missDirection: 'short' });
    expect(out[0]).toBe(approach);
    expect(tagPuttMiss([approach, putt], 2, ['low', 'short'])[1]!.missDirection).toBe('low_short');
  });

  it('changes nothing for a missing shot, a non-putt, a penalty or no tags', () => {
    const history = [approach, putt];
    expect(tagPuttMiss(history, 9, ['short'])).toBe(history);
    expect(tagPuttMiss(history, 1, ['short'])).toBe(history);
    expect(tagPuttMiss([{ ...putt, isPenalty: true }], 2, ['short'])).toEqual([{ ...putt, isPenalty: true }]);
    expect(tagPuttMiss(history, 2, [])).toBe(history);
  });
});

function stateWith(shotHistory: ShotRecord[]): ShotTrackingState {
  return {
    currentShot: shotHistory.length + 1,
    shotHistory,
    distanceToHole: 1,
    distanceUnit: 'feet',
    currentLie: 'green',
    holeYardage: 150,
    usedDriver: null,
    resultOfShot: null,
    missDirection: null,
    puttBreak: null,
    puttSlope: null,
    puttMissTags: [],
    approachMissDirection: null,
    approachMissLieType: undefined,
    distanceAfterShot: '',
    distanceAfterUnit: 'feet',
    autoSaveStatus: 'idle',
    autoSaveHeldOnDevice: false,
    autoSaveSyncing: false,
    showPenaltyModal: false,
    penaltyType: null,
    penaltyOrigin: 'here',
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
  };
}

describe('shotReducer TAG_PUTT_MISS', () => {
  it('keeps the next shot input that is being entered', () => {
    let state = stateWith([approach, putt]);
    state = shotReducer(state, { type: 'SET_RESULT', payload: 'hole' });
    state = shotReducer(state, { type: 'SET_PUTT_SLOPE', payload: 'downhill' });
    const next = shotReducer(state, { type: 'TAG_PUTT_MISS', payload: { shotNumber: 2, tags: ['long'] } });
    expect(next.shotHistory[1]).toMatchObject({ missDirection: 'long', puttMissTags: ['long'] });
    expect(next.resultOfShot).toBe('hole');
    expect(next.puttSlope).toBe('downhill');
    expect(next.currentShot).toBe(state.currentShot);
    expect({ ...next, shotHistory: state.shotHistory }).toEqual(state);
  });

  it('a stale tag (the putt was undone) returns the same state', () => {
    const state = stateWith([approach]);
    expect(shotReducer(state, { type: 'TAG_PUTT_MISS', payload: { shotNumber: 2, tags: ['long'] } })).toBe(state);
  });
});
