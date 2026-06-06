import { useReducer, useEffect, useRef } from 'react';
import type { ShotRecord, RoundHole, PuttMissTag, ApproachMissDirection } from '@/lib/types/golf';
import { lieFromShotResult, computeShotFingerprint, type LieType } from '@/lib/utils/shot-helpers';
import { logError } from '@/lib/error-logging';

// ============================================================================
// TYPES
// ============================================================================

export interface EditFormData {
  clubType: 'driver' | 'non_driver' | 'putter';
  lieBefore: LieType;
  result: ShotRecord['result'];
  distanceToHoleBefore: string;
  distanceUnitBefore: 'yards' | 'feet';
  distanceToHoleAfter: string;
  distanceUnitAfter: 'yards' | 'feet';
  missDirection: string | null;
  puttBreak: ShotRecord['puttBreak'] | null;
  puttSlope: ShotRecord['puttSlope'] | null;
  isPenalty: boolean;
  penaltyType: string | null;
  puttMissTags: PuttMissTag[];
  approachMissDirection: ApproachMissDirection | null;
  approachMissLieType: 'fairway' | 'rough' | 'bunker' | 'hazard' | undefined;
}

export interface ShotTrackingState {
  // Core shot state
  currentShot: number;
  shotHistory: ShotRecord[];
  distanceToHole: number;
  distanceUnit: 'yards' | 'feet';
  currentLie: LieType;
  holeYardage: number;
  // Shot input state
  usedDriver: boolean | null;
  resultOfShot: ShotRecord['result'] | null;
  missDirection: string | null;
  puttBreak: ShotRecord['puttBreak'] | null;
  puttSlope: ShotRecord['puttSlope'] | null;
  puttMissTags: PuttMissTag[];
  approachMissDirection: ApproachMissDirection | null;
  approachMissLieType: 'fairway' | 'rough' | 'bunker' | 'hazard' | undefined;
  distanceAfterShot: string;
  distanceAfterUnit: 'yards' | 'feet';
  // Auto-save
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  pendingSaveCount: number;
  autoSaveRetryAttempt: number;
  // Penalty modal
  showPenaltyModal: boolean;
  penaltyType: string | null;
  // Undo
  showUndoConfirm: boolean;
  undoSaving: boolean;
  undoError: string | null;
  // Edit modal
  editingShot: ShotRecord | null;
  showEditModal: boolean;
  showDeleteConfirm: boolean;
  editFormData: EditFormData | null;
  editSaving: boolean;
  editError: string | null;
  // Navigation
  selectedShotNumber: number | null;
}

// ============================================================================
// ACTIONS
// ============================================================================

