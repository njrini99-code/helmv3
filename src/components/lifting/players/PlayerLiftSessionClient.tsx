'use client';

// =============================================================================
// src/components/lifting/players/PlayerLiftSessionClient.tsx
//
// LIFTING LAB — Player-facing session execution surface.
// Readiness gate → section-by-section set logging (reps / load / RPE) → completion.
// Reads helm_lifting_sessions / _session_exercises / _set_results.
// Writes via athlete-self server actions; RLS enforces ownership.
//
// Mirrors src/components/baseball/performance/PlayerLiftSessionClient.tsx but
// reads from helm_lifting_* instead of baseball_lift_*, and calls Lab actions
// (logSetResult from sessions.ts for set logging; inline server actions for
// start/complete because advanceSessionLifecycle requires requireEdit:true).
//
// Routes back to /lifting/dashboard/lift.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconCheckCircle2, IconAlertCircle, IconArrowLeft } from '@/components/icons';
import type {
  HelmLiftingSessionWithExercises,
  HelmLiftingSessionStatus,
} from '@/lib/types';
import {
  startMySession,
  logMySetResult,
  completeMySession,
} from '@/app/lifting/actions/player-sessions';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  session: HelmLiftingSessionWithExercises;
  /** athlete-self's helm_lifting_athletes.id — passed to set logging */
  athleteId: string;
  readinessSubmittedToday: boolean;
}

