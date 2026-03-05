import { useCallback } from 'react';
import type { ShotRecord, RoundHole } from '@/lib/types/golf';
import type { ShotTrackingState, ShotAction } from './use-shot-state-machine';

interface UsePenaltyHandlerParams {
  state: ShotTrackingState;
  dispatch: React.Dispatch<ShotAction>;
  currentHole: RoundHole;
  onSaveShot?: (shot: ShotRecord) => void;
}

export function usePenaltyHandler({
  state,
  dispatch,
  onSaveShot,
}: UsePenaltyHandlerParams) {
  const handleAddPenalty = useCallback(() => {
    dispatch({ type: 'SHOW_PENALTY_MODAL' });
  }, [dispatch]);

  const confirmPenalty = useCallback(() => {
    if (!state.penaltyType) return;
    if (state.shotHistory.some(s => s.result === 'hole')) return;

    const penaltyShot: ShotRecord = {
      shotNumber: state.currentShot,
      shotType: 'penalty',
      clubType: 'non_driver',
      lieBefore: state.currentLie,
      distanceToHoleBefore: state.distanceToHole,
      distanceUnitBefore: state.distanceUnit,
      result: 'penalty',
      distanceToHoleAfter: state.distanceToHole,
      distanceUnitAfter: state.distanceUnit,
      shotDistance: 0,
      isPenalty: true,
      penaltyType: state.penaltyType as 'ob' | 'water' | 'unplayable' | 'lost',
    };

    dispatch({ type: 'CONFIRM_PENALTY', payload: penaltyShot });
    onSaveShot?.(penaltyShot);
  }, [state.penaltyType, state.shotHistory, state.currentShot, state.currentLie, state.distanceToHole, state.distanceUnit, dispatch, onSaveShot]);

  return { handleAddPenalty, confirmPenalty };
}