export type ShotAction =
  | { type: 'RESET_FOR_HOLE_CHANGE'; payload: { initialShots: ShotRecord[]; initialShotNumber: number; holeYardage: number } }
  // Core shot recording
  | { type: 'RECORD_SHOT'; payload: { shot: ShotRecord; isHoleComplete: boolean } }
  | { type: 'UPDATE_AFTER_SHOT'; payload: { distanceAfter: number; unitAfter: 'yards' | 'feet'; newLie: LieType } }
  // Shot input setters
  | { type: 'SET_RESULT'; payload: ShotRecord['result'] | null }
  | { type: 'SET_DRIVER'; payload: boolean | null }
  | { type: 'SET_MISS_DIRECTION'; payload: string | null }
  | { type: 'SET_PUTT_BREAK'; payload: ShotRecord['puttBreak'] | null }
  | { type: 'SET_PUTT_SLOPE'; payload: ShotRecord['puttSlope'] | null }
  | { type: 'SET_PUTT_MISS_TAGS'; payload: PuttMissTag[] }
  | { type: 'SET_APPROACH_MISS'; payload: { direction: ApproachMissDirection | null; lieType?: 'fairway' | 'rough' | 'bunker' | 'hazard' | undefined } }
  | { type: 'SET_DISTANCE_AFTER'; payload: string }
  | { type: 'SET_DISTANCE_AFTER_UNIT'; payload: 'yards' | 'feet' }
  // Auto-save
  | { type: 'SET_AUTO_SAVE_STATUS'; payload: 'idle' | 'saving' | 'saved' | 'error' }
  | { type: 'AUTO_SAVE_RETRY_SCHEDULED'; payload: number }
  | { type: 'AUTO_SAVE_RESET' }
  | { type: 'INCREMENT_PENDING_SAVE' }
  // Penalty
  | { type: 'SHOW_PENALTY_MODAL' }
  | { type: 'SET_PENALTY_TYPE'; payload: string | null }
  | { type: 'CONFIRM_PENALTY'; payload: ShotRecord }
  | { type: 'CLOSE_PENALTY_MODAL' }
  // Undo
  | { type: 'SHOW_UNDO_CONFIRM' }
  | { type: 'HIDE_UNDO_CONFIRM' }
  | { type: 'UNDO_START' }
  | { type: 'UNDO_COMPLETE'; payload: { newHistory: ShotRecord[] } }
  | { type: 'UNDO_FAIL'; payload?: string }
  // Edit modal
  | { type: 'OPEN_EDIT_MODAL'; payload: { shot: ShotRecord; formData: EditFormData } }
  | { type: 'CLOSE_EDIT_MODAL' }
  | { type: 'SET_EDIT_FORM_DATA'; payload: EditFormData }
  | { type: 'EDIT_SAVE_START' }
  | { type: 'EDIT_SAVE_COMPLETE'; payload: { updatedHistory: ShotRecord[] } }
  | { type: 'EDIT_SAVE_ERROR'; payload: string }
  | { type: 'SHOW_DELETE_CONFIRM' }
  | { type: 'HIDE_DELETE_CONFIRM' }
  | { type: 'DELETE_COMPLETE'; payload: { newHistory: ShotRecord[] } }
  // Navigation
  | { type: 'SELECT_SHOT'; payload: number | null }
  // Result selection with smart clearing
  | { type: 'HANDLE_RESULT_SELECT'; payload: { result: string; isTeeShot: boolean; isPutting: boolean; isApproachOrAroundGreen: boolean } }
  // Clear input state (used after recording a shot or restoring position)
  | { type: 'CLEAR_INPUT_STATE'; payload?: { distanceAfterUnit?: 'yards' | 'feet' } };

// ============================================================================
// HELPER: compute restored state from history
// ============================================================================

/** Clamp distanceToHole to a minimum sensible value to prevent 0/NaN/negative causing division-by-zero or broken UI */
function safeDistanceToHole(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return value;
}

/** @internal - exported for testing */
export function computeRestoredState(history: ShotRecord[], holeYardage: number): Pick<ShotTrackingState, 'distanceToHole' | 'distanceUnit' | 'currentLie' | 'distanceAfterUnit'> {
  if (history.length > 0) {
    const lastShot = history[history.length - 1]!;
    const restoredLie = lieFromShotResult(lastShot);
    return {
      distanceToHole: safeDistanceToHole(lastShot.distanceToHoleAfter),
      distanceUnit: lastShot.distanceUnitAfter,
      currentLie: restoredLie,
      distanceAfterUnit: restoredLie === 'green' ? 'feet' : 'yards',
    };
  }
  return {
    distanceToHole: safeDistanceToHole(holeYardage),
    distanceUnit: 'yards',
    currentLie: 'tee',
    distanceAfterUnit: 'yards',
  };
}

const CLEAR_INPUT: Pick<ShotTrackingState, 'usedDriver' | 'resultOfShot' | 'missDirection' | 'puttBreak' | 'puttSlope' | 'puttMissTags' | 'approachMissDirection' | 'approachMissLieType' | 'distanceAfterShot'> = {
  usedDriver: null,
  resultOfShot: null,
  missDirection: null,
  puttBreak: null,
  puttSlope: null,
  puttMissTags: [],
  approachMissDirection: null,
  approachMissLieType: undefined,
  distanceAfterShot: '',
};

// ============================================================================
// REDUCER
// ============================================================================

