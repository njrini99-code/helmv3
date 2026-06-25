'use client';

// =============================================================================
// src/components/baseball/performance/PerformanceDashboardClient.tsx
//
// Wave 9 / performance-lifting packet (P9.2).
//
// Strength-coach Performance dashboard. Capability-gated TABS:
//   * Readiness  — soreness / energy / sleep / arm board (canViewReadiness)
//   * Assignments — prescribe + track lifts (canManageLifting)
//   * Library    — team + global exercise library (canManageLifting)
//
// Server actions (lifting.ts) enforce capability + RLS again on every write;
// this client only OFFERS what the resolved caps allow. The page already
// server-redirects anyone without either gate, so an empty tab set never renders.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  IconDumbbell,
  IconHeart,
  IconActivity,
  IconPlus,
  IconClipboardList,
  IconAlertCircle,
  IconCheckCircle2,
} from '@/components/icons';
import { getFullName } from '@/lib/utils';
import {
  createLiftAssignment,
  updateAssignmentStatus,
} from '@/app/baseball/actions/lifting';
import { createLiftExercise } from '@/app/baseball/actions/lifting-v11';
import type {
  BaseballLiftAssignmentRow,
  BaseballLiftAssignmentStatus,
  BaseballReadinessSummary,
  BaseballLiftPrescription,
} from '@/lib/types/baseball-lifting';
import type {
  BaseballLiftExerciseRow,
  BaseballLiftExerciseCategory,
  BaseballLiftBodyRegion,
} from '@/lib/types/baseball-lifting-v11';

interface RosterPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
}

interface PerformanceDashboardClientProps {
  teamId: string;
  canManageLifting: boolean;
  canViewReadiness: boolean;
  roster: RosterPlayer[];
  assignments: BaseballLiftAssignmentRow[];
  exercises: BaseballLiftExerciseRow[];
  readiness: BaseballReadinessSummary[];
}

// V11 exercise vocabulary (mirrors the migration CHECK constraints). Surfaced as
// labeled options so the coach files an exercise the way the program builder + PR
// engine expect it — not as free text that can never be classified later.
const EXERCISE_CATEGORIES: { value: BaseballLiftExerciseCategory; label: string }[] = [
  { value: 'strength', label: 'Strength' },
  { value: 'power', label: 'Power' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'arm_care', label: 'Arm care' },
  { value: 'warmup', label: 'Warm-up' },
  { value: 'mobility', label: 'Mobility' },
  { value: 'conditioning', label: 'Conditioning' },
  { value: 'recovery', label: 'Recovery' },
  { value: 'test', label: 'Test' },
];

const BODY_REGIONS: { value: BaseballLiftBodyRegion; label: string }[] = [
  { value: 'lower', label: 'Lower body' },
  { value: 'upper', label: 'Upper body' },
  { value: 'trunk', label: 'Trunk / core' },
  { value: 'arm', label: 'Arm' },
  { value: 'full_body', label: 'Full body' },
];

const CATEGORY_LABEL: Record<string, string> = Object.fromEntries(
  EXERCISE_CATEGORIES.map((c) => [c.value, c.label]),
);

// Soreness/energy are 1..5. Higher soreness = more concern; higher energy = good.
const sorenessTone = (level: number | null): string => {
  if (level == null) return 'bg-warm-100 text-warm-600';
  if (level >= 4) return 'bg-red-100 text-red-700';
  if (level === 3) return 'bg-amber-100 text-amber-700';
  return 'bg-primary-100 text-primary-700';
};

const armTone = (status: string | null): string => {
  switch (status) {
    case 'pain':
      return 'bg-red-100 text-red-700';
    case 'sore':
    case 'tight':
      return 'bg-amber-100 text-amber-700';
    case 'fresh':
    case 'normal':
      return 'bg-primary-100 text-primary-700';
    default:
      return 'bg-warm-100 text-warm-600';
  }
};

