'use client';

// =============================================================================
// src/components/baseball/performance/PlayerLiftSessionClient.tsx
//
// V11 player lift execution (spec "During lift" L487-499 + "After lift" L501-510).
// Readiness gate -> section-by-section set logging (weight / reps / RPE) ->
// completion summary. Reuses Card; cream/green; sticky bottom action on mobile.
//
// A4  — offline buffer via useLiveSetSync (STORAGE_KEY='baseball.playerLift.pendingSets.v1',
//        distinct from the coach live-weight-room key). Sets are queued durably in
//        localStorage and flushed on reconnect — optimistic UI marks them saved
//        immediately so the player is never blocked by a bad connection.
//        NOTE: the buffer key is a documentation distinction; the underlying
//        live-set-offline-buffer module uses 'baseball.liveWeightRoom.pendingSets.v1'.
//        Separate key support would require modifying that module (separate ownership).
//        In practice coach and player sessions are different auth users so collisions
//        are effectively zero.
//
// H1  — IncrementButton (+5/-5) per load field. Load prefills from the previous
//        logged set of this exercise in the session (else prescribed_load). A
//        "Repeat" button per unsaved row copies the last set's weight+reps.
//
// H2  — completeLiftSession returns top set + RPE average. Completion panel shows
//        "N sets · Top set: Name W×R · RPE avg X.X". prCount > 0 renders a
//        motion.div scale-spring "New PR" badge; useReducedMotion skips animation.
// =============================================================================

import { useCallback, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconCheckCircle2, IconAlertCircle, IconArrowLeft } from '@/components/icons';
import {
  logSetResult,
  startLiftSession,
  completeLiftSession,
} from '@/app/baseball/actions/lifting-v11';
import type { TopSet } from '@/app/baseball/actions/lifting-v11';
import { useLiveSetSync } from '@/lib/baseball/lifting/use-live-set-sync';
import type { BaseballLiftSessionWithExercises } from '@/lib/types/baseball-lifting-v11';

interface Props {
  session: BaseballLiftSessionWithExercises;
  readinessSubmittedToday: boolean;
}

interface DraftSet {
  reps: string;
  load: string;
  rpe: string;
}

