'use client';

import { useRef } from 'react';
import { useConnectionStatus } from '@/hooks/golf/use-connection-status';
import { useContinueRoundSession, type ContinueRoundSessionProps } from '@/lib/golf/round-session/use-continue-round-session';
import { useRoundPorts } from './ports';
import { QualifierRoundSheet } from './QualifierRoundSheet';
import { RecoveryHost, RoundRuntime, type RoundRuntimeRoutes } from './RoundRuntime';
import { roundHeading, trackingRound, type ChRoundSession } from './session';

const LIBRARY = '/golf/dashboard/rounds';

/** The recovery flow is Fairway's and has no Clubhouse screen: a submit that couldn't reach the server lands on Rounds (see `NewRound`). */
const ENGINE_ROUTES = { recover: LIBRARY };
const ROUTES: RoundRuntimeRoutes = { library: LIBRARY, review: (roundId) => `${LIBRARY}/${roundId}` };

export interface ContinueRoundProps extends ContinueRoundSessionProps {
  /** The unused round numbers a legacy qualifier row may choose from, chosen by the server page. */
  qualifierRoundNumberOptions?: number[];
  /** Why a legacy qualifier row has none to choose. */
  qualifierRoundNumberUnavailableReason?: string;
}

/**
 * /golf/dashboard/rounds/continue/[id] in Clubhouse (P011): a round already started, over the continue engine
 * (`useContinueRoundSession`) and the same `RoundRuntime` as a new round. The server page has loaded the round, its
 * holes and shots; this screen only draws them, and everything the engine can reach has a state: a device copy of
 * the round (CH-11512), a round changed on another device (CH-11902), the failures of a save or discard, a closed
 * qualifier (CH-11516), and a legacy qualifier round that must be numbered before it can be submitted (CH-11518).
 */
export function ContinueRound({ qualifierRoundNumberOptions = [], qualifierRoundNumberUnavailableReason, ...props }: ContinueRoundProps) {
  const { ports, capture } = useRoundPorts();
  const connection = useConnectionStatus();
  const engine = useContinueRoundSession({ ...props, ports, routes: ENGINE_ROUTES });
  // What an action calls is the latest engine, never the one a retrying toast was made under.
  const latest = useRef(engine);
  latest.current = engine;
  const connected = useRef(connection.isConnected);
  connected.current = connection.isConnected;

  const session: ChRoundSession = {
    round: trackingRound(props.setupData),
    heading: roundHeading(props.setupData),
    holes: engine.holes,
    currentHoleIndex: engine.currentHoleIndex,
    setCurrentHoleIndex: engine.setCurrentHoleIndex,
    completedHoleStats: engine.completedHoleStats,
    activeHoleShots: engine.activeHoleShots,
    activeShotNumber: engine.activeShotNumber,
    onHoleComplete: engine.handleHoleComplete,
    onHoleStatsUpdate: engine.handleHoleStatsUpdate,
    onSaveShot: engine.handleSaveShot,
    onAutoSave: engine.handleAutoSave,
    autoSaveDisabled: engine.submitting || !!engine.completedRoundId,
    error: engine.error,
    setError: engine.setError,
    roundConflictBlocked: engine.roundConflictBlocked,
    offline: () => typeof navigator !== 'undefined' && navigator.onLine === false && !connected.current,
    engineExitOpen: engine.showExitModal,
    setEngineExitOpen: engine.setShowExitModal,
    saveForLater: engine.handleSaveForLater,
    deleteRound: engine.handleDeleteRound,
    pendingFinalStats: engine.pendingFinalStats,
    showFinishConfirm: engine.showFinishConfirm,
    setShowFinishConfirm: engine.setShowFinishConfirm,
    submit: engine.requestRoundSubmission,
    submitting: engine.submitting,
    completedRoundId: engine.completedRoundId,
    qualifierClosed: engine.qualifierClosed,
    submitRetry: engine.handleSubmitRetry,
    submitGoBack: engine.handleSubmitGoBack,
    submitSaveAndExit: engine.handleSubmitSaveAndExit,
    submitDiscard: engine.handleSubmitDiscard,
    saveAsPractice: engine.handleSaveAsPractice,
    // The continue engine restores the device copy in one step, with nothing to wait for.
    recovery: { open: engine.showRecoveryDialog, data: engine.recoveryData, restoring: false },
    restoreRecovery: engine.handleRestoreRecovery,
    discardRecovery: engine.handleDiscardRecovery,
    closeRecovery: () => engine.setShowRecoveryDialog(false),
  };

  return (
    <>
      <RoundRuntime session={session} capture={capture} routes={ROUTES} errorsHeld={session.recovery.open || engine.showQualifierRoundNumberDialog} />
      <RecoveryHost
        recovery={session.recovery}
        error={engine.error}
        setError={engine.setError}
        onRestore={() => latest.current.handleRestoreRecovery()}
        onDiscard={() => latest.current.handleDiscardRecovery()}
        onClose={() => latest.current.setShowRecoveryDialog(false)}
      />
      <QualifierRoundSheet
        open={engine.showQualifierRoundNumberDialog}
        options={qualifierRoundNumberOptions}
        unavailableReason={qualifierRoundNumberUnavailableReason ?? null}
        selected={engine.selectedQualifierRoundNumber ?? null}
        canSubmit={engine.selectedQualifierRoundNumber != null && !!engine.pendingFinalStats}
        onSelect={engine.setSelectedQualifierRoundNumber}
        onBack={() => latest.current.handleQualifierRoundBack()}
        onSubmit={() => latest.current.handleQualifierRoundSubmit()}
      />
    </>
  );
}
