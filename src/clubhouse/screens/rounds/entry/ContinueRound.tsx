'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { updateRoundType } from '@/app/golf/actions/round-type';
import { useConnectionStatus } from '@/hooks/golf/use-connection-status';
import { useContinueRoundSession, type ContinueRoundSessionProps } from '@/lib/golf/round-session/use-continue-round-session';
import { normalizeStartHole } from '@/lib/golf/round-session/play-order';
import { useRoundPorts } from './ports';
import { useAction } from '../../../lib/use-action';
import { QualifierRoundSheet } from './QualifierRoundSheet';
import { roundTypeFailure, ROUND_TYPE_LABEL, sameChoice, savedLine, type ChRoundTypeChoice, type ChRoundTypeCurrent, type ChRoundTypeOptions } from './round-type';
import { RoundTypeSheet } from './RoundTypeSheet';
import { RecoveryHost, RoundRuntime, type RoundRuntimeRoutes } from './RoundRuntime';
import { useRoundDoneKey } from './use-done-key';
import { ENGINE_ROUTES } from './routes';
import { roundHeading, trackingRound, type ChRoundSession } from './session';

const LIBRARY = '/golf/dashboard/rounds';

const ROUTES: RoundRuntimeRoutes = { library: LIBRARY, review: (roundId) => `${LIBRARY}/${roundId}` };

export interface ContinueRoundProps extends ContinueRoundSessionProps {
  /** The unused round numbers a legacy qualifier row may choose from, chosen by the server page. */
  qualifierRoundNumberOptions?: number[];
  /** Why a legacy qualifier row has none to choose. */
  qualifierRoundNumberUnavailableReason?: string;
  /** The qualifiers the round's type can change to, read by the route (`loadRoundTypeOptions`). */
  roundTypeOptions?: ChRoundTypeOptions;
}

const NO_OPTIONS: ChRoundTypeOptions = { qualifiers: [], readFailed: false };

/**
 * /golf/dashboard/rounds/continue/[id] in Clubhouse (P011): a round already started, over the continue engine
 * (`useContinueRoundSession`) and the same `RoundRuntime` as a new round. The server page has loaded the round, its
 * holes and shots; this screen only draws them, and everything the engine can reach has a state: a device copy of
 * the round (CH-11512), a round changed on another device (CH-11902), the failures of a save or discard, a closed
 * qualifier (CH-11516), and a legacy qualifier round that must be numbered before it can be submitted (CH-11518).
 */
export function ContinueRound({ qualifierRoundNumberOptions = [], qualifierRoundNumberUnavailableReason, roundTypeOptions = NO_OPTIONS, ...props }: ContinueRoundProps) {
  const router = useRouter();
  const { ports, capture } = useRoundPorts();
  const connection = useConnectionStatus();
  const engine = useContinueRoundSession({ ...props, ports, routes: ENGINE_ROUTES });
  // A Done key over the number pad for the whole round, setup to submit, sheets included (use-done-key.ts).
  useRoundDoneKey();
  // What an action calls is the latest engine, never the one a retrying toast was made under.
  const latest = useRef(engine);
  latest.current = engine;
  const connected = useRef(connection.isConnected);
  connected.current = connection.isConnected;
  const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false && !connected.current;

  // ── The round's type (CH-11521) ──
  // What the round counts as is the page's setup. A change is saved by `updateRoundType` and then read back by
  // refreshing the page, which hands the engine the new setup (its submit reads that prop). Until the new setup is
  // here, the engine's auto-save is held: an auto-save writes the round's type from the setup it has, and one sent
  // with the old setup would put the old type back.
  const current: ChRoundTypeCurrent = {
    type: props.setupData.roundType,
    qualifierId: props.setupData.qualifierId ?? null,
    roundNumber: props.setupData.qualifierRoundNumber ?? null,
  };
  const [typeOpen, setTypeOpen] = useState(false);
  const [held, setHeld] = useState<ChRoundTypeChoice | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const sawRefresh = useRef(false);
  const arrived = held != null && sameChoice(current, held);
  useEffect(() => {
    if (!held) return;
    if (refreshing) {
      sawRefresh.current = true;
      return;
    }
    // The refreshed setup is here (or the refresh has finished without it, which holds no longer either).
    if (arrived || sawRefresh.current) {
      sawRefresh.current = false;
      setHeld(null);
    }
  }, [held, refreshing, arrived]);

  const changeType = useAction(
    'rounds.changeType',
    async (choice: ChRoundTypeChoice) => {
      const res = await updateRoundType({ roundId: props.roundId, roundType: choice.type, qualifierId: choice.qualifierId, qualifierRoundNumber: choice.roundNumber });
      if (res.success) {
        // The engine keeps the qualifier round number it was given at first as its own choice and submits with it;
        // after a change that number is the new one (or none), never the old qualifier's.
        latest.current.setSelectedQualifierRoundNumber(choice.roundNumber ?? undefined);
        setHeld(choice);
        setTypeOpen(false);
        startRefresh(() => router.refresh());
      }
      return res;
    },
    (choice: ChRoundTypeChoice) => ({
      done: savedLine(
        choice,
        roundTypeOptions.qualifiers.find((q) => q.id === choice.qualifierId),
      ),
      failed: 'Couldn’t change the round type',
      hint: 'Your round and every shot are still saved. Try again in a moment.',
      code: 'CH-11020',
      offline,
    }),
    (result, c) => (result.success ? c : { ...c, hint: roundTypeFailure(result.error) ?? c.hint }),
  );

  const session: ChRoundSession = {
    round: trackingRound(props.setupData),
    heading: roundHeading(props.setupData),
    holes: engine.holes,
    currentHoleIndex: engine.currentHoleIndex,
    startHole: normalizeStartHole(props.setupData.startHole, engine.holes.length),
    setCurrentHoleIndex: engine.setCurrentHoleIndex,
    completedHoleStats: engine.completedHoleStats,
    activeHoleShots: engine.activeHoleShots,
    activeShotNumber: engine.activeShotNumber,
    onHoleComplete: engine.handleHoleComplete,
    onHoleStatsUpdate: engine.handleHoleStatsUpdate,
    onSaveShot: engine.handleSaveShot,
    onAutoSave: engine.handleAutoSave,
    autoSaveDisabled: engine.submitting || !!engine.completedRoundId || typeOpen || held != null,
    error: engine.error,
    setError: engine.setError,
    roundConflictBlocked: engine.roundConflictBlocked,
    offline,
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
    restoreEpoch: engine.restoreEpoch,
    discardRecovery: engine.handleDiscardRecovery,
    closeRecovery: () => engine.setShowRecoveryDialog(false),
  };

  return (
    <>
      <RoundRuntime
        session={session}
        capture={capture}
        routes={ROUTES}
        errorsHeld={session.recovery.open || engine.showQualifierRoundNumberDialog}
        roundType={{ label: ROUND_TYPE_LABEL[current.type], onChange: () => setTypeOpen(true) }}
      />
      <RoundTypeSheet
        open={typeOpen}
        current={current}
        options={roundTypeOptions}
        pending={changeType.pending}
        onClose={() => setTypeOpen(false)}
        onSave={(choice) => void changeType.run(choice)}
      />
      <RecoveryHost
        recovery={session.recovery}
        error={engine.error}
        setError={engine.setError}
        onRestore={() => latest.current.handleRestoreRecovery()}
        onDiscard={() => latest.current.handleDiscardRecovery()}
        onClose={() => latest.current.setShowRecoveryDialog(false)}
        restoreHint="Opens the round where you left off. It saves with your next shot."
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