/** @internal - exported for testing */
export function shotReducer(state: ShotTrackingState, action: ShotAction): ShotTrackingState {
  switch (action.type) {
    case 'RESET_FOR_HOLE_CHANGE': {
      const { initialShots, initialShotNumber, holeYardage } = action.payload;
      const hasSavedShots = initialShots.length > 0;

      let initialLie: LieType = 'tee';
      let initialDistance = holeYardage;
      let initialUnit: 'yards' | 'feet' = 'yards';

      if (hasSavedShots) {
        const lastShot = initialShots[initialShots.length - 1];
        if (lastShot) initialLie = lieFromShotResult(lastShot);
        if (lastShot != null && lastShot.distanceToHoleAfter != null) {
          const parsed = typeof lastShot.distanceToHoleAfter === 'string'
            ? parseFloat(lastShot.distanceToHoleAfter as unknown as string)
            : lastShot.distanceToHoleAfter;
          if (!isNaN(parsed)) initialDistance = parsed;
        }
        initialUnit = (lastShot?.distanceUnitAfter || 'yards') as 'yards' | 'feet';
      }

      return {
        ...state,
        currentShot: hasSavedShots ? initialShotNumber : 1,
        shotHistory: hasSavedShots ? initialShots : [],
        distanceToHole: safeDistanceToHole(initialDistance),
        distanceUnit: initialUnit,
        currentLie: initialLie,
        holeYardage,
        ...CLEAR_INPUT,
        distanceAfterUnit: initialLie === 'green' ? 'feet' : 'yards',
        showPenaltyModal: false,
        penaltyType: null,
        selectedShotNumber: null,
      };
    }

    case 'RECORD_SHOT': {
      const { shot } = action.payload;
      return {
        ...state,
        shotHistory: [...state.shotHistory, shot],
      };
    }

    case 'UPDATE_AFTER_SHOT': {
      const { distanceAfter, unitAfter, newLie } = action.payload;
      return {
        ...state,
        currentLie: newLie,
        currentShot: state.currentShot + 1,
        distanceToHole: distanceAfter,
        distanceUnit: unitAfter,
        ...CLEAR_INPUT,
        distanceAfterUnit: newLie === 'green' ? 'feet' : 'yards',
      };
    }

    case 'SET_RESULT':
      return { ...state, resultOfShot: action.payload };

    case 'SET_DRIVER':
      return { ...state, usedDriver: action.payload };

    case 'SET_MISS_DIRECTION':
      return { ...state, missDirection: action.payload };

    case 'SET_PUTT_BREAK':
      return { ...state, puttBreak: action.payload };

    case 'SET_PUTT_SLOPE':
      return { ...state, puttSlope: action.payload };

    case 'SET_PUTT_MISS_TAGS':
      return { ...state, puttMissTags: action.payload };

    case 'SET_APPROACH_MISS':
      return {
        ...state,
        approachMissDirection: action.payload.direction,
        ...(action.payload.lieType !== undefined ? { approachMissLieType: action.payload.lieType } : {}),
      };

    case 'SET_DISTANCE_AFTER':
      return { ...state, distanceAfterShot: action.payload };

    case 'SET_DISTANCE_AFTER_UNIT':
      return { ...state, distanceAfterUnit: action.payload };

    case 'SET_AUTO_SAVE_STATUS':
      return { ...state, autoSaveStatus: action.payload };

    case 'AUTO_SAVE_RETRY_SCHEDULED':
      return { ...state, autoSaveRetryAttempt: action.payload };

    case 'AUTO_SAVE_RESET':
      return { ...state, autoSaveRetryAttempt: 0, pendingSaveCount: 0 };

    case 'INCREMENT_PENDING_SAVE':
      return { ...state, pendingSaveCount: state.pendingSaveCount + 1 };

    // Penalty
    case 'SHOW_PENALTY_MODAL':
      return { ...state, showPenaltyModal: true };

    case 'SET_PENALTY_TYPE':
      return { ...state, penaltyType: action.payload };

    case 'CONFIRM_PENALTY': {
      const penaltyShot = action.payload;
      const newLie = lieFromShotResult(penaltyShot);
      return {
        ...state,
        shotHistory: [...state.shotHistory, penaltyShot],
        currentShot: state.currentShot + 1,
        currentLie: newLie,
        distanceToHole: penaltyShot.distanceToHoleAfter,
        distanceUnit: penaltyShot.distanceUnitAfter,
        ...CLEAR_INPUT,
        distanceAfterUnit: newLie === 'green' ? 'feet' : 'yards',
        showPenaltyModal: false,
        penaltyType: null,
      };
    }

    case 'CLOSE_PENALTY_MODAL':
      return { ...state, showPenaltyModal: false, penaltyType: null };

    // Undo
    case 'SHOW_UNDO_CONFIRM':
      return { ...state, showUndoConfirm: true, undoError: null };

    case 'HIDE_UNDO_CONFIRM':
      return { ...state, showUndoConfirm: false, undoError: null };

    case 'UNDO_START':
      return { ...state, undoSaving: true };

    case 'UNDO_COMPLETE': {
      const { newHistory } = action.payload;
      const restored = computeRestoredState(newHistory, state.holeYardage);
      return {
        ...state,
        shotHistory: newHistory,
        currentShot: newHistory.length + 1,
        ...restored,
        ...CLEAR_INPUT,
        undoSaving: false,
        undoError: null,
        showUndoConfirm: false,
      };
    }

    case 'UNDO_FAIL':
      return {
        ...state,
        undoSaving: false,
        undoError: action.payload ?? 'Failed to undo shot. Please try again.',
        showUndoConfirm: true,
      };

    // Edit modal
    case 'OPEN_EDIT_MODAL':
      return {
        ...state,
        editingShot: action.payload.shot,
        editFormData: action.payload.formData,
        editError: null,
        showEditModal: true,
      };

    case 'CLOSE_EDIT_MODAL':
      return {
        ...state,
        showEditModal: false,
        editingShot: null,
        editFormData: null,
        editError: null,
        showDeleteConfirm: false,
      };

    case 'SET_EDIT_FORM_DATA':
      return { ...state, editFormData: action.payload };

    case 'EDIT_SAVE_START':
      return { ...state, editSaving: true, editError: null };

    case 'EDIT_SAVE_COMPLETE': {
      const { updatedHistory } = action.payload;
      const restored = computeRestoredState(updatedHistory, state.holeYardage);
      return {
        ...state,
        shotHistory: updatedHistory,
        currentShot: updatedHistory.length + 1,
        ...restored,
        ...CLEAR_INPUT,
        editSaving: false,
        showEditModal: false,
        editingShot: null,
        editFormData: null,
        editError: null,
        showDeleteConfirm: false,
      };
    }

    case 'EDIT_SAVE_ERROR':
      return { ...state, editError: action.payload, editSaving: false };

    case 'SHOW_DELETE_CONFIRM':
      return { ...state, showDeleteConfirm: true };

    case 'HIDE_DELETE_CONFIRM':
      return { ...state, showDeleteConfirm: false };

    case 'DELETE_COMPLETE': {
      const { newHistory } = action.payload;
      const restored = computeRestoredState(newHistory, state.holeYardage);
      return {
        ...state,
        shotHistory: newHistory,
        currentShot: newHistory.length + 1,
        ...restored,
        ...CLEAR_INPUT,
        editSaving: false,
        showEditModal: false,
        editingShot: null,
        editFormData: null,
        editError: null,
        showDeleteConfirm: false,
      };
    }

    // Navigation
    case 'SELECT_SHOT':
      return { ...state, selectedShotNumber: action.payload };

    // Result selection with smart clearing of miss direction states
    case 'HANDLE_RESULT_SELECT': {
      const { result, isTeeShot, isPutting, isApproachOrAroundGreen } = action.payload;
      const newState: Partial<ShotTrackingState> = {
        resultOfShot: result as ShotRecord['result'],
        // Clear stale distance when result changes so old value doesn't persist
        distanceAfterShot: '',
      };

      if (result === 'hole' || result === 'green') {
        newState.missDirection = null;
        newState.approachMissDirection = null;
        newState.approachMissLieType = undefined;
        newState.puttMissTags = [];
      } else if (isTeeShot) {
        newState.approachMissDirection = null;
        newState.approachMissLieType = undefined;
        newState.puttMissTags = [];
      } else if (isPutting) {
        newState.missDirection = null;
        newState.approachMissDirection = null;
        newState.approachMissLieType = undefined;
      } else if (isApproachOrAroundGreen) {
        newState.missDirection = null;
        newState.puttMissTags = [];
        if (result === 'rough' || result === 'other') {
          newState.approachMissLieType = 'rough';
        } else if (result === 'sand') {
          newState.approachMissLieType = 'bunker';
        } else if (result === 'fairway') {
          newState.approachMissLieType = 'fairway';
        }
      }

      return { ...state, ...newState };
    }

    case 'CLEAR_INPUT_STATE':
      return {
        ...state,
        ...CLEAR_INPUT,
        distanceAfterUnit: action.payload?.distanceAfterUnit ?? state.distanceAfterUnit,
      };

    default:
      return state;
  }
}

