'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { localDayIso } from '@/lib/golf/local-day';
import { useNewRoundSession } from '@/lib/golf/round-session/use-new-round-session';
import { haptic } from '../../../lib/haptics';
import { useToast } from '../../../ui/Toast';
import { RoundEntrySkeleton } from '../RoundsSkeleton';
import { RoundSetup } from '../setup/RoundSetup';
import type { ChSetupPorts, ChSetupQualifier } from '../setup/shape';
import { reasonText } from './labels';
import { InProgressConflictDialog } from './InProgressConflictDialog';
import { useRoundPorts } from './ports';
import { RecoveryHost, RoundRuntime, type RoundRuntimeRoutes } from './RoundRuntime';
import { ENGINE_ROUTES } from './routes';
import { roundHeading, trackingRound, type ChRoundSession } from './session';
import { loadSetupQualifiers, QUALIFIER_READ_MS, SETUP_READ_PORTS, startRefusal, toStartForm } from './setup-reads';

const LIBRARY = '/golf/dashboard/rounds';

const LOG_SOURCE = { component: 'ClubhouseNewRound', route: `${LIBRARY}/new` };
const ROUTES: RoundRuntimeRoutes = { library: LIBRARY, review: (roundId) => `${LIBRARY}/${roundId}` };

/**
 * /golf/dashboard/rounds/new in Clubhouse (P011, ROUNDS_PLAN steps 3 to 5): setup, then the round, over the new-round
 * engine (`useNewRoundSession`). The setup screen holds its own form and hands the whole of it to the engine's
 * `start(form)`; from there the engine owns the round and `step` says which screen is up. Every outcome the engine can
 * reach has a Clubhouse state: a saved round found on the device (CH-11512), a round already in progress for this
 * course and date (CH-11514), the refusals of a start (CH-11007, CH-11014 to CH-11016, CH-11907), the round's own
 * sheets and banners, and a closed qualifier (CH-11516). See `RoundRuntime`.
 */
