'use client';

import { Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { haptic } from '../../../lib/haptics';
import { useAction, type ActionResult, type ServerResult } from '../../../lib/use-action';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { ExitSheet, RoundCompleteSheet, ScorecardSheet, SubmitOverlay } from '../track/round-sheets';
import { RoundTracking } from '../track/RoundTracking';
import { reasonText } from './labels';
import type { RoundNotices } from './ports';
import { RecoveryDialog } from './RecoveryDialog';
import { ReloadBanner, RoundErrorBanner } from './ReloadBanner';
import { QUALIFIER_CLOSED_REASON, SaveAsPracticeSheet } from './SaveAsPracticeSheet';
import { cardHoles, outcomeOf, recoveryFacts, summaryHoles, type ChRecovery, type ChRoundSession } from './session';
import { useEntryFailureToast } from './failures';
import '../../../styles/rounds-track.css';

/** After a round posts, its review opens once the check has had a moment (the legacy overlay counted three seconds). */
export const POSTED_OPEN_MS = 2500;
/** Submitting for this long says it is slow and names a way out (the legacy overlay's 15 second escape). CH-11909. */
export const SUBMIT_SLOW_MS = 15_000;

type Capture = <T>(run: () => Promise<T>) => Promise<{ value?: T; thrown?: unknown; notices: RoundNotices }>;

/** What an action of the round tells useAction beyond success: where it was asked, and whether its outcome is still to come. */
interface Meta {
  via?: 'exit' | 'closed';
  /** The engine reports the outcome itself (it leaves the screen, or sets its `error`): nothing to say yet. */
  pending?: boolean;
  /** The failure is a line on the sheet that asked, not a toast. */
  inline?: boolean;
}
const errorOf = (result: ActionResult<unknown>) => (result.success ? undefined : result.error);

/** An action of the round that reports its outcome somewhere other than a toast. */
type Running = 'exit-discard' | 'closed-discard' | 'practice' | null;
type Failed = { kind: 'exit-discard' | 'practice'; error: string } | null;

/** How the engine's own screen-wide routes look to the round: where a round goes to be reviewed, and where Rounds is. */
export interface RoundRuntimeRoutes {
  library: string;
  review: (roundId: string) => string;
}

/**
 * The round, once it is being played: the shot screen, and everything the round owns around it. It is written over a
 * `ChRoundSession`, so the new-round and the continue screens share it (ROUNDS_PLAN step 5): the Exit sheet (Save for
 * later, Keep playing, Discard), the scorecard, the finished round and its submit, the closed-qualifier sheet, the
 * reload and error banners, and what to do when a save or a discard fails.
 *
 * Every action reads the latest session through a ref. A toast's Retry runs the action as it was first made, so a
 * handler closed over an earlier render would save with that render's round id and state; and each action that must
 * not run twice (a Retry can overlap a tap) holds its own in-flight ref, because `useAction`'s guard is state that
 * the retrying closure never sees. Failures of the actions with a place of their own are drawn there: Discard on
 * the Exit sheet in its question (CH-11006), a change to practice on its sheet (CH-11012); Save for later and a
 * Discard from the closed-qualifier sheet are toasts with Retry (CH-11010, CH-11011).
 */
export function RoundRuntime({
  session,
  capture,
  routes,
  errorsHeld = false,
}: {
  session: ChRoundSession;
  capture: Capture;
  routes: RoundRuntimeRoutes;
  /** A dialog outside the runtime (the recovery dialog) holds the engine's error line, so no banner says it twice. */
  errorsHeld?: boolean;
}) {
  const router = useRouter();
  const failToast = useEntryFailureToast();
  const s = useRef(session);
  s.current = session;

  const [sheet, setSheet] = useState<'exit' | 'card' | null>(null);
  const [running, setRunning] = useState<Running>(null);
  const [failed, setFailed] = useState<Failed>(null);
  const [reloading, setReloading] = useState(false);
  const [slow, setSlow] = useState(false);
  const saving = useRef(false);
  const discarding = useRef(false);
  const practicing = useRef(false);
  const course = session.round.course;

  const exitOpen = sheet === 'exit' || session.engineExitOpen;
  const closedOpen = session.submitting && session.qualifierClosed && !session.completedRoundId;
  const overlayOpen = session.submitting && !closedOpen;
  const overlayState = session.completedRoundId ? 'done' : session.error && !session.qualifierClosed ? 'failed' : 'saving';
  const finishOpen = !!session.pendingFinalStats && session.showFinishConfirm && !session.submitting;

  // The sentence the closed-qualifier sheet says: the refusal the engine gave when it turned closed. The engine's
  // error is overwritten by a failed change to practice, so it is kept here.
  const [closedReason, setClosedReason] = useState('');
  useEffect(() => {
    if (session.qualifierClosed) setClosedReason((r) => r || session.error || QUALIFIER_CLOSED_REASON);
    else setClosedReason('');
  }, [session.qualifierClosed, session.error]);

  const closeExit = () => {
    setSheet(null);
    s.current.setEngineExitOpen(false);
    setFailed((f) => (f?.kind === 'exit-discard' ? null : f));
  };

  // Save for later (CH-11010): a failed save is a toast with Retry; the navigation that follows a save is the engine's,
  // inside the action, so Retry does it too. `via` is where it was asked: the Exit sheet, or the closed-qualifier sheet.
  const save = useAction<['exit' | 'closed'], Meta>(
    'rounds.saveForLater',
    async (via): Promise<ServerResult<Meta>> => {
      if (saving.current) return { success: false, error: 'busy' };
      saving.current = true;
      try {
        const out = outcomeOf(await capture(() => (via === 'closed' ? s.current.submitSaveAndExit() : s.current.saveForLater())));
        if (out.conflict) return { success: false, error: 'conflict' };
        return out.failed ? { success: false, error: out.reason } : { success: true };
      } finally {
        saving.current = false;
      }
    },
    () => ({ done: '', failed: `Couldn’t save your round at ${course}`, hint: 'Your shots are still on this device. Check your connection, then try again.', code: 'CH-11010', offline: () => s.current.offline() }),
    (result, c) => (errorOf(result) === 'busy' || errorOf(result) === 'conflict' ? { ...c, quiet: true } : { ...c, hint: reasonText(errorOf(result)) ?? c.hint }),
  );

  // Discard. From the Exit sheet a failure is a line in its own question (CH-11006); from the closed-qualifier sheet,
  // which has no question to hold it, a toast with Retry (CH-11011). The new-round engine reports a failed discard
  // only through its `error`, so what the action can't see is finished by the effect below.
  const discard = useAction<['exit' | 'closed'], Meta>(
    'rounds.discardRound',
    async (via): Promise<ServerResult<Meta>> => {
      if (discarding.current) return { success: false, error: 'busy' };
      discarding.current = true;
      s.current.setError('');
      setFailed(null);
      setRunning(via === 'exit' ? 'exit-discard' : 'closed-discard');
      const out = outcomeOf(await capture(() => (via === 'closed' ? s.current.submitDiscard() : s.current.deleteRound())));
      if (out.conflict) {
        discarding.current = false;
        setRunning(null);
        return { success: false, error: 'conflict' };
      }
      if (out.failed) {
        discarding.current = false;
        setRunning(null);
        if (via === 'exit') setFailed({ kind: 'exit-discard', error: reasonText(out.reason) ?? 'It is still saved. Try again, or keep playing.' });
        return { success: false, error: out.reason, data: { via } };
      }
      // The engine leaves the screen when a discard works. A failure it reports only as `error` comes later.
      return { success: true, data: { pending: true } };
    },
    () => ({ done: '', failed: `Couldn’t discard the round at ${course}`, hint: 'It is still saved. Try again, or keep playing.', code: 'CH-11011', offline: () => s.current.offline() }),
    (result, c) => {
      const error = errorOf(result);
      if (error === 'busy' || error === 'conflict' || result.data?.via === 'exit' || result.data?.pending) return { ...c, quiet: true };
      return { ...c, hint: reasonText(error) ?? c.hint };
    },
  );

  // Change to practice (CH-11012): the closed-qualifier sheet's primary. A failure is a line on the sheet.
  const practice = useAction<[], Meta>(
    'rounds.saveAsPractice',
    async (): Promise<ServerResult<Meta>> => {
      if (practicing.current) return { success: false, error: 'busy' };
      practicing.current = true;
      s.current.setError('');
      setFailed(null);
      setRunning('practice');
      const out = outcomeOf(await capture(() => s.current.saveAsPractice()));
      if (out.failed && !out.conflict) {
        practicing.current = false;
        setRunning(null);
        setFailed({ kind: 'practice', error: out.reason ?? 'Your round is still saved. Try again in a moment.' });
      }
      return out.failed ? { success: false, error: out.reason, data: { inline: true } } : { success: true, data: { pending: true } };
    },
    () => ({ done: '', failed: 'Couldn’t change this round to practice', code: 'CH-11012', offline: () => s.current.offline() }),
    (_result, c) => ({ ...c, quiet: true }),
  );

  const discardRun = useRef(discard.run);
  discardRun.current = discard.run;

  // An action whose failure comes back as the engine's `error`: pick it up, and give it to the surface that asked.
  useEffect(() => {
    if (!running || !session.error) return;
    const reason = session.error;
    haptic('error');
    if (running === 'exit-discard') {
      discarding.current = false;
      setFailed({ kind: 'exit-discard', error: reasonText(reason) ?? 'It is still saved. Try again, or keep playing.' });
    } else if (running === 'closed-discard') {
      discarding.current = false;
      // The toast's Retry runs later, so it calls the latest `run`: this render's still holds the `pending` of the
      // attempt that has just failed, and would refuse the retry as a second tap.
      failToast('discard-round', { course, reason, run: () => void discardRun.current('closed') });
    } else {
      practicing.current = false;
      setFailed({ kind: 'practice', error: reasonText(reason) ?? 'Your round is still saved. Try again in a moment.' });
    }
    setRunning(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `failToast` and `course` follow the render; the effect runs when an attempt or the engine's error changes
  }, [running, session.error]);

  // A change to practice that worked leaves the closed state; nothing else is left to wait for.
  useEffect(() => {
    if (running === 'practice' && !session.qualifierClosed) {
      practicing.current = false;
      setRunning(null);
    }
  }, [running, session.qualifierClosed]);

  // A round that posted: the success tick, then its review opens. The tick is once per round; the review opens from a
  // timer that only a new round (or leaving) clears, so a redraw with a new router object can't lose the navigation.
  const routerRef = useRef(router);
  routerRef.current = router;
  const routesRef = useRef(routes);
  routesRef.current = routes;
  const ticked = useRef<string | null>(null);
  useEffect(() => {
    const id = session.completedRoundId;
    if (!id) return undefined;
    if (ticked.current !== id) {
      ticked.current = id;
      haptic('success');
    }
    const t = window.setTimeout(() => routerRef.current.push(routesRef.current.review(id)), POSTED_OPEN_MS);
    return () => window.clearTimeout(t);
  }, [session.completedRoundId]);

  // Submitting for too long: say so once, with a way out (CH-11909).
  useEffect(() => {
    if (!overlayOpen || overlayState !== 'saving') {
      setSlow(false);
      return undefined;
    }
    const t = window.setTimeout(() => setSlow(true), SUBMIT_SLOW_MS);
    return () => window.clearTimeout(t);
  }, [overlayOpen, overlayState]);

  const banner =
    session.roundConflictBlocked ? (
      <ReloadBanner
        reloading={reloading}
        onReload={() => {
          setReloading(true);
          window.location.reload();
        }}
      />
    ) : session.error && !errorsHeld && !session.submitting && !exitOpen && running === null ? (
      <RoundErrorBanner message={session.error} onDismiss={() => s.current.setError('')} />
    ) : null;
  const ready =
    session.pendingFinalStats && !session.showFinishConfirm && !session.submitting ? (
      <div className="ch-rt-note" data-ch-code="CH-11910">
        <Icon icon={Send} size={15} />
        <span>
          <b>All holes are in.</b> Review the round, then submit it.
        </span>
        <Button variant="primary" size="sm" onClick={() => s.current.setShowFinishConfirm(true)}>
          Review and submit
        </Button>
      </div>
    ) : null;

  const card = cardHoles(session.holes, session.completedHoleStats);
  const current = session.holes[session.currentHoleIndex]?.number ?? 1;
  const shots = (session.pendingFinalStats ?? session.completedHoleStats).reduce((n, h) => n + (h?.shots.length ?? 0), 0);

  return (
    <>
      <RoundTracking
        key={session.restoreEpoch ?? 0}
        round={session.round}
        holes={session.holes}
        currentHoleIndex={session.currentHoleIndex}
        initialShots={session.activeHoleShots}
        initialShotNumber={session.activeShotNumber}
        onHoleComplete={session.onHoleComplete}
        onHoleStatsUpdate={session.onHoleStatsUpdate}
        onSaveShot={session.onSaveShot}
        onExit={() => setSheet('exit')}
        onNavigateToHole={session.setCurrentHoleIndex}
        onOpenScorecard={() => setSheet('card')}
        onAutoSave={session.onAutoSave}
        autoSaveInterval={15000}
        autoSaveDisabled={session.autoSaveDisabled}
        statusSlot={
          banner || ready ? (
            <>
              {banner}
              {ready}
            </>
          ) : undefined
        }
      />
      <ExitSheet
        open={exitOpen}
        course={course}
        holes={card}
        currentNumber={current}
        discarding={running === 'exit-discard'}
        saving={save.pending}
        discardError={failed?.kind === 'exit-discard' ? failed.error : null}
        onSave={() => void save.run('exit')}
        onKeep={closeExit}
        onDiscard={() => void discard.run('exit')}
      />
      <ScorecardSheet open={sheet === 'card'} onClose={() => setSheet(null)} course={course} tee={session.round.teeLabel} holes={card} current={current} />
      <RoundCompleteSheet
        open={finishOpen}
        heading={session.heading}
        holes={summaryHoles(session.holes, session.pendingFinalStats ?? [])}
        onBack={() => s.current.setShowFinishConfirm(false)}
        onSubmit={() => {
          const stats = s.current.pendingFinalStats;
          if (!stats) return;
          s.current.setShowFinishConfirm(false);
          void s.current.submit(stats);
        }}
      />
      {overlayOpen && (
        <SubmitOverlay
          state={overlayState}
          course={course}
          shots={shots}
          coach={null}
          reviewHref={session.completedRoundId ? routes.review(session.completedRoundId) : null}
          error={session.error || null}
          onRetry={() => s.current.submitRetry()}
          onGoBack={() => s.current.submitGoBack()}
          slowHref={slow ? routes.library : null}
        />
      )}
      <SaveAsPracticeSheet
        open={closedOpen}
        reason={closedReason}
        pending={practice.pending || running === 'practice' ? 'practice' : running === 'closed-discard' ? 'discard' : save.pending ? 'save' : null}
        error={failed?.kind === 'practice' ? failed.error : null}
        onSaveAsPractice={() => void practice.run()}
        onSaveForLater={() => void save.run('closed')}
        onGoBack={() => s.current.submitGoBack()}
        onDiscard={() => void discard.run('closed')}
      />
    </>
  );
}

/**
 * CH-11512 over an engine's device copy: what was found, Restore, and Discard saved shots. Its failure (CH-11008) is
 * the engine's `error` while the dialog is open (nothing else is running then), cleared when Restore is tapped again;
 * one restore runs at a time, though the engine's own flag is state that a quick second tap can beat.
 */
export function RecoveryHost({
  recovery,
  error,
  setError,
  onRestore,
  onDiscard,
  onClose,
  restoreHint,
}: {
  recovery: ChRecovery;
  error: string;
  setError: (message: string) => void;
  onRestore: () => Promise<unknown> | void;
  onDiscard: () => void;
  onClose: () => void;
  /** Restore's hint, when the engine's restore is not a server write (see `RecoveryDialog`). */
  restoreHint?: string;
}) {
  const busy = useRef(false);
  const facts = recoveryFacts(recovery.data);
  return (
    <RecoveryDialog
      open={recovery.open && !!recovery.data}
      course={facts.course}
      tees={facts.tees}
      type={facts.type}
      holesDone={facts.holesDone}
      holesTotal={facts.holesTotal}
      savedAt={facts.savedAt}
      restoring={recovery.restoring}
      error={recovery.open && error ? error : null}
      restoreHint={restoreHint}
      onRestore={() => {
        if (busy.current) return;
        busy.current = true;
        setError('');
        void Promise.resolve(onRestore()).finally(() => {
          busy.current = false;
        });
      }}
      onDiscard={onDiscard}
      onClose={onClose}
    />
  );
}