interface DraftSet {
  reps: string;
  load: string;
  rpe: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PlayerLiftSessionClient({
  session,
  athleteId,
  readinessSubmittedToday,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const prefersReducedMotion = useReducedMotion();
  const [status, setStatus] = useState<HelmLiftingSessionStatus>(session.status);
  const [savedSets, setSavedSets] = useState<Record<string, Set<number>>>(() => {
    const m: Record<string, Set<number>> = {};
    for (const ex of session.exercises) {
      m[ex.id] = new Set(ex.sets.map((s) => s.set_number));
    }
    return m;
  });
  const [error, setError] = useState<string | null>(null);

  // Group exercises by section snapshot
  const sections = useMemo(() => {
    const map = new Map<string, typeof session.exercises>();
    for (const ex of session.exercises) {
      const key = ex.section_name_snapshot ?? 'Workout';
      const arr = map.get(key) ?? [];
      arr.push(ex);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [session]);

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
      const r = await startMySession(session.id);
      if (r.success) setStatus('started');
      else setError(r.error ?? 'Could not start session.');
    });
  }

  function handleLogSet(
    exId: string,
    setNumber: number,
    draft: DraftSet,
    loadUnit: string | null,
  ) {
    setError(null);
    startTransition(async () => {
      const r = await logMySetResult({
        sessionId: session.id,
        sessionExerciseId: exId,
        athleteId,
        setNumber,
        actualReps: draft.reps ? Number(draft.reps) : null,
        actualLoad: draft.load ? Number(draft.load) : null,
        loadUnit: draft.load ? (loadUnit ?? 'lb') : null,
        rpe: draft.rpe ? Number(draft.rpe) : null,
      });
      if (r.success) {
        setSavedSets((prev) => {
          const updated = new Set(prev[exId] ?? []);
          updated.add(setNumber);
          return { ...prev, [exId]: updated };
        });
        // Auto-advance to started after first set
        if (status === 'assigned') setStatus('started');
      } else {
        setError('Could not save set. Try again.');
      }
    });
  }

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const r = await completeMySession(session.id);
      if (r.success) setStatus('completed');
      else setError(r.error ?? 'Could not complete session.');
    });
  }

  // Completion screen
  if (status === 'completed') {
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
            <p className="mt-4 text-2xl font-semibold tracking-tight text-warm-900">
              Lift complete
            </p>
            <p className="mt-1 text-sm text-warm-500">
              Nice work — {doneSets} of {totalSets} sets logged.
            </p>
            <Link
              href="/lifting/dashboard/lift"
              className="mt-5 inline-block rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
            >
              Back to Lift
            </Link>
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

      {/* Session header + progress */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-warm-900">
          {session.title ?? 'Lift'}
        </h1>
        <p className="mt-0.5 text-sm text-warm-500">
          <span className="tabular-nums">{doneSets} / {totalSets}</span> sets ·{' '}
          {status === 'started' ? 'in progress' : 'not started'}
        </p>
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
            animate={{
              width: `${totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0}%`,
            }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }
            }
          />
        </div>
      </div>

      {/* Readiness gate */}
      {!readinessSubmittedToday && (
        <Card className="border-warning/30 bg-warning/10">
          <CardContent className="flex items-center justify-between gap-3 py-4">
            <p className="text-sm text-warm-700">
              Complete your daily check-in before logging sets.
            </p>
            <Link
              href="/lifting/dashboard/readiness"
              className="shrink-0 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50"
            >
              Check in
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <IconAlertCircle size={15} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Start CTA */}
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

      {/* Exercise sections */}
      {sections.map(([sectionName, exercises]) => (
        <Card key={sectionName}>
          <CardHeader>
            <h2 className="text-lg font-semibold text-warm-900">{sectionName}</h2>
          </CardHeader>
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

      {/* Sticky complete action */}
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

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function BackLink() {
  return (
    <Link
      href="/lifting/dashboard/lift"
      className="inline-flex items-center gap-1 rounded text-sm text-warm-500 transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
    >
      <IconArrowLeft size={15} />
      Back to Lift
    </Link>
  );
}

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

  return (
    <div className="rounded-xl border border-warm-100 p-3">
      <div className="flex items-center justify-between">
        <p className="font-medium text-warm-900">{name}</p>
        {modified && (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-micro font-medium text-warning">
            Modified
          </span>
        )}
      </div>
      <p className="text-xs text-warm-400">
        Target: {prescribedSets} × {prescribedReps ?? '—'}
        {prescribedLoad != null
          ? ` @ ${prescribedLoad}${prescribedLoadUnit ?? 'lb'}`
          : ''}
      </p>
      <div className="mt-2 space-y-2">
        {Array.from({ length: prescribedSets }, (_, i) => i + 1).map((setNum) => {
          const saved = savedSetNumbers.has(setNum);
          const d = drafts[setNum] ?? { reps: '', load: '', rpe: '' };
          return (
            <div key={setNum} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-xs font-medium text-warm-400">
                Set {setNum}
              </span>
              <Input
                inputMode="numeric"
                placeholder="reps"
                aria-label={`${name} set ${setNum} reps`}
                value={d.reps}
                onChange={(e) =>
                  setDrafts((p) => ({ ...p, [setNum]: { ...d, reps: e.target.value } }))
                }
                className="w-16 min-h-0 rounded-lg bg-cream-50 px-2 py-1.5 text-sm focus:ring-1 focus-visible:ring-1"
              />
              <Input
                inputMode="decimal"
                placeholder={prescribedLoadUnit ?? 'lb'}
                aria-label={`${name} set ${setNum} load`}
                value={d.load}
                onChange={(e) =>
                  setDrafts((p) => ({ ...p, [setNum]: { ...d, load: e.target.value } }))
                }
                className="w-16 min-h-0 rounded-lg bg-cream-50 px-2 py-1.5 text-sm focus:ring-1 focus-visible:ring-1"
              />
              <Input
                inputMode="decimal"
                placeholder="RPE"
                aria-label={`${name} set ${setNum} RPE`}
                value={d.rpe}
                onChange={(e) =>
                  setDrafts((p) => ({ ...p, [setNum]: { ...d, rpe: e.target.value } }))
                }
                className="w-16 min-h-0 rounded-lg bg-cream-50 px-2 py-1.5 text-sm focus:ring-1 focus-visible:ring-1"
              />
              <Button
                size="sm"
                variant={saved ? 'ghost' : 'primary'}
                onClick={() => onLog(setNum, d)}
                disabled={disabled || saved}
                className={
                  saved
                    ? 'shrink-0 border border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100'
                    : 'shrink-0'
                }
              >
                {saved ? 'Saved' : 'Log'}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