// ============================================================================
// INITIAL STATE
// ============================================================================

function computeInitialState(
  initialShots: ShotRecord[],
  initialShotNumber: number,
  holeYardage: number,
): ShotTrackingState {
  const hasSavedShots = initialShots.length > 0;

  let initialLie: LieType = 'tee';
  let initialDistance = holeYardage;
  let initialUnit: 'yards' | 'feet' = 'yards';

  if (hasSavedShots) {
    const lastShot = initialShots[initialShots.length - 1];
    if (lastShot) initialLie = lieFromShotResult(lastShot);
    if (lastShot != null && lastShot.distanceToHoleAfter != null) {
      const parsed = typeof lastShot.distanceToHoleAfter === 'string'
        ? parseFloat(lastShot.distanceToHoleAfter as unknown as string)
        : lastShot.distanceToHoleAfter;
      if (!isNaN(parsed)) initialDistance = parsed;
    }
    initialUnit = (lastShot?.distanceUnitAfter || 'yards') as 'yards' | 'feet';
  }

  return {
    currentShot: hasSavedShots ? initialShotNumber : 1,
    shotHistory: hasSavedShots ? initialShots : [],
    distanceToHole: initialDistance,
    distanceUnit: initialUnit,
    currentLie: initialLie,
    holeYardage,
    usedDriver: null,
    resultOfShot: null,
    missDirection: null,
    puttBreak: null,
    puttSlope: null,
    puttMissTags: [],
    approachMissDirection: null,
    approachMissLieType: undefined,
    distanceAfterShot: '',
    distanceAfterUnit: initialLie === 'green' ? 'feet' : 'yards',
    autoSaveStatus: 'idle',
    pendingSaveCount: 0,
    autoSaveRetryAttempt: 0,
    showPenaltyModal: false,
    penaltyType: null,
    showUndoConfirm: false,
    undoSaving: false,
    undoError: null,
    editingShot: null,
    showEditModal: false,
    showDeleteConfirm: false,
    editFormData: null,
    editSaving: false,
    editError: null,
    selectedShotNumber: null,
  };
}