export function NewRound({ playerId }: { playerId: string }) {
  const router = useRouter();
  const toast = useToast();
  const params = useSearchParams();
  const { ports, capture } = useRoundPorts();
  const engine = useNewRoundSession({ playerId, ports, routes: ENGINE_ROUTES, logSource: LOG_SOURCE });
  // A toast's Retry, and the setup screen's ports, are made once and outlive the render that made them, so what they
  // call is the latest engine (its `start` reads the state it was rendered with) and never the first one.
  const latest = useRef(engine);
  latest.current = engine;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const routerRef = useRef(router);
  routerRef.current = router;

  // Today is the device's day, the day the engine's own future-date gate reads (`localDayIso`), so a date the setup
  // offers is never one the engine then refuses. It is known after hydration, as the server has no device day.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(localDayIso()), []);

  const [qualifiers, setQualifiers] = useState<ChSetupQualifier[] | null | 'loading'>('loading');
  useEffect(() => {
    let alive = true;
    // A slow read must not keep a practice round from starting: past this it counts as not loaded (CH-11211), and it still lands if it arrives.
    const late = window.setTimeout(() => alive && setQualifiers((q) => (q === 'loading' ? null : q)), QUALIFIER_READ_MS);
    void loadSetupQualifiers().then((list) => alive && setQualifiers(list));
    return () => {
      alive = false;
      window.clearTimeout(late);
    };
  }, []);

  // Offline as the engine reads it: the browser says so and the connection probe agrees (WKWebView reports false on
  // networks that are reachable, so `navigator.onLine` alone would refuse a start that would work).
  const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false && !latest.current.connectionStatus.isConnected;

  const setupPorts = useMemo<ChSetupPorts>(
    () => ({
      ...SETUP_READ_PORTS,
      start: async (form) => {
        const result = await latest.current.start(toStartForm(form));
        if (result.ok) return { ok: true, data: { roundId: result.roundId } };
        const { open, ...refusal } = startRefusal(result);
        if (open) {
          // CH-11907: the qualifier's round is already under way, so it opens; starting is refused for good.
          toastRef.current({ title: 'You already have a round in progress for this qualifier', body: 'Opening it.', code: 'CH-11907' });
          routerRef.current.push(`${LIBRARY}/continue/${open}`);
        }
        return refusal;
      },
    }),
    [],
  );

  // ── The round already in progress for this course and date (CH-11514) ──
  // The engine's Discard runs only once it holds the confirm step (`discardConfirming`), and the dialog keeps that
  // step to itself, so the confirm is committed first and the discard runs from the render that has it.
  const [conflictAttempt, setConflictAttempt] = useState<'discard' | 'new' | null>(null);
  const discardWanted = useRef(false);
  useEffect(() => {
    if (discardWanted.current && engine.discardConfirming && engine.inProgressConflict) {
      discardWanted.current = false;
      void latest.current.handleConflictConfirmDiscard();
    }
  });
  useEffect(() => {
    if (conflictAttempt === 'discard' && !engine.inProgressConflict) setConflictAttempt(null);
  }, [conflictAttempt, engine.inProgressConflict]);
  // "Start a new round" closes the dialog and starts again; if that start is refused, the dialog is gone, so it is a toast.
  useEffect(() => {
    if (conflictAttempt !== 'new' || !engine.error || engine.step !== 'setup') return;
    haptic('error');
    toastRef.current({
      tone: 'error',
      title: `Couldn’t start your round at ${engine.setupData.courseName || 'the course'}`,
      body: reasonText(engine.error) ?? 'Nothing was saved yet. Start it again from setup.',
      code: 'CH-11007',
    });
    engine.setError('');
    setConflictAttempt(null);
  }, [conflictAttempt, engine, engine.error, engine.step]);
  useEffect(() => {
    if (conflictAttempt === 'new' && engine.step !== 'setup') setConflictAttempt(null);
  }, [conflictAttempt, engine.step]);

  const tracking = engine.step === 'tracking' || engine.step === 'submitting';
  // The setup and the round are different screens on one address: the new one opens at its top.
  useEffect(() => {
    document.getElementById('ch-canvas')?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  }, [tracking]);

  const completed = engine.completedHoleStats[engine.currentHoleIndex];
  const activeHoleShots = completed?.shots ?? engine.inProgressShotsByHole[engine.currentHoleIndex] ?? [];
  const session: ChRoundSession = {
    round: trackingRound(engine.setupData),
    heading: roundHeading(engine.setupData),
    holes: engine.holes,
    currentHoleIndex: engine.currentHoleIndex,
    setCurrentHoleIndex: engine.setCurrentHoleIndex,
    completedHoleStats: engine.completedHoleStats,
    activeHoleShots,
    activeShotNumber: activeHoleShots.length > 0 ? activeHoleShots.length + 1 : 1,
    onHoleComplete: engine.handleHoleComplete,
    onHoleStatsUpdate: engine.handleHoleStatsUpdate,
    onSaveShot: engine.handleSaveShot,
    onAutoSave: engine.handleAutoSave,
    autoSaveDisabled: engine.step === 'submitting' || !!engine.completedRoundId,
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
    submit: engine.handleRoundSubmit,
    submitting: engine.step === 'submitting',
    completedRoundId: engine.completedRoundId,
    qualifierClosed: engine.qualifierClosed,
    submitRetry: engine.handleSubmitRetry,
    submitGoBack: engine.handleSubmitGoBack,
    submitSaveAndExit: engine.handleSubmitSaveAndExit,
    submitDiscard: engine.handleSubmitDiscard,
    saveAsPractice: engine.handleSaveAsPractice,
    recovery: { open: engine.showNewRoundRecovery, data: engine.newRoundRecoveryData, restoring: engine.isRestoringRecovery },
    restoreRecovery: engine.handleRestoreRecovery,
    discardRecovery: engine.handleDiscardRecovery,
    closeRecovery: () => engine.setShowNewRoundRecovery(false),
  };

  const conflict = engine.inProgressConflict;
  return (
    <>
      {tracking ? (
        <RoundRuntime session={session} capture={capture} routes={ROUTES} errorsHeld={session.recovery.open || !!conflict} />
      ) : today === null || qualifiers === 'loading' ? (
        <RoundEntrySkeleton />
      ) : (
        <RoundSetup
          ports={setupPorts}
          qualifiers={qualifiers}
          today={today}
          backHref={LIBRARY}
          onStarted={() => undefined}
          preselectQualifierId={params.get('qualifier')}
          isOffline={offline}
        />
      )}
      <RecoveryHost
        recovery={session.recovery}
        error={engine.error}
        setError={engine.setError}
        onRestore={() => latest.current.handleRestoreRecovery()}
        onDiscard={() => latest.current.handleDiscardRecovery()}
        onClose={() => latest.current.setShowNewRoundRecovery(false)}
      />
      <InProgressConflictDialog
        open={!!conflict}
        course={engine.setupData.courseName || null}
        scoredHoles={conflict?.scoredHoles ?? 0}
        holesTotal={engine.holesPerRound}
        updatedAt={conflict?.updatedAt ?? null}
        busy={engine.conflictActionBusy}
        error={conflict && conflictAttempt === 'discard' && engine.error ? engine.error : null}
        onResume={() => latest.current.handleConflictResume()}
        onStartSeparate={() => {
          setConflictAttempt('new');
          latest.current.setError('');
          void latest.current.handleConflictStartNewRound();
        }}
        onDiscard={() => {
          setConflictAttempt('discard');
          latest.current.setError('');
          discardWanted.current = true;
          latest.current.setDiscardConfirming(true);
        }}
        onClose={() => {
          latest.current.setInProgressConflict(null);
          latest.current.setDiscardConfirming(false);
          setConflictAttempt(null);
        }}
      />
    </>
  );
}