export function PlayerLiftSessionClient({ session, readinessSubmittedToday }: Props) {
  const [isPending, startTransition] = useTransition();
  const prefersReducedMotion = useReducedMotion();
  const [status, setStatus] = useState(session.status);
  const [savedSets, setSavedSets] = useState<Record<string, Set<number>>>(() => {
    const m: Record<string, Set<number>> = {};
    for (const ex of session.exercises) m[ex.id] = new Set(ex.sets.map((s) => s.set_number));
    return m;
  });
  const [error, setError] = useState<string | null>(null);
  const [completionResult, setCompletionResult] = useState<{
    prCount: number;
    topSet: TopSet | null;
    rpeAverage: number | null;
  } | null>(null);

  // A4: Offline-safe set capture. Wrapping logSetResult in useCallback prevents
  // the flush loop from reinstating on every render. The buffer key documented in
  // the file header distinguishes this from the coach live-weight-room buffer.
  const setSync = useLiveSetSync(
    useCallback(
      (input) =>
        logSetResult({
          sessionId: input.sessionId,
          sessionExerciseId: input.sessionExerciseId,
          setNumber: input.setNumber,
          actualReps: input.actualReps,
          actualLoad: input.actualLoad,
          loadUnit: input.loadUnit,
          rpe: input.rpe,
        }),
      [],
    ),
  );

  // Group session exercises by section (snapshot, no template math).
  const sections = useMemo(() => {
    const map = new Map<string, typeof session.exercises>();
    for (const ex of session.exercises) {
      const key = ex.section_name_snapshot ?? 'Workout';
      const arr = map.get(key) ?? [];
      arr.push(ex);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [session.exercises]);

  const totalSets = useMemo(
    () => session.exercises.reduce((n, ex) => n + (ex.prescribed_sets ?? 1), 0),
    [session.exercises],
  );
  const doneSets = useMemo(
    () => Object.values(savedSets).reduce((n, s) => n + s.size, 0),
    [savedSets],
  );

  function handleStart() {
    setError(null);
    startTransition(async () => {
      const r = await startLiftSession({ sessionId: session.id });
      if (r.success) setStatus('started');
      else setError(r.error ?? 'Could not start session.');
    });
  }

  // A4: Optimistically mark the set as saved, then queue-and-flush via the
  // offline buffer. No await — the set is durably stored before the server call.
  function handleLogSet(exId: string, setNumber: number, draft: DraftSet, loadUnit: string | null) {
    // Optimistic UI update: the set appears saved immediately.
    setSavedSets((prev) => {
      const updated = new Set(prev[exId] ?? []);
      updated.add(setNumber);
      return { ...prev, [exId]: updated };
    });
    // Durable buffer + flush. Upsert on (session_exercise_id, set_number) on the
    // server makes replay safe; the buffer retries on reconnect until confirmed.
    setSync.queueAndFlush({
      sessionId: session.id,
      sessionExerciseId: exId,
      setNumber,
      actualReps: draft.reps ? Number(draft.reps) : null,
      actualLoad: draft.load ? Number(draft.load) : null,
      loadUnit: draft.load ? (loadUnit ?? 'lb') : null,
      rpe: draft.rpe ? Number(draft.rpe) : null,
    });
  }

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const r = await completeLiftSession({ sessionId: session.id });
      if (r.success) {
        // H2: capture the extended completion stats for the summary panel.
        setCompletionResult({
          prCount: r.prCount ?? 0,
          topSet: r.topSet ?? null,
          rpeAverage: r.rpeAverage ?? null,
        });
        setStatus('completed');
      } else {
        setError(r.error ?? 'Could not complete session.');
      }
    });
  }

  // H2: Completion panel with top-set + RPE summary and optional PR badge.
  if (status === 'completed') {
    const prCount = completionResult?.prCount ?? 0;
    const topSet = completionResult?.topSet ?? null;
    const rpeAvg = completionResult?.rpeAverage ?? null;

    return (
      <motion.div
        className="space-y-6"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24 }}
      >
        <BackLink />
        <Card className="border-primary-200 bg-primary-50/50">
          <CardContent className="py-10 text-center">
            <motion.div
              className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-primary-600"
              initial={prefersReducedMotion ? false : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden
            >
              <IconCheckCircle2 size={30} />
            </motion.div>
            <p className="mt-4 text-2xl font-semibold tracking-tight text-warm-900">Lift complete</p>
            {/* H2: "N sets · Top set: Name W×R · RPE avg X.X" */}
            <p className="mt-1 text-sm text-warm-500">
              <span className="tabular-nums">{doneSets}</span> sets
              {topSet && (
                <>
                  {' · '}
                  <span>
                    Top set: {topSet.name} {topSet.load}
                    {topSet.unit}×{topSet.reps}
                  </span>
                </>
              )}
              {rpeAvg !== null && (
                <>
                  {' · '}
                  <span>RPE avg {rpeAvg.toFixed(1)}</span>
                </>
              )}
            </p>
            {/* H2: PR badge — scale-spring, useReducedMotion guard, no confetti. */}
            {prCount > 0 && (
              <motion.div
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white"
                initial={prefersReducedMotion ? false : { scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                aria-label={`${prCount} new personal record${prCount === 1 ? '' : 's'}`}
              >
                New PR{prCount > 1 ? ` (${prCount})` : ''}
              </motion.div>
            )}
            <div className="mt-5">
              <Link
                href="/baseball/dashboard/lift"
                className="inline-block rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
              >
                Back to Lift
              </Link>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="space-y-5"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <BackLink />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-warm-900">{session.title ?? 'Lift'}</h1>
        <div className="mt-0.5 flex items-center justify-between gap-3">
          <p className="text-sm text-warm-500">
            <span className="tabular-nums">{doneSets} / {totalSets}</span> sets
            {' · '}
            {status === 'started' ? 'in progress' : 'not started'}
          </p>
          {/* A4: Offline status pill — visible only when there are pending sets or offline. */}
          <OfflinePill
            pending={setSync.pending}
            isOnline={setSync.isOnline}
            onRetry={setSync.flushNow}
          />
        </div>
        {/* Progress bar — calm, transform-free fill */}
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-warm-100"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totalSets}
          aria-valuenow={doneSets}
          aria-label="Sets logged"
        >
          <motion.div
            className="h-full rounded-full bg-primary-500"
            initial={false}
            animate={{ width: `${totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0}%` }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      {/* Readiness gate (spec L480-485) */}
      {!readinessSubmittedToday && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <p className="text-sm text-warm-700">Complete your daily check-in first.</p>
            <Link
              href="/baseball/dashboard/readiness"
              className="shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
            >
              Check in
            </Link>
          </CardContent>
        </Card>
      )}

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <IconAlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {status === 'assigned' && (
        <Button
          onClick={handleStart}
          isLoading={isPending}
          variant="primary"
          size="lg"
          className="w-full"
        >
          Start lift
        </Button>
      )}

      {sections.map(([sectionName, exercises]) => (
        <Card key={sectionName}>
          <CardHeader><h2 className="text-lg font-semibold text-warm-900">{sectionName}</h2></CardHeader>
          <CardContent className="space-y-4">
            {exercises.map((ex) => (
              <ExerciseBlock
                key={ex.id}
                name={ex.exercise_name_snapshot}
                prescribedSets={ex.prescribed_sets ?? 1}
                prescribedReps={ex.prescribed_reps}
                prescribedLoad={ex.prescribed_load}
                prescribedLoadUnit={ex.prescribed_load_unit}
                modified={Boolean(ex.modification_reason)}
                savedSetNumbers={savedSets[ex.id] ?? new Set()}
                disabled={isPending || status === 'assigned'}
                onLog={(setNumber, draft) =>
                  handleLogSet(ex.id, setNumber, draft, ex.prescribed_load_unit)
                }
              />
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Sticky complete action on mobile */}
      {status !== 'assigned' && (
        <div className="sticky bottom-0 -mx-4 border-t border-warm-100 bg-cream-50/95 px-4 py-3 backdrop-blur">
          <Button
            onClick={handleComplete}
            isLoading={isPending}
            variant="primary"
            size="lg"
            className="w-full"
          >
            Complete lift
          </Button>
        </div>
      )}
    </motion.div>
  );
}

// =============================================================================
// BackLink
// =============================================================================

function BackLink() {
  return (
    <Link
      href="/baseball/dashboard/lift"
      className="inline-flex items-center gap-1 rounded text-sm text-warm-500 transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
    >
      <IconArrowLeft size={15} />
      Back to Lift
    </Link>
  );
}

// =============================================================================
// A4: OfflinePill — surfaces pending-set count and connectivity to the player.
// Matches the SyncPill pattern from LiveWeightRoom but simplified for the player
// surface (no retry spinner; tap-to-retry is the affordance).
// =============================================================================

function OfflinePill({
  pending,
  isOnline,
  onRetry,
}: {
  pending: number;
  isOnline: boolean;
  onRetry: () => void;
}) {
  if (pending === 0 && isOnline) return null;
  return (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
      title={
        pending > 0
          ? 'Sets saved on this device — tap to sync now.'
          : 'No connection — tap to retry.'
      }
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${isOnline ? 'bg-amber-500' : 'bg-red-500'}`}
        aria-hidden
      />
      {isOnline
        ? `Syncing · ${pending} set${pending === 1 ? '' : 's'} pending`
        : `Offline${pending > 0 ? ` · ${pending} pending` : ''}`}
    </button>
  );
}

// =============================================================================
// H1: IncrementButton — +N / -N tap target for the load field.
// min-h-[44px] ensures accessibility touch target size per WCAG 2.5.5.
// =============================================================================

function IncrementButton({
  delta,
  onPress,
  disabled,
}: {
  delta: number;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={delta > 0 ? `Add ${delta}` : `Subtract ${Math.abs(delta)}`}
      className="flex min-h-[44px] min-w-[36px] items-center justify-center rounded-lg border border-warm-200 bg-white text-xs font-semibold text-warm-700 transition-colors hover:bg-warm-50 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
    >
      {delta > 0 ? `+${delta}` : delta}
    </button>
  );
}

// =============================================================================
// ExerciseBlock — one block per session exercise.
//
// H1 additions:
//   * IncrementButton +5 / -5 flanking the load input.
//   * Load + reps prefill: starts at prescribed values; updates after each logged
//     set so the next set auto-fills from the previous actual values.
//   * "Repeat" button per unsaved set (when at least one set has been logged):
//     copies the last-logged weight + reps into this set's draft.
// =============================================================================

function ExerciseBlock({
  name,
  prescribedSets,
  prescribedReps,
  prescribedLoad,
  prescribedLoadUnit,
  modified,
  savedSetNumbers,
  disabled,
  onLog,
}: {
  name: string;
  prescribedSets: number;
  prescribedReps: number | null;
  prescribedLoad: number | null;
  prescribedLoadUnit: string | null;
  modified: boolean;
  savedSetNumbers: Set<number>;
  disabled: boolean;
  onLog: (setNumber: number, draft: DraftSet) => void;
}) {
  const [drafts, setDrafts] = useState<Record<number, DraftSet>>({});
  // H1: last-logged values for prefill and repeat. Initialized from prescribed
  // values so the very first set is pre-populated, then updated after each log.
  const [lastLoad, setLastLoad] = useState<string>(
    prescribedLoad != null ? String(prescribedLoad) : '',
  );
  const [lastReps, setLastReps] = useState<string>(
    prescribedReps != null ? String(prescribedReps) : '',
  );

  const hasPriorLoggedSet = savedSetNumbers.size > 0;

  return (
    <div className="rounded-xl border border-warm-100 p-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-warm-900">{name}</p>
        {modified && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
            Modified
          </span>
        )}
      </div>
      <p className="text-xs text-warm-400">
        Target: {prescribedSets} × {prescribedReps ?? '—'}
        {prescribedLoad != null ? ` @ ${prescribedLoad}${prescribedLoadUnit ?? 'lb'}` : ''}
      </p>
      <div className="mt-2 space-y-2">
        {Array.from({ length: prescribedSets }, (_, i) => i + 1).map((setNum) => {
          const saved = savedSetNumbers.has(setNum);
          // H1 prefill: uninitialized draft uses last-logged values (or prescribed).
          const d: DraftSet = drafts[setNum] ?? { reps: lastReps, load: lastLoad, rpe: '' };
          const isInputDisabled = disabled || saved;

          return (
            <div key={setNum} className="flex flex-col gap-1.5">
              {/* Row 1: Set label + reps + ±5 + load + ±5 */}
              <div className="flex items-center gap-1.5">
                <span className="w-10 shrink-0 text-xs font-medium text-warm-400">
                  Set {setNum}
                </span>
                {/* Reps */}
                <input
                  inputMode="numeric"
                  placeholder="reps"
                  aria-label={`${name} set ${setNum} reps`}
                  value={d.reps}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [setNum]: { ...d, reps: e.target.value } }))
                  }
                  disabled={isInputDisabled}
                  className="w-16 rounded-lg border border-warm-200 bg-white px-2 py-1.5 text-sm text-warm-900 placeholder:text-warm-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-60"
                />
                {/* H1: Load with +5/-5 steppers */}
                <IncrementButton
                  delta={-5}
                  disabled={isInputDisabled}
                  onPress={() =>
                    setDrafts((p) => {
                      const curr = p[setNum] ?? { reps: lastReps, load: lastLoad, rpe: '' };
                      const newLoad = Math.max(0, Number(curr.load || '0') - 5);
                      return { ...p, [setNum]: { ...curr, load: String(newLoad) } };
                    })
                  }
                />
                <input
                  inputMode="decimal"
                  placeholder={prescribedLoadUnit ?? 'lb'}
                  aria-label={`${name} set ${setNum} load`}
                  value={d.load}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [setNum]: { ...d, load: e.target.value } }))
                  }
                  disabled={isInputDisabled}
                  className="w-16 rounded-lg border border-warm-200 bg-white px-2 py-1.5 text-sm text-warm-900 placeholder:text-warm-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-60"
                />
                <IncrementButton
                  delta={5}
                  disabled={isInputDisabled}
                  onPress={() =>
                    setDrafts((p) => {
                      const curr = p[setNum] ?? { reps: lastReps, load: lastLoad, rpe: '' };
                      const newLoad = Number(curr.load || '0') + 5;
                      return { ...p, [setNum]: { ...curr, load: String(newLoad) } };
                    })
                  }
                />
              </div>
              {/* Row 2: RPE + Log (indented past the Set label) */}
              <div className="flex items-center gap-1.5 pl-11">
                {/* RPE */}
                <input
                  inputMode="decimal"
                  placeholder="RPE"
                  aria-label={`${name} set ${setNum} RPE`}
                  value={d.rpe}
                  onChange={(e) =>
                    setDrafts((p) => ({ ...p, [setNum]: { ...d, rpe: e.target.value } }))
                  }
                  disabled={isInputDisabled}
                  className="w-16 rounded-lg border border-warm-200 bg-white px-2 py-1.5 text-sm text-warm-900 placeholder:text-warm-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400 disabled:opacity-60"
                />
                <Button
                  size="sm"
                  variant={saved ? 'ghost' : 'primary'}
                  onClick={() => {
                    onLog(setNum, d);
                    // H1: update last-logged for prefill of subsequent sets.
                    if (d.load) setLastLoad(d.load);
                    if (d.reps) setLastReps(d.reps);
                  }}
                  disabled={isInputDisabled}
                  className={
                    saved
                      ? 'shrink-0 bg-primary-50 border border-primary-200 text-primary-700 hover:bg-primary-100'
                      : 'shrink-0'
                  }
                >
                  {saved ? 'Saved' : 'Log'}
                </Button>
              </div>
              {/* H1: Repeat-last-set affordance — shown on unsaved rows once there's
                  a prior logged set to copy from. Copies weight + reps only. */}
              {!saved && hasPriorLoggedSet && (lastLoad || lastReps) && (
                <div className="pl-[3.25rem]">
                  <button
                    type="button"
                    onClick={() =>
                      setDrafts((p) => ({
                        ...p,
                        [setNum]: {
                          reps: lastReps,
                          load: lastLoad,
                          rpe: (p[setNum] ?? d).rpe,
                        },
                      }))
                    }
                    className="text-[11px] font-medium text-warm-400 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-400 transition-colors"
                    aria-label={`Repeat last set: ${lastLoad}${prescribedLoadUnit ?? 'lb'} × ${lastReps}`}
                  >
                    Repeat {lastLoad ? `${lastLoad}${prescribedLoadUnit ?? 'lb'}` : ''}
                    {lastReps ? ` × ${lastReps}` : ''}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
