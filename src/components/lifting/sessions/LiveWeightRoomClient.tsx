'use client';

// =============================================================================
// src/components/lifting/sessions/LiveWeightRoomClient.tsx
//
// Helm Lifting Lab — live weight room. Native Lab UI consuming HelmLifting*
// types directly. Full-width sticky header (today · completion · risk) +
// athlete grid with readiness band, current exercise, load, RPE, and a
// per-athlete detail drawer for set logging + load adjustments.
//
// WRITE MODEL: optimistic with rollback. Changes apply to local state
// immediately, fire the server action, and on failure revert + toast error.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { IconDumbbell, IconCheck, IconAlertCircle, IconUsers, IconRefresh } from '@/components/icons';
import {
  advanceSessionLifecycle,
  logSetResult,
} from '@/app/lifting/actions/sessions';
import type {
  HelmLiftingLiveAthleteRow,
  HelmLiftingSessionStatus,
  HelmLiftingReadinessBand,
} from '@/lib/types/helm-lifting-data';

const BAND_META: Record<HelmLiftingReadinessBand, { label: string; cls: string }> = {
  green: { label: 'Ready', cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  yellow: { label: 'Caution', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  orange_lower: { label: 'Limited', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  orange_upper: { label: 'At risk', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
  red: { label: 'Hold', cls: 'bg-red-50 text-red-600 border-red-200' },
  blue: { label: 'Sick', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
};

const STATUS_META: Record<HelmLiftingSessionStatus, { label: string; cls: string }> = {
  assigned: { label: 'Not started', cls: 'bg-warm-50 text-warm-600 border-warm-200' },
  started: { label: 'In progress', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  completed: { label: 'Complete', cls: 'bg-primary-50 text-primary-700 border-primary-200' },
  modified: { label: 'Modified', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  missed: { label: 'Missed', cls: 'bg-red-50 text-red-600 border-red-200' },
  excused: { label: 'Excused', cls: 'bg-warm-50 text-warm-500 border-warm-200' },
};

interface Props {
  initialAthletes: HelmLiftingLiveAthleteRow[];
  exerciseLibrary: Array<{ id: string; name: string; category: string | null }>;
  orgId: string;
  canEdit: boolean;
}

export function LiveWeightRoomClient({ initialAthletes, orgId, canEdit }: Props) {
  const prefersReducedMotion = useReducedMotion();
  const [isPending, startTransition] = useTransition();
  const [athletes, setAthletes] = useState(initialAthletes);
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  // Computed stats.
  const stats = useMemo(() => {
    const completed = athletes.filter((a) => a.session_status === 'completed').length;
    const atRisk = athletes.filter(
      (a) => a.readiness_band && ['red', 'orange_lower', 'orange_upper'].includes(a.readiness_band),
    ).length;
    const needsCoach = athletes.filter((a) => a.needs_coach).length;
    const total = athletes.length;
    return { completed, atRisk, needsCoach, total };
  }, [athletes]);

  // All group names for filter tabs.
  const allGroups = useMemo(() => {
    const names = new Set<string>();
    for (const a of athletes) for (const g of a.group_names) names.add(g);
    return [...names].sort();
  }, [athletes]);

  const visible = useMemo(() => {
    if (!groupFilter) return athletes;
    return athletes.filter((a) => a.group_names.includes(groupFilter));
  }, [athletes, groupFilter]);

  const selectedAthlete = useMemo(
    () => athletes.find((a) => a.athlete_id === selectedAthleteId) ?? null,
    [athletes, selectedAthleteId],
  );

  // Drawer state.
  const [setNum, setSetNum] = useState(1);
  const [actualReps, setActualReps] = useState('');
  const [actualLoad, setActualLoad] = useState('');
  const [rpe, setRpe] = useState('');

  function handleComplete(athlete: HelmLiftingLiveAthleteRow) {
    const prev = athletes.map((a) => ({ ...a }));
    setAthletes((arr) =>
      arr.map((a) =>
        a.session_id === athlete.session_id ? { ...a, session_status: 'completed' } : a,
      ),
    );
    startTransition(async () => {
      const result = await advanceSessionLifecycle({
        orgId,
        sessionId: athlete.session_id,
        newStatus: 'completed',
      });
      if (!result.success) {
        setAthletes(prev);
        toast.error('Failed to mark session complete.');
      }
    });
  }

  function handleLogSet(athlete: HelmLiftingLiveAthleteRow) {
    const currentExercise = athlete.exercises[0];
    if (!currentExercise) return;
    const prev = athletes.map((a) => ({ ...a }));
    // Optimistic: update last_update + status.
    setAthletes((arr) =>
      arr.map((a) =>
        a.athlete_id === athlete.athlete_id
          ? {
              ...a,
              actual_load: actualLoad ? parseFloat(actualLoad) : a.actual_load,
              rpe: rpe ? parseFloat(rpe) : a.rpe,
              last_update: new Date().toISOString(),
              session_status: a.session_status === 'assigned' ? 'started' : a.session_status,
            }
          : a,
      ),
    );
    startTransition(async () => {
      const result = await logSetResult({
        orgId,
        sessionExerciseId: currentExercise.id,
        athleteId: athlete.athlete_id,
        setNumber: setNum,
        actualReps: actualReps ? parseInt(actualReps, 10) : null,
        actualLoad: actualLoad ? parseFloat(actualLoad) : null,
        rpe: rpe ? parseFloat(rpe) : null,
      });
      if (!result.success) {
        setAthletes(prev);
        toast.error('Failed to log set.');
      } else {
        toast.success('Set logged.');
        setSetNum((n) => n + 1);
        setActualReps('');
        setActualLoad('');
        setRpe('');
      }
    });
  }

  function getFullName(a: HelmLiftingLiveAthleteRow) {
    return [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Unnamed';
  }

  return (
    <div className="flex h-screen flex-col bg-[#FFFEFA]">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-20 border-b border-warm-100 bg-white/90 backdrop-blur-xl px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <IconDumbbell size={18} className="text-primary-600" />
              <span className="font-semibold text-warm-900">Live Weight Room</span>
              <span className="text-xs text-warm-400">
                — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </span>
            </div>

            {/* Stats row */}
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <span className="text-warm-500">
                <span className="font-medium text-primary-700">{stats.completed}</span>/{stats.total} done
              </span>
              {stats.atRisk > 0 && (
                <span className="text-amber-600 font-medium">
                  {stats.atRisk} at risk
                </span>
              )}
              {stats.needsCoach > 0 && (
                <span className="text-red-600 font-medium flex items-center gap-1">
                  <IconAlertCircle size={13} /> {stats.needsCoach} needs coach
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            className="flex items-center gap-1.5 rounded-lg border border-warm-200 bg-white px-3 py-1.5 text-xs text-warm-600 hover:border-warm-300 transition-colors"
          >
            <IconRefresh size={12} /> Refresh
          </button>
        </div>

        {/* Group filter tabs */}
        {allGroups.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setGroupFilter(null)}
              className={`shrink-0 rounded-full border px-3 py-0.5 text-xs font-medium transition-colors ${
                !groupFilter ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-warm-200 text-warm-600 hover:border-warm-300'
              }`}
            >
              All
            </button>
            {allGroups.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGroupFilter(g === groupFilter ? null : g)}
                className={`shrink-0 rounded-full border px-3 py-0.5 text-xs font-medium transition-colors ${
                  groupFilter === g ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-warm-200 text-warm-600 hover:border-warm-300'
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Athlete grid */}
        <main className="flex-1 overflow-y-auto p-4">
          {visible.length === 0 ? (
            <EmptyState
              icon={<IconUsers size={28} className="text-warm-300" />}
              title="No athletes scheduled today"
              description="Publish a program to generate today's sessions."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((athlete) => {
                const band = athlete.readiness_band ? BAND_META[athlete.readiness_band] : null;
                const statusMeta = STATUS_META[athlete.session_status];
                const isSelected = selectedAthleteId === athlete.athlete_id;
                const name = getFullName(athlete);

                return (
                  <motion.div
                    key={athlete.athlete_id}
                    layout
                    initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.15 }}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedAthleteId(isSelected ? null : athlete.athlete_id)
                      }
                      className={`w-full text-left rounded-2xl border p-4 transition-all duration-150 ${
                        isSelected
                          ? 'border-primary-400 bg-primary-50 shadow-md'
                          : 'border-warm-100 bg-white/70 hover:border-warm-200 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-warm-900 truncate">{name}</p>
                          <p className="text-xs text-warm-400">
                            {athlete.position ?? '—'}
                            {athlete.group_names.length > 0 ? ` · ${athlete.group_names[0]}` : ''}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusMeta.cls}`}>
                          {statusMeta.label}
                        </span>
                      </div>

                      {/* Progress bar */}
                      {athlete.total_exercises > 0 && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[11px] text-warm-400 mb-1">
                            <span>{athlete.current_exercise ?? 'Ready'}</span>
                            <span>{athlete.completed_exercises}/{athlete.total_exercises}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-warm-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary-500 transition-all"
                              style={{ width: `${(athlete.completed_exercises / athlete.total_exercises) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Readiness + load */}
                      <div className="mt-2.5 flex items-center gap-2">
                        {band && (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${band.cls}`}>
                            {band.label}
                          </span>
                        )}
                        {athlete.actual_load != null && (
                          <span className="text-[11px] text-warm-500">
                            {athlete.actual_load}
                            {athlete.prescribed_load != null && athlete.has_load_change ? (
                              <span className="text-amber-600"> (Δ{athlete.prescribed_load})</span>
                            ) : null}
                            {athlete.rpe != null ? ` RPE ${athlete.rpe}` : ''}
                          </span>
                        )}
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </main>

        {/* Right drawer — athlete detail */}
        {selectedAthlete && (
          <aside className="w-80 shrink-0 border-l border-warm-100 bg-warm-50/50 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-warm-900">{getFullName(selectedAthlete)}</h2>
              <button
                type="button"
                onClick={() => setSelectedAthleteId(null)}
                className="text-warm-400 hover:text-warm-700 text-lg leading-none"
                aria-label="Close drawer"
              >
                ×
              </button>
            </div>

            {/* Readiness band */}
            {selectedAthlete.readiness_band && (
              <div className={`rounded-xl border px-3 py-2 text-sm font-medium ${BAND_META[selectedAthlete.readiness_band].cls}`}>
                Readiness: {BAND_META[selectedAthlete.readiness_band].label}
              </div>
            )}

            {/* Exercises */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-warm-400 mb-2">Today's exercises</h3>
              {selectedAthlete.exercises.length === 0 ? (
                <p className="text-sm text-warm-400 italic">No exercises loaded.</p>
              ) : (
                <div className="space-y-2">
                  {selectedAthlete.exercises.map((ex) => (
                    <div key={ex.id} className="rounded-xl bg-white border border-warm-100 p-3">
                      <p className="text-sm font-medium text-warm-800">{ex.exercise_name_snapshot}</p>
                      <p className="text-xs text-warm-400 mt-0.5">
                        {[
                          ex.prescribed_sets != null ? `${ex.prescribed_sets} sets` : null,
                          ex.prescribed_reps != null ? `${ex.prescribed_reps} reps` : null,
                          ex.prescribed_load != null ? `@ ${ex.prescribed_load}${ex.prescribed_load_unit ? ` ${ex.prescribed_load_unit}` : ''}` : null,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Set logger */}
            {canEdit && selectedAthlete.exercises.length > 0 && selectedAthlete.session_status !== 'completed' && (
              <div className="rounded-xl border border-primary-100 bg-primary-50/30 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-primary-700">Log set #{setNum}</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[11px] text-warm-500 mb-1">Reps</label>
                    <Input
                      type="number"
                      min={0}
                      value={actualReps}
                      onChange={(e) => setActualReps(e.target.value)}
                      placeholder="—"
                      className="text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-warm-500 mb-1">Load</label>
                    <Input
                      type="number"
                      min={0}
                      value={actualLoad}
                      onChange={(e) => setActualLoad(e.target.value)}
                      placeholder="—"
                      className="text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-warm-500 mb-1">RPE</label>
                    <Input
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      value={rpe}
                      onChange={(e) => setRpe(e.target.value)}
                      placeholder="—"
                      className="text-center"
                    />
                  </div>
                </div>
                <Button
                  className="w-full gap-1.5"
                  disabled={isPending}
                  onClick={() => handleLogSet(selectedAthlete)}
                >
                  <IconCheck size={14} /> Log set
                </Button>
              </div>
            )}

            {/* Complete session */}
            {canEdit && selectedAthlete.session_status !== 'completed' && (
              <Button
                variant="ghost"
                className="w-full text-primary-600"
                disabled={isPending}
                onClick={() => handleComplete(selectedAthlete)}
              >
                <IconCheck size={14} className="mr-1" /> Mark session complete
              </Button>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