const statusTone: Record<BaseballLiftAssignmentStatus, string> = {
  assigned: 'bg-warm-100 text-warm-700',
  in_progress: 'bg-warm-100 text-warm-700',
  completed: 'bg-primary-100 text-primary-700',
  skipped: 'bg-amber-100 text-amber-700',
  archived: 'bg-warm-100 text-warm-500',
};

export function PerformanceDashboardClient({
  teamId,
  canManageLifting,
  canViewReadiness,
  roster,
  assignments: initialAssignments,
  exercises: initialExercises,
  readiness,
}: PerformanceDashboardClientProps) {
  void teamId; // team scope is enforced server-side; kept for prop-contract clarity.

  const [assignments, setAssignments] = useState(initialAssignments);
  const [exercises, setExercises] = useState(initialExercises);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const defaultTab = canViewReadiness ? 'readiness' : 'assignments';
  const [tab, setTab] = useState(defaultTab);
  const prefersReducedMotion = useReducedMotion();

  // --- Assignment form state ---
  const [assignPlayerId, setAssignPlayerId] = useState('');
  const [assignExerciseId, setAssignExerciseId] = useState('');
  const [assignTitle, setAssignTitle] = useState('');
  const [assignDueDate, setAssignDueDate] = useState('');
  const [assignSets, setAssignSets] = useState('');
  const [assignReps, setAssignReps] = useState('');
  const [assignWeight, setAssignWeight] = useState('');

  // --- Exercise form state (V11 baseball_lift_exercises) ---
  const [exName, setExName] = useState('');
  const [exCategory, setExCategory] = useState<BaseballLiftExerciseCategory>('strength');
  const [exBodyRegion, setExBodyRegion] = useState<BaseballLiftBodyRegion | ''>('');
  const [exEquipment, setExEquipment] = useState('');
  const [exInstructions, setExInstructions] = useState('');
  // Library search/filter so a real, growing library stays scannable.
  const [exQuery, setExQuery] = useState('');

  const playerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of roster) {
      map.set(p.id, getFullName(p.first_name, p.last_name));
    }
    return map;
  }, [roster]);

  const exerciseNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of exercises) map.set(e.id, e.name);
    return map;
  }, [exercises]);

  const concernCount = useMemo(
    () =>
      readiness.filter(
        (r) =>
          (r.latest_checkin?.soreness_level ?? 0) >= 4 ||
          r.latest_checkin?.arm_status === 'pain',
      ).length,
    [readiness],
  );

  const reportedToday = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return readiness.filter((r) => r.latest_checkin?.check_date === today).length;
  }, [readiness]);

  function flashNotice(msg: string) {
    setNotice(msg);
    setError(null);
    setTimeout(() => setNotice(null), 3500);
  }

  function handleCreateAssignment() {
    setError(null);
    if (!assignPlayerId) {
      setError('Select a player to assign the lift to.');
      return;
    }
    const prescription: BaseballLiftPrescription = {};
    if (assignSets) prescription.sets = Number(assignSets);
    if (assignReps) prescription.reps = Number(assignReps);
    if (assignWeight) prescription.weight = Number(assignWeight);

    startTransition(async () => {
      try {
        const res = await createLiftAssignment({
          playerId: assignPlayerId,
          exerciseId: assignExerciseId || null,
          title: assignTitle || null,
          dueDate: assignDueDate || null,
          prescription,
        });
        if (!res.success || !res.id) {
          setError(res.error ?? 'Could not create the assignment.');
          return;
        }
        setAssignments((prev) => [
          {
            id: res.id as string,
            team_id: teamId,
            player_id: assignPlayerId,
            group_scope: null,
            assigned_by_coach_id: null,
            exercise_id: assignExerciseId || null,
            title: assignTitle || null,
            due_date: assignDueDate || null,
            prescription,
            status: 'assigned',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        setAssignPlayerId('');
        setAssignExerciseId('');
        setAssignTitle('');
        setAssignDueDate('');
        setAssignSets('');
        setAssignReps('');
        setAssignWeight('');
        flashNotice('Lift assigned.');
      } catch {
        setError('Something went wrong assigning the lift. Please try again.');
      }
    });
  }

  function handleStatusChange(
    assignmentId: string,
    status: BaseballLiftAssignmentStatus,
  ) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await updateAssignmentStatus({ assignmentId, status });
        if (!res.success) {
          setError(res.error ?? 'Could not update the assignment.');
          return;
        }
        setAssignments((prev) =>
          prev.map((a) => (a.id === assignmentId ? { ...a, status } : a)),
        );
      } catch {
        setError('Something went wrong updating the assignment.');
      }
    });
  }

  function handleCreateExercise() {
    setError(null);
    const name = exName.trim();
    if (!name) {
      setError('Give the exercise a name.');
      return;
    }
    // Guard the team-name uniqueness here too (the server enforces it via a unique
    // index) so the coach gets an instant, friendly message instead of a round-trip.
    if (
      exercises.some(
        (e) => e.team_id != null && e.name.trim().toLowerCase() === name.toLowerCase(),
      )
    ) {
      setError('An exercise with that name already exists in your library.');
      return;
    }
    startTransition(async () => {
      try {
        const res = await createLiftExercise({
          name,
          category: exCategory,
          bodyRegion: exBodyRegion || null,
          equipment: exEquipment.trim() || null,
          instructions: exInstructions.trim() || null,
        });
        if (!res.success || !res.id) {
          setError(res.error ?? 'Could not add the exercise.');
          return;
        }
        // Optimistic insert mirroring the V11 row shape. Defaulted track_* flags
        // match the migration defaults; the canonical row is re-fetched on the next
        // server render (the action revalidates the programs path).
        const optimistic: BaseballLiftExerciseRow = {
          id: res.id,
          team_id: teamId,
          created_by_coach_id: null,
          name,
          category: exCategory,
          primary_pattern: null,
          body_region: exBodyRegion || null,
          equipment: exEquipment.trim() || null,
          unilateral: false,
          baseball_constraints: {},
          baseball_tags: [],
          default_unit: 'lb',
          track_load: true,
          track_reps: true,
          track_sets: true,
          track_velocity: false,
          track_distance: false,
          track_time: false,
          track_rpe: true,
          video_url: null,
          instructions: exInstructions.trim() || null,
          coaching_cues: [],
          contraindication_notes: null,
          is_global: false,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setExercises((prev) => [optimistic, ...prev]);
        setExName('');
        setExCategory('strength');
        setExBodyRegion('');
        setExEquipment('');
        setExInstructions('');
        flashNotice('Exercise added — it’s now selectable in programs and quick-assign.');
      } catch {
        setError('Something went wrong adding the exercise.');
      }
    });
  }

  return (
    <motion.div
      className="p-4 lg:p-8 space-y-6"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
    >
        {/* Header */}
        <div>
          <p className="text-eyebrow uppercase text-primary-700">Strength &amp; conditioning</p>
          <h1 className="mt-0.5 text-3xl font-semibold tracking-tight text-warm-900">Performance</h1>
          <p className="mt-1 text-sm text-warm-500">
            Track readiness, prescribe lifts, and keep your exercise library in one place.
          </p>
        </div>

        {/* Notices */}
        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <IconAlertCircle size={16} className="shrink-0" />
            <span className="flex-1">{error}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
              className="font-medium text-red-700 hover:text-red-800"
            >
              Dismiss
            </Button>
          </div>
        )}
        {notice && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-700"
          >
            <IconCheckCircle2 size={16} className="shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          <SummaryCard
            icon={<IconActivity size={20} className="text-primary-600" />}
            tint="bg-primary-100"
            label="Roster"
            value={roster.length}
          />
          <SummaryCard
            icon={<IconClipboardList size={20} className="text-warm-600" />}
            tint="bg-warm-100"
            label="Active Assignments"
            value={assignments.filter((a) => a.status !== 'archived').length}
          />
          {canViewReadiness && (
            <>
              <SummaryCard
                icon={<IconHeart size={20} className="text-warm-600" />}
                tint="bg-warm-100"
                label="Checked In Today"
                value={reportedToday}
              />
              <SummaryCard
                icon={<IconAlertCircle size={20} className="text-amber-600" />}
                tint="bg-amber-100"
                label="Needs Attention"
                value={concernCount}
              />
            </>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            {canViewReadiness && (
              <TabsTrigger value="readiness">Readiness</TabsTrigger>
            )}
            {canManageLifting && (
              <TabsTrigger value="assignments">Assignments</TabsTrigger>
            )}
            {canManageLifting && (
              <TabsTrigger value="library">Library</TabsTrigger>
            )}
          </TabsList>

          {/* ---------------------------------------------------------------- */}
          {/* READINESS                                                         */}
          {/* ---------------------------------------------------------------- */}
          {canViewReadiness && (
            <TabsContent value="readiness">
              <AnimatePresence mode="wait">
                {tab === 'readiness' && (
                  <motion.div
                    key="readiness"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
              <Card variant="glass">
                <CardHeader>
                  <h2 className="font-semibold text-warm-900">Daily Readiness</h2>
                  <p className="text-sm text-warm-500">
                    Player-reported wellness from the last 7 days. This is not a
                    medical assessment.
                  </p>
                </CardHeader>
                <CardContent className="p-0">
                  {readiness.length === 0 ? (
                    <div className="p-6">
                      <EmptyState
                        icon={<IconHeart size={24} />}
                        title="No check-ins yet"
                        description="Players' daily readiness check-ins will show up here once they start reporting."
                      />
                    </div>
                  ) : (
                    <div className="divide-y divide-warm-200">
                      {readiness.map((r) => {
                        const c = r.latest_checkin;
                        return (
                          <div
                            key={r.player_id}
                            className="flex items-center gap-3 px-4 py-3 lg:px-6"
                          >
                            <Avatar
                              name={getFullName(r.first_name, r.last_name)}
                              src={r.avatar_url || undefined}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-warm-900">
                                {getFullName(r.first_name, r.last_name)}
                              </p>
                              <p className="text-sm text-warm-500">
                                {c
                                  ? `Reported ${c.check_date}`
                                  : 'No recent check-in'}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {c ? (
                                <>
                                  <Badge className={sorenessTone(c.soreness_level)}>
                                    Soreness {c.soreness_level ?? '—'}/5
                                  </Badge>
                                  <Badge className="bg-warm-100 text-warm-700">
                                    Energy {c.energy_level ?? '—'}/5
                                  </Badge>
                                  {c.arm_status && (
                                    <Badge className={armTone(c.arm_status)}>
                                      Arm: {c.arm_status}
                                    </Badge>
                                  )}
                                  {c.sleep_hours != null && (
                                    <Badge className="bg-warm-100 text-warm-700">
                                      {c.sleep_hours}h sleep
                                    </Badge>
                                  )}
                                </>
                              ) : (
                                <Badge className="bg-warm-100 text-warm-500">
                                  Awaiting
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* ASSIGNMENTS                                                       */}
          {/* ---------------------------------------------------------------- */}
          {canManageLifting && (
            <TabsContent value="assignments">
              <AnimatePresence mode="wait">
                {tab === 'assignments' && (
                  <motion.div
                    key="assignments"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
              <div className="space-y-6">
                {/* Create */}
                <Card variant="glass">
                  <CardHeader>
                    <h2 className="font-semibold text-warm-900">Assign a Lift</h2>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <Select
                        value={assignPlayerId}
                        onChange={setAssignPlayerId}
                        options={[
                          { value: '', label: 'Select player…' },
                          ...roster.map((p) => ({
                            value: p.id,
                            label: getFullName(p.first_name, p.last_name),
                          })),
                        ]}
                      />
                      <Select
                        value={assignExerciseId}
                        onChange={setAssignExerciseId}
                        options={[
                          { value: '', label: 'Select exercise (optional)…' },
                          ...exercises.map((e) => ({
                            value: e.id,
                            label: e.name,
                          })),
                        ]}
                      />
                      <Input
                        placeholder="Title (e.g. Lower body day)"
                        value={assignTitle}
                        onChange={(e) => setAssignTitle(e.target.value)}
                      />
                      <Input
                        type="date"
                        value={assignDueDate}
                        onChange={(e) => setAssignDueDate(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <Input
                        type="number"
                        min="0"
                        placeholder="Sets"
                        value={assignSets}
                        onChange={(e) => setAssignSets(e.target.value)}
                      />
                      <Input
                        type="number"
                        min="0"
                        placeholder="Reps"
                        value={assignReps}
                        onChange={(e) => setAssignReps(e.target.value)}
                      />
                      <Input
                        type="number"
                        min="0"
                        placeholder="Weight (lb)"
                        value={assignWeight}
                        onChange={(e) => setAssignWeight(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={handleCreateAssignment}
                      isLoading={isPending}
                      leftIcon={<IconPlus size={16} />}
                    >
                      Assign Lift
                    </Button>
                  </CardContent>
                </Card>

                {/* List */}
                <Card variant="glass">
                  <CardHeader>
                    <h2 className="font-semibold text-warm-900">
                      Recent Assignments
                    </h2>
                  </CardHeader>
                  <CardContent className="p-0">
                    {assignments.length === 0 ? (
                      <div className="p-6">
                        <EmptyState
                          icon={<IconClipboardList size={24} />}
                          title="No assignments yet"
                          description="Prescribe a lift above and it will show up here for your players."
                        />
                      </div>
                    ) : (
                      <div className="divide-y divide-warm-200">
                        {assignments.map((a) => {
                          const presc = (a.prescription ??
                            {}) as BaseballLiftPrescription;
                          return (
                            <div
                              key={a.id}
                              className="flex flex-wrap items-center gap-3 px-4 py-3 lg:px-6"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-warm-900">
                                  {a.title ||
                                    (a.exercise_id &&
                                      exerciseNameById.get(a.exercise_id)) ||
                                    'Lift'}
                                </p>
                                <p className="text-sm text-warm-500">
                                  {a.player_id
                                    ? playerNameById.get(a.player_id) ?? 'Player'
                                    : 'Group'}
                                  {presc.sets || presc.reps
                                    ? ` · ${presc.sets ?? '—'}×${presc.reps ?? '—'}`
                                    : ''}
                                  {presc.weight ? ` @ ${presc.weight}lb` : ''}
                                  {a.due_date ? ` · due ${a.due_date}` : ''}
                                </p>
                              </div>
                              <Badge className={statusTone[a.status]}>
                                {a.status.replace('_', ' ')}
                              </Badge>
                              <Select
                                value={a.status}
                                onChange={(v) =>
                                  handleStatusChange(
                                    a.id,
                                    v as BaseballLiftAssignmentStatus,
                                  )
                                }
                                options={[
                                  { value: 'assigned', label: 'Assigned' },
                                  { value: 'in_progress', label: 'In progress' },
                                  { value: 'completed', label: 'Completed' },
                                  { value: 'skipped', label: 'Skipped' },
                                  { value: 'archived', label: 'Archived' },
                                ]}
                              />
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>
          )}

          {/* ---------------------------------------------------------------- */}
          {/* LIBRARY                                                           */}
          {/* ---------------------------------------------------------------- */}
          {canManageLifting && (
            <TabsContent value="library">
              <AnimatePresence mode="wait">
                {tab === 'library' && (
                  <motion.div
                    key="library"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
              <div className="space-y-6">
                <Card variant="glass">
                  <CardHeader>
                    <h2 className="font-semibold text-warm-900">Add Exercise</h2>
                    <p className="text-sm text-warm-500">
                      Exercises you add here power your programs, quick-assign, and
                      PR tracking — they share one library.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <Input
                        placeholder="Exercise name (e.g. Trap-bar deadlift)"
                        value={exName}
                        onChange={(e) => setExName(e.target.value)}
                      />
                      <Input
                        placeholder="Equipment (e.g. trap bar, dumbbell) — optional"
                        value={exEquipment}
                        onChange={(e) => setExEquipment(e.target.value)}
                      />
                      <Select
                        label="Category"
                        value={exCategory}
                        onChange={(v) => setExCategory(v as BaseballLiftExerciseCategory)}
                        options={EXERCISE_CATEGORIES}
                      />
                      <Select
                        label="Body region (optional)"
                        value={exBodyRegion}
                        onChange={(v) => setExBodyRegion(v as BaseballLiftBodyRegion | '')}
                        options={[
                          { value: '', label: 'Unspecified' },
                          ...BODY_REGIONS,
                        ]}
                      />
                    </div>
                    <Textarea
                      placeholder="Coaching cues / setup notes (optional)"
                      value={exInstructions}
                      onChange={(e) => setExInstructions(e.target.value)}
                      rows={2}
                    />
                    <Button
                      onClick={handleCreateExercise}
                      isLoading={isPending}
                      leftIcon={<IconPlus size={16} />}
                    >
                      Add to Library
                    </Button>
                  </CardContent>
                </Card>

                <Card variant="glass">
                  <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <h2 className="font-semibold text-warm-900">
                      Exercise Library
                      <span className="ml-2 text-sm font-normal text-warm-500 tabular-nums">
                        {exercises.length}
                      </span>
                    </h2>
                    {exercises.length > 0 && (
                      <Input
                        placeholder="Search exercises…"
                        value={exQuery}
                        onChange={(e) => setExQuery(e.target.value)}
                        className="sm:max-w-xs"
                      />
                    )}
                  </CardHeader>
                  <CardContent className="p-0">
                    {exercises.length === 0 ? (
                      <div className="p-6">
                        <EmptyState
                          icon={<IconDumbbell size={24} />}
                          title="Library is empty"
                          description="Add your team's core lifts so you can build programs and quick-assign them."
                        />
                      </div>
                    ) : (() => {
                      const q = exQuery.trim().toLowerCase();
                      const filtered = q
                        ? exercises.filter(
                            (e) =>
                              e.name.toLowerCase().includes(q) ||
                              (e.equipment ?? '').toLowerCase().includes(q) ||
                              CATEGORY_LABEL[e.category]?.toLowerCase().includes(q),
                          )
                        : exercises;
                      if (filtered.length === 0) {
                        return (
                          <div className="p-6">
                            <EmptyState
                              icon={<IconDumbbell size={24} />}
                              title="No matches"
                              description={`Nothing in the library matches “${exQuery.trim()}”.`}
                            />
                          </div>
                        );
                      }
                      return (
                        <div className="divide-y divide-warm-200">
                          {filtered.map((e) => (
                            <div
                              key={e.id}
                              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-warm-50/60 lg:px-6"
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-100">
                                <IconDumbbell size={18} className="text-primary-600" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-warm-900">
                                  {e.name}
                                </p>
                                {(e.equipment || e.instructions) && (
                                  <p className="truncate text-sm text-warm-500">
                                    {e.equipment ? e.equipment : ''}
                                    {e.equipment && e.instructions ? ' · ' : ''}
                                    {e.instructions ?? ''}
                                  </p>
                                )}
                              </div>
                              <Badge className="bg-primary-100 text-primary-700">
                                {CATEGORY_LABEL[e.category] ?? e.category}
                              </Badge>
                              {e.body_region && (
                                <Badge className="bg-warm-100 text-warm-700">
                                  {e.body_region.replace('_', ' ')}
                                </Badge>
                              )}
                              {e.is_global && (
                                <Badge className="bg-warm-100 text-warm-500">
                                  Global
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>
          )}
        </Tabs>
    </motion.div>
  );
}

function SummaryCard({
  icon,
  tint,
  label,
  value,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: number;
}) {
  return (
    <Card variant="glass" className="transition-shadow duration-200 hover:shadow-glass-hover">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tint}`}
            aria-hidden
          >
            {icon}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm leading-relaxed text-warm-500">{label}</p>
            <p
              className="text-2xl font-semibold tracking-tight tabular-nums text-warm-900"
              aria-label={`${value} ${label}`}
            >
              {value}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