// ============================================================================
// HOOK
// ============================================================================

interface UseShotStateMachineParams {
  initialShots: ShotRecord[];
  initialShotNumber: number;
  currentHoleIndex: number;
  currentHole: RoundHole | undefined;
  onAutoSave?: (shots: ShotRecord[], currentHoleIndex: number) => Promise<void>;
  autoSaveInterval?: number;
  /** When true, suppresses all auto-save scheduling (e.g. after round submission) */
  autoSaveDisabled?: boolean;
}

export function useShotStateMachine({
  initialShots,
  initialShotNumber,
  currentHoleIndex,
  currentHole,
  onAutoSave,
  autoSaveInterval = 5000,
  autoSaveDisabled = false,
}: UseShotStateMachineParams) {
  const holeYardage = currentHole?.yardage ?? 0;

  const [state, dispatch] = useReducer(
    shotReducer,
    { initialShots, initialShotNumber, holeYardage },
    (args) => computeInitialState(args.initialShots, args.initialShotNumber, args.holeYardage),
  );

  // Refs
  const isProcessingShotRef = useRef(false);
  const distanceInputRef = useRef<HTMLInputElement>(null);
  const lastSavedShotsRef = useRef<string>('');
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveStatusTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hydratedHoleIndexRef = useRef<number | null>(null);
  // Track retry attempt via ref to avoid stale closure in setTimeout callbacks
  const autoSaveRetryAttemptRef = useRef(0);
  // Circuit breaker: track consecutive failures across ALL save cycles.
  // Once the threshold is hit, auto-save is disabled until a manual save succeeds
  // or the component re-mounts. This prevents 160+ error spam during deploys/outages.
  const circuitBreakerFailuresRef = useRef(0);
  const CIRCUIT_BREAKER_THRESHOLD = 5;
  const circuitBreakerOpenRef = useRef(false);
  // Cooldown: when circuit breaker opens, wait before allowing a retry probe
  const circuitBreakerCooldownRef = useRef<NodeJS.Timeout | null>(null);

  // Refs for fresh values in async callbacks
  const onAutoSaveRef = useRef(onAutoSave);
  onAutoSaveRef.current = onAutoSave;
  const shotHistoryRef = useRef(state.shotHistory);
  shotHistoryRef.current = state.shotHistory;
  const currentHoleIndexRef = useRef(currentHoleIndex);
  currentHoleIndexRef.current = currentHoleIndex;

  // ---- EFFECT: Reset on hole change ----
  useEffect(() => {
    if (hydratedHoleIndexRef.current === currentHoleIndex) return;
    hydratedHoleIndexRef.current = currentHoleIndex;

    dispatch({
      type: 'RESET_FOR_HOLE_CHANGE',
      payload: { initialShots, initialShotNumber, holeYardage },
    });
  }, [currentHoleIndex, holeYardage, initialShots, initialShotNumber]);

  // ---- EFFECT: Auto-save with circuit breaker ----
  // Circuit breaker prevents 160+ error spam during deploys/outages.
  // After CIRCUIT_BREAKER_THRESHOLD consecutive failures, auto-save pauses
  // and only sends a single probe every 60s to check if the server is back.
  useEffect(() => {
    if (autoSaveDisabled) return;
    if (!onAutoSaveRef.current || state.shotHistory.length === 0) return;

    // Circuit breaker open: skip scheduling new saves (probe timer handles recovery)
    if (circuitBreakerOpenRef.current) return;

    const currentFingerprint = computeShotFingerprint(state.shotHistory);
    if (currentFingerprint === lastSavedShotsRef.current) return;

    if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);

    const handleSaveSuccess = (fingerprint: string) => {
      lastSavedShotsRef.current = fingerprint;
      dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'saved' });
      autoSaveRetryAttemptRef.current = 0;
      // Reset circuit breaker on success
      circuitBreakerFailuresRef.current = 0;
      circuitBreakerOpenRef.current = false;
      if (circuitBreakerCooldownRef.current) {
        clearTimeout(circuitBreakerCooldownRef.current);
        circuitBreakerCooldownRef.current = null;
      }
      dispatch({ type: 'AUTO_SAVE_RESET' });

      if (autoSaveRetryTimeoutRef.current) {
        clearTimeout(autoSaveRetryTimeoutRef.current);
        autoSaveRetryTimeoutRef.current = null;
      }

      if (autoSaveStatusTimeoutRef.current) clearTimeout(autoSaveStatusTimeoutRef.current);
      autoSaveStatusTimeoutRef.current = setTimeout(() => {
        dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'idle' });
      }, 2000);
    };

    const handleSaveFailure = () => {
      dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'error' });
      circuitBreakerFailuresRef.current++;

      // Open circuit breaker after threshold consecutive failures
      if (circuitBreakerFailuresRef.current >= CIRCUIT_BREAKER_THRESHOLD) {
        circuitBreakerOpenRef.current = true;
        // Schedule a single probe attempt every 60s to check server health.
        // If the probe succeeds, the circuit breaker resets automatically.
        const scheduleCooldownProbe = () => {
          if (circuitBreakerCooldownRef.current) clearTimeout(circuitBreakerCooldownRef.current);
          circuitBreakerCooldownRef.current = setTimeout(async () => {
            if (!isMountedRef.current || !onAutoSaveRef.current) return;
            const probeFingerprint = computeShotFingerprint(shotHistoryRef.current);
            if (probeFingerprint === lastSavedShotsRef.current) {
              // Data was saved elsewhere; reset breaker
              circuitBreakerOpenRef.current = false;
              circuitBreakerFailuresRef.current = 0;
              if (isMountedRef.current) dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'idle' });
              return;
            }
            try {
              if (isMountedRef.current) dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'saving' });
              await onAutoSaveRef.current(shotHistoryRef.current, currentHoleIndexRef.current);
              if (isMountedRef.current) handleSaveSuccess(probeFingerprint);
            } catch (error) {
              logError(
                error instanceof Error ? error : new Error(String(error)),
                {
                  component: 'useShotStateMachine',
                  action: 'auto-save circuit-breaker probe',
                  currentHoleIndex: currentHoleIndexRef.current,
                  shotCount: shotHistoryRef.current.length,
                  consecutiveFailures: circuitBreakerFailuresRef.current,
                  circuitBreakerOpen: circuitBreakerOpenRef.current,
                },
                'high'
              );
              // Probe failed — stay open, schedule another probe
              if (isMountedRef.current) {
                dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'error' });
                scheduleCooldownProbe();
              }
            }
          }, 60_000); // 60s cooldown between probe attempts
        };
        scheduleCooldownProbe();
        return; // Don't schedule per-cycle retries when breaker is open
      }

      // Per-cycle retries with exponential backoff (max 3 attempts: 5s, 15s, 30s)
      const RETRY_DELAYS = [5000, 15000, 30000];
      const currentAttempt = autoSaveRetryAttemptRef.current;
      if (currentAttempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[currentAttempt]!;
        autoSaveRetryAttemptRef.current = currentAttempt + 1;
        dispatch({ type: 'AUTO_SAVE_RETRY_SCHEDULED', payload: currentAttempt + 1 });

        if (autoSaveRetryTimeoutRef.current) clearTimeout(autoSaveRetryTimeoutRef.current);
        autoSaveRetryTimeoutRef.current = setTimeout(async () => {
          const retryFingerprint = computeShotFingerprint(shotHistoryRef.current);
          if (retryFingerprint === lastSavedShotsRef.current) {
            dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'idle' });
            autoSaveRetryAttemptRef.current = 0;
            dispatch({ type: 'AUTO_SAVE_RESET' });
            return;
          }

          try {
            dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'saving' });
            await onAutoSaveRef.current?.(shotHistoryRef.current, currentHoleIndexRef.current);
            handleSaveSuccess(retryFingerprint);
          } catch (error) {
            logError(
              error instanceof Error ? error : new Error(String(error)),
              {
                component: 'useShotStateMachine',
                action: 'auto-save retry attempt',
                currentHoleIndex: currentHoleIndexRef.current,
                shotCount: shotHistoryRef.current.length,
                retryAttempt: autoSaveRetryAttemptRef.current,
                consecutiveFailures: circuitBreakerFailuresRef.current,
              },
              'high'
            );
            handleSaveFailure();
          }
        }, delay);
      }
    };

    autoSaveTimeoutRef.current = setTimeout(async () => {
      const freshFingerprint = computeShotFingerprint(shotHistoryRef.current);
      if (freshFingerprint === lastSavedShotsRef.current) return;

      try {
        dispatch({ type: 'SET_AUTO_SAVE_STATUS', payload: 'saving' });
        await onAutoSaveRef.current?.(shotHistoryRef.current, currentHoleIndexRef.current);
        handleSaveSuccess(freshFingerprint);
      } catch (error) {
        logError(
          error instanceof Error ? error : new Error(String(error)),
          {
            component: 'useShotStateMachine',
            action: 'auto-save initial attempt',
            currentHoleIndex: currentHoleIndexRef.current,
            shotCount: shotHistoryRef.current.length,
            autoSaveInterval,
            consecutiveFailures: circuitBreakerFailuresRef.current,
          },
          'high'
        );
        handleSaveFailure();
      }
    }, autoSaveInterval);

    return () => {
      if (autoSaveTimeoutRef.current) clearTimeout(autoSaveTimeoutRef.current);
      if (autoSaveStatusTimeoutRef.current) clearTimeout(autoSaveStatusTimeoutRef.current);
      if (autoSaveRetryTimeoutRef.current) clearTimeout(autoSaveRetryTimeoutRef.current);
      // Note: circuitBreakerCooldownRef is NOT cleared here — it persists
      // across effect re-runs so the probe timer keeps running even when
      // the effect skips due to circuitBreakerOpenRef being true.
    };
  }, [state.shotHistory, currentHoleIndex, autoSaveInterval, autoSaveDisabled]);

  // ---- EFFECT: Clean up circuit breaker probe timer on unmount ----
  // Uses an isMounted ref so in-flight probe callbacks don't dispatch to an unmounted component
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (circuitBreakerCooldownRef.current) {
        clearTimeout(circuitBreakerCooldownRef.current);
        circuitBreakerCooldownRef.current = null;
      }
    };
  }, []);

  // ---- EFFECT: Auto-set distance unit based on result ----
  useEffect(() => {
    if (state.resultOfShot === 'green') {
      dispatch({ type: 'SET_DISTANCE_AFTER_UNIT', payload: 'feet' });
    } else if (state.resultOfShot === 'hole') {
      dispatch({ type: 'SET_DISTANCE_AFTER', payload: '0' });
      dispatch({ type: 'SET_DISTANCE_AFTER_UNIT', payload: 'feet' });
    } else if (state.resultOfShot && state.currentLie !== 'green') {
      dispatch({ type: 'SET_DISTANCE_AFTER_UNIT', payload: 'yards' });
    }
  }, [state.resultOfShot, state.currentLie]);

  // ---- EFFECT: Auto-focus distance input ----
  const shotType = getShotTypeFromState(state, currentHole);
  const isPutting = shotType === 'putting';
  const isTeeShot = shotType === 'tee';
  const isApproachOrAroundGreen = shotType === 'approach' || shotType === 'around_green';
  const distanceAutoAdvanceKeyRef = useRef<string | null>(null);
  const distanceScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const distanceFocusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (distanceScrollTimeoutRef.current) clearTimeout(distanceScrollTimeoutRef.current);
    if (distanceFocusTimeoutRef.current) clearTimeout(distanceFocusTimeoutRef.current);

    if (!distanceInputRef.current) return;
    if (!shouldAutoAdvanceToDistanceInput({
      resultOfShot: state.resultOfShot,
      missDirection: state.missDirection,
      approachMissDirection: state.approachMissDirection,
    }, shotType)) {
      if (!state.resultOfShot) {
        distanceAutoAdvanceKeyRef.current = null;
      }
      return;
    }

    const automationKey = [
      currentHoleIndex,
      state.currentShot,
      shotType,
      state.resultOfShot,
    ].join(':');

    if (distanceAutoAdvanceKeyRef.current === automationKey) {
      return;
    }
    distanceAutoAdvanceKeyRef.current = automationKey;

    distanceScrollTimeoutRef.current = setTimeout(() => {
      const el = distanceInputRef.current;
      if (!el) return;

      if (shouldAutoScrollDistanceInput(shotType)) {
        el.scrollIntoView({ behavior: 'auto', block: 'nearest' });
        distanceFocusTimeoutRef.current = setTimeout(() => {
          distanceInputRef.current?.focus({ preventScroll: true });
        }, 0);
      }
    }, 0);

    return () => {
      if (distanceScrollTimeoutRef.current) clearTimeout(distanceScrollTimeoutRef.current);
      if (distanceFocusTimeoutRef.current) clearTimeout(distanceFocusTimeoutRef.current);
    };
  }, [
    currentHoleIndex,
    shotType,
    state.approachMissDirection,
    state.currentShot,
    state.missDirection,
    state.resultOfShot,
  ]);

  return {
    state,
    dispatch,
    isProcessingShotRef,
    distanceInputRef,
    // Pre-computed derived values
    shotType,
    isPutting,
    isTeeShot,
    isApproachOrAroundGreen,
  };
}

// ============================================================================
// DERIVED VALUE HELPERS
// ============================================================================

/** @internal - exported for testing */
export function getShotTypeFromState(
  state: ShotTrackingState,
  currentHole: RoundHole | undefined,
): 'tee' | 'approach' | 'around_green' | 'putting' {
  if (state.currentLie === 'green') return 'putting';
  if (state.currentShot === 1 && currentHole?.par === 3) return 'approach';
  if (state.currentShot === 1 && currentHole?.par !== 3) return 'tee';
  const distanceInYards = state.distanceUnit === 'feet' ? state.distanceToHole / 3 : state.distanceToHole;
  // Around-green vs approach split at 50 yd to the hole — matches
  // AROUND_GREEN_THRESHOLD_YARDS in the stats calculator and the v3 approach
  // bucketer (both treat <50 yd as around-green). Previously split at 30 yd,
  // which orphaned 31-49 yd shots: stored as 'approach' yet excluded from every
  // approach distance bucket (≥50) AND from ATG efficiency.
  if (distanceInYards < 50) return 'around_green';
  return 'approach';
}

/** @internal - exported for testing */
export function shouldAutoAdvanceToDistanceInput(
  state: Pick<ShotTrackingState, 'resultOfShot' | 'missDirection' | 'approachMissDirection'>,
  shotType: 'tee' | 'approach' | 'around_green' | 'putting',
): boolean {
  const result = state.resultOfShot;
  if (!result || result === 'hole') return false;

  if (shotType === 'tee') {
    return !['rough', 'sand', 'other'].includes(result) || !!state.missDirection;
  }

  if (shotType === 'approach' || shotType === 'around_green') {
    return ['green', 'hole'].includes(result) || !!state.approachMissDirection;
  }

  // Putting miss tags are optional; avoid blocking distance entry on them.
  return true;
}

/** @internal - exported for testing */
export function shouldAutoScrollDistanceInput(
  shotType: 'tee' | 'approach' | 'around_green' | 'putting',
): boolean {
  // Putting is the most sensitive flow in replay sessions; avoid any forced
  // programmatic scroll while players are still tagging the miss.
  return shotType !== 'putting';
}
