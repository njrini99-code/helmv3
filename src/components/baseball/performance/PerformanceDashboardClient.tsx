'use client';

// =============================================================================
// src/components/baseball/performance/PerformanceDashboardClient.tsx
//
// Wave 9 / performance-lifting packet (P9.2). Re-skinned onto "The Living
// Annual" kit (spec: docs/baseball/design-system-living-annual.md; task
// P4.14.b). PRESENTATION ONLY — the exact same props the page assembles
// server-side, no data path, server action, or write path is touched here.
//
// Strength-coach Performance dashboard. Capability-gated TABS:
//   * Readiness  — soreness / energy / sleep / arm board (canViewReadiness)
//   * Assignments — prescribe + track lifts, plus a `<ClimbArc>` load trend
//     for the most-tracked lift (canManageLifting)
//   * Library    — team + global exercise library (canManageLifting)
//
// Server actions (lifting.ts) enforce capability + RLS again on every write;
// this client only OFFERS what the resolved caps allow. The page already
// server-redirects anyone without either gate, so an empty tab set never renders.
// =============================================================================

import { useMemo, useState, useTransition } from 'react';

import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { IconPlus, IconAlertCircle, IconCheckCircle2 } from '@/components/icons';
import { cn, getFullName } from '@/lib/utils';
import {
  createLiftAssignment,
  updateAssignmentStatus,
  createExercise,
} from '@/app/baseball/actions/lifting';
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
  BaseballStrengthGroupRow,
} from '@/lib/types/baseball-lifting-v11';
import {
  PaperCard,
  SectionMasthead,
  Eyebrow,
  HairlineRule,
  EditorsLetter,
  InkBadge,
  KPIContentsStrip,
  Reveal,
  StatReadout,
  ClimbArc,
  pressableClass,
  type KPIContentsItem,
  type InkBadgeProps,
  type ClimbPoint,
} from '@/components/baseball/living-annual';

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
  /** Strength groups for group-scope assignment. Optional — if absent, only single-player assign is shown. */
  groups?: Pick<BaseballStrengthGroupRow, 'id' | 'name'>[];
  /** Show skeleton loaders while data is loading. */
  isLoading?: boolean;
  /**
   * Team-local "today" as an ISO date (YYYY-MM-DD), resolved server-side via
   * todayIsoInTz(resolveTeamTimezone(...)). Optional — no server parent
   * threads this yet, so it falls back to the browser-local date
   * (toLocaleDateString('en-CA')), which still beats UTC for the acute
   * midnight-rollover case but is not team-timezone-correct.
   */
  today?: string;
  /**
   * Rendered as a section BELOW the PerformanceCommandCenter (default on the
   * main Performance page). In embedded mode this drops the duplicate
   * "Performance" hero header, the duplicate KPI summary strip, and the
   * Readiness tab — all of which the Command Center already owns — so the page
   * no longer stacks two full dashboards with two headers and two readiness
   * lists. Only the unique prescribe/library management tools remain.
   */
  embedded?: boolean;
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

// Ink follows the two-ink law (spec §4.2): urgency reads as CLAY, never a red
// badge or a yellow/amber box. Soreness/energy are 1..5. Higher soreness = more
// concern; higher energy = good.
const sorenessInk = (level: number | null): NonNullable<InkBadgeProps['tone']> => {
  if (level == null) return 'neutral';
  if (level >= 4) return 'pursuit';
  if (level === 3) return 'neutral';
  return 'team';
};

const armInk = (status: string | null): NonNullable<InkBadgeProps['tone']> => {
  switch (status) {
    case 'pain':
      return 'pursuit';
    case 'sore':
    case 'tight':
      return 'neutral';
    case 'fresh':
    case 'normal':
      return 'team';
    default:
      return 'neutral';
  }
};

const ASSIGNMENT_INK: Record<BaseballLiftAssignmentStatus, NonNullable<InkBadgeProps['tone']>> = {
  assigned: 'neutral',
  in_progress: 'neutral',
  completed: 'team',
  skipped: 'pursuit',
  archived: 'neutral',
};

/**
 * SectionCard — the one card chrome every panel below composes from: a
 * `<PaperCard>` with an `<Eyebrow>` + Space Grotesk title + optional
 * description, sitting on a lane-ink `<HairlineRule>`. Keeps every list/form
 * panel on identical bones so the surface reads as one issue, not a stitched-
 * together CRM.
 */
function SectionCard({
  eyebrow,
  title,
  description,
  trailing,
  ink = 'team',
  children,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  trailing?: React.ReactNode;
  ink?: 'team' | 'pursuit';
  children: React.ReactNode;
}) {
  return (
    <PaperCard className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow ? <Eyebrow ink={ink}>{eyebrow}</Eyebrow> : null}
          <h2 className="mt-1 flex items-baseline font-annual text-h2 font-semibold text-text-primary">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-prose font-annual text-body-sm text-text-secondary">
              {description}
            </p>
          ) : null}
        </div>
        {trailing}
      </div>
      <HairlineRule ink={ink} className="my-4" />
      {children}
    </PaperCard>
  );
}

export function PerformanceDashboardClient({
  teamId,
  canManageLifting,
  canViewReadiness,
  roster,
  assignments: initialAssignments,
  exercises: initialExercises,
  readiness,
  groups,
  isLoading = false,
  embedded = false,
  today,
}: PerformanceDashboardClientProps) {
  void teamId; // team scope is enforced server-side; kept for prop-contract clarity.

  // In embedded mode the Command Center above owns readiness, so this section
  // only offers the prescribe/library management tabs.
  const showReadinessTab = canViewReadiness && !embedded;

  const [assignments, setAssignments] = useState(initialAssignments);
  const [exercises, setExercises] = useState(initialExercises);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const defaultTab = showReadinessTab ? 'readiness' : 'assignments';
  const [tab, setTab] = useState(defaultTab);

  // --- Assignment form state ---
  /** 'player' or 'group' — controls which target field is shown. */
  const [assignMode, setAssignMode] = useState<'player' | 'group'>('player');
  const [assignPlayerId, setAssignPlayerId] = useState('');
  /** Selected group IDs for group-scope quick-assign (multi-select via checkboxes). */
  const [assignGroupIds, setAssignGroupIds] = useState<string[]>([]);
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
    const todayIso = today ?? new Date().toLocaleDateString('en-CA');
    return readiness.filter((r) => r.latest_checkin?.check_date === todayIso).length;
  }, [readiness, today]);

  // The "Lift Trend" ClimbArc (PR/lift trends → ClimbArc + StatReadout). Reads
  // the SAME `assignments` prop already on the surface — no new data path —
  // and draws the weight-load climb for whichever completed, weighted lift has
  // the deepest history. Fewer than 2 usable points → ClimbArc's own honest
  // "not enough data yet" letter; never a fabricated curve.
  const liftTrend = useMemo((): { label: string; points: ClimbPoint[] } | null => {
    const withWeight = assignments.filter((a) => {
      const p = (a.prescription ?? {}) as BaseballLiftPrescription;
      return a.status === 'completed' && typeof p.weight === 'number';
    });
    if (withWeight.length < 2) return null;

    const byKey = new Map<string, typeof withWeight>();
    for (const a of withWeight) {
      const key = a.exercise_id ?? a.title ?? 'lift';
      const arr = byKey.get(key);
      if (arr) arr.push(a);
      else byKey.set(key, [a]);
    }

    let bestKey: string | null = null;
    let bestArr: typeof withWeight = [];
    for (const [key, arr] of byKey) {
      if (arr.length > bestArr.length) {
        bestKey = key;
        bestArr = arr;
      }
    }
    if (!bestKey || bestArr.length < 2) return null;

    const sorted = [...bestArr].sort((a, b) =>
      (a.due_date ?? a.created_at).localeCompare(b.due_date ?? b.created_at),
    );
    const label =
      exerciseNameById.get(bestKey) ?? sorted[0]?.title ?? 'Lift';
    const points: ClimbPoint[] = sorted.map((a) => ({
      value: ((a.prescription ?? {}) as BaseballLiftPrescription).weight as number,
      label: (a.due_date ?? a.created_at).slice(0, 10),
    }));
    return { label, points };
  }, [assignments, exerciseNameById]);

  function flashNotice(msg: string) {
    setNotice(msg);
    setError(null);
    setTimeout(() => setNotice(null), 3500);
  }

  function handleCreateAssignment() {
    setError(null);
    if (assignMode === 'player' && !assignPlayerId) {
      setError('Select a player to assign the lift to.');
      return;
    }
    if (assignMode === 'group' && assignGroupIds.length === 0) {
      setError('Select at least one group to assign the lift to.');
      return;
    }
    const prescription: BaseballLiftPrescription = {};
    if (assignSets) prescription.sets = Number(assignSets);
    if (assignReps) prescription.reps = Number(assignReps);
    if (assignWeight) prescription.weight = Number(assignWeight);

    startTransition(async () => {
      try {
        const res = await createLiftAssignment(
          assignMode === 'player'
            ? {
                playerId: assignPlayerId,
                exerciseId: assignExerciseId || null,
                title: assignTitle || null,
                dueDate: assignDueDate || null,
                prescription,
              }
            : {
                groupScope: assignGroupIds,
                exerciseId: assignExerciseId || null,
                title: assignTitle || null,
                dueDate: assignDueDate || null,
                prescription,
              },
        );
        if (!res.success) {
          setError(res.error ?? 'Could not create the assignment.');
          return;
        }
        // For single-player we do an optimistic push; for group mode the server
        // materialized N sessions — re-render via revalidatePath is the source of
        // truth. We still flash success in both cases.
        if (assignMode === 'player' && res.id) {
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
        }
        setAssignPlayerId('');
        setAssignGroupIds([]);
        setAssignExerciseId('');
        setAssignTitle('');
        setAssignDueDate('');
        setAssignSets('');
        setAssignReps('');
        setAssignWeight('');
        flashNotice(
          assignMode === 'group'
            ? 'Lift assigned to group — players will see it on their Today page.'
            : 'Lift assigned.',
        );
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
        // createExercise writes to helm_lifting_exercises (unified Lab tables).
        // The description field maps to the instructions column in the helm schema.
        // Body region and equipment are preserved in the optimistic row below;
        // the fuller V11 field set will be wired when lifting-v11.ts is rewired.
        const res = await createExercise({
          name,
          category: exCategory,
          description:
            [exBodyRegion ? `region:${exBodyRegion}` : '', exEquipment.trim(), exInstructions.trim()]
              .filter(Boolean)
              .join(' | ') || null,
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

  if (isLoading) {
    return (
      <div className={embedded ? 'space-y-6' : 'p-4 lg:p-8 space-y-6'} aria-busy="true" aria-label="Loading performance dashboard…">
        {/* Header skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        {/* KPI strip skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <PaperCard key={i} grain={false} className="p-4">
              <div className="space-y-2" style={{ animationDelay: `${i * 60}ms` }}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-12" />
              </div>
            </PaperCard>
          ))}
        </div>
        {/* Tabs skeleton */}
        <div className="space-y-4">
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-full" />
            ))}
          </div>
          <PaperCard grain={false} className="p-6 space-y-4">
            <Skeleton className="h-5 w-32" />
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3" style={{ animationDelay: `${i * 50}ms` }}>
                <Skeleton variant="circular" className="w-9 h-9 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </PaperCard>
        </div>
      </div>
    );
  }

  // Table-of-contents KPIs — the exact same counts the old summary grid showed,
  // now on green-ruled `<RuledStatLine>`s instead of four white cards.
  const kpis: KPIContentsItem[] = [
    { label: 'Roster', value: roster.length },
    { label: 'Active Assignments', value: assignments.filter((a) => a.status !== 'archived').length },
  ];
  if (canViewReadiness) {
    kpis.push({ label: 'Checked In Today', value: reportedToday });
    kpis.push({ label: 'Needs Attention', value: concernCount });
  }

  return (
    <div className={embedded ? 'space-y-6' : 'p-4 lg:p-8 space-y-6'}>
      {/* Header */}
      {embedded ? (
        <div>
          <HairlineRule ink="hairline" className="mb-8" />
          <SectionMasthead
            eyebrow="Prescribe & library"
            title="Assignments &amp; exercise library"
          >
            <p className="font-annual text-body-sm text-text-secondary">
              Prescribe lifts and keep your team&apos;s exercise library in one place.
            </p>
          </SectionMasthead>
        </div>
      ) : (
        <SectionMasthead eyebrow="Strength &amp; conditioning" title="Performance">
          <p className="font-annual text-body-sm text-text-secondary">
            Track readiness, prescribe lifts, and keep your exercise library in one place.
          </p>
        </SectionMasthead>
      )}

      {/* Notices — an editor's-desk letter voice, never a red/amber toast box. */}
      {error && (
        <PaperCard grain={false} className="flex items-center gap-3 px-4 py-3">
          <IconAlertCircle size={16} className="shrink-0 text-pursuit" aria-hidden />
          <p role="alert" className="flex-1 font-annual text-body-sm text-text-primary">
            {error}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            haptic="none"
            onClick={() => setError(null)}
            className={cn(
              'h-auto min-h-0 shrink-0 rounded-fw-sm px-2 py-1 text-eyebrow font-semibold uppercase tracking-[0.14em] text-pursuit hover:text-pursuit',
              pressableClass({ ink: 'pursuit', tint: false }),
            )}
          >
            Dismiss
          </Button>
        </PaperCard>
      )}
      {notice && (
        <PaperCard grain={false} className="flex items-center gap-3 px-4 py-3">
          <IconCheckCircle2 size={16} className="shrink-0 text-grade-plus" aria-hidden />
          <p role="status" aria-live="polite" className="font-annual text-body-sm text-text-primary">
            {notice}
          </p>
        </PaperCard>
      )}

      {/* Contents strip — hidden when embedded (Command Center owns the KPIs). */}
      {!embedded && <KPIContentsStrip items={kpis} columns={kpis.length} />}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {showReadinessTab && (
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
        {showReadinessTab && (
          <TabsContent value="readiness">
            <Reveal>
              <SectionCard
                eyebrow="This week"
                title="Daily Readiness"
                description="Player-reported wellness from the last 7 days. This is not a medical assessment."
              >
                {readiness.length === 0 ? (
                  <EditorsLetter
                    live
                    title="No check-ins yet."
                    body="Players' daily readiness check-ins will show up here once they start reporting."
                  />
                ) : (
                  <div>
                    {readiness.map((r, i) => {
                      const c = r.latest_checkin;
                      const concern =
                        (c?.soreness_level ?? 0) >= 4 || c?.arm_status === 'pain';
                      const rowInk = concern ? 'pursuit' : 'team';
                      return (
                        <Reveal key={r.player_id} staggerIndex={Math.min(i, 10)}>
                          <div className="flex flex-wrap items-center gap-3 py-3.5">
                            <Avatar decorative
                              name={getFullName(r.first_name, r.last_name)}
                              src={r.avatar_url || undefined}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-annual text-body-lg text-text-primary">
                                {getFullName(r.first_name, r.last_name)}
                              </p>
                              <p className="font-annual text-body-sm text-text-tertiary">
                                {c ? `Reported ${c.check_date}` : 'No recent check-in'}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {c ? (
                                <>
                                  <InkBadge
                                    label={`Soreness ${c.soreness_level ?? '—'}/5`}
                                    tone={sorenessInk(c.soreness_level)}
                                  />
                                  <InkBadge label={`Energy ${c.energy_level ?? '—'}/5`} tone="neutral" />
                                  {c.arm_status && (
                                    <InkBadge label={`Arm: ${c.arm_status}`} tone={armInk(c.arm_status)} />
                                  )}
                                  {c.sleep_hours != null && (
                                    <InkBadge label={`${c.sleep_hours}h sleep`} tone="neutral" />
                                  )}
                                </>
                              ) : (
                                <InkBadge label="Awaiting" tone="neutral" />
                              )}
                            </div>
                          </div>
                          <HairlineRule ink={rowInk} />
                        </Reveal>
                      );
                    })}
                  </div>
                )}
              </SectionCard>
            </Reveal>
          </TabsContent>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* ASSIGNMENTS                                                       */}
        {/* ---------------------------------------------------------------- */}
        {canManageLifting && (
          <TabsContent value="assignments">
            <Reveal className="space-y-6">
              {/* Create */}
              <SectionCard eyebrow="Prescribe" title="Assign a Lift">
                <div className="space-y-3">
                  {/* Target mode toggle — only show if groups are available */}
                  {groups && groups.length > 0 && (
                    <div
                      className="inline-flex w-fit gap-1 rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] p-1"
                      role="group"
                      aria-label="Assign to"
                    >
                      {(['player', 'group'] as const).map((mode) => (
                        <Button
                          key={mode}
                          type="button"
                          variant="ghost"
                          size="sm"
                          haptic="none"
                          onClick={() => setAssignMode(mode)}
                          aria-pressed={assignMode === mode}
                          className={cn(
                            'h-auto min-h-0 rounded-fw-sm px-3 py-1.5 font-annual text-body-sm font-medium capitalize',
                            pressableClass({ ink: 'team', tint: assignMode !== mode }),
                            assignMode === mode
                              ? 'bg-grade-plus text-white hover:bg-grade-plus'
                              : 'text-text-secondary',
                          )}
                        >
                          {mode}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {assignMode === 'player' ? (
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
                    ) : (
                      <fieldset className="rounded-fw-md border border-[color:var(--hairline)] bg-[var(--paper)] px-3 py-2 space-y-1.5">
                        <legend className="px-1 font-annual text-eyebrow font-medium uppercase tracking-[0.14em] text-text-tertiary">
                          Groups
                        </legend>
                        {(groups ?? []).map((g) => (
                          <label key={g.id} className="flex items-center gap-2.5 cursor-pointer">
                            <Input
                              type="checkbox"
                              className="h-4 w-4 rounded border-[color:var(--hairline)] text-grade-plus focus:ring-grade-plus/40"
                              checked={assignGroupIds.includes(g.id)}
                              onChange={(e) =>
                                setAssignGroupIds((prev) =>
                                  e.target.checked
                                    ? [...prev, g.id]
                                    : prev.filter((id) => id !== g.id),
                                )
                              }
                            />
                            <span className="font-annual text-body-sm text-text-primary">{g.name}</span>
                          </label>
                        ))}
                        {(groups ?? []).length === 0 && (
                          <p className="font-annual text-body-sm text-text-tertiary py-1">No groups yet.</p>
                        )}
                      </fieldset>
                    )}
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
                </div>
              </SectionCard>

              {/* List + trend */}
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <SectionCard eyebrow="Prescribed" title="Recent Assignments">
                    {assignments.length === 0 ? (
                      <EditorsLetter
                        title="No assignments yet."
                        body="Prescribe a lift above and it will show up here for your players."
                      />
                    ) : (
                      <div>
                        {assignments.map((a, i) => {
                          const presc = (a.prescription ??
                            {}) as BaseballLiftPrescription;
                          return (
                            <Reveal key={a.id} staggerIndex={Math.min(i, 10)}>
                              <div className="flex flex-wrap items-center gap-3 py-3.5">
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-annual text-body-lg text-text-primary">
                                    {a.title ||
                                      (a.exercise_id &&
                                        exerciseNameById.get(a.exercise_id)) ||
                                      'Lift'}
                                  </p>
                                  <p className="font-annual text-body-sm text-text-tertiary">
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
                                <InkBadge
                                  label={a.status.replace('_', ' ')}
                                  tone={ASSIGNMENT_INK[a.status]}
                                />
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
                              <HairlineRule ink="team" />
                            </Reveal>
                          );
                        })}
                      </div>
                    )}
                  </SectionCard>
                </div>

                {/* PR / lift trend — the deepest-history completed, weighted lift. */}
                <ClimbArc
                  title={liftTrend?.label ?? 'Lift Trend'}
                  unit="lb"
                  points={liftTrend?.points ?? []}
                />
              </div>
            </Reveal>
          </TabsContent>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* LIBRARY                                                           */}
        {/* ---------------------------------------------------------------- */}
        {canManageLifting && (
          <TabsContent value="library">
            <Reveal className="space-y-6">
              <SectionCard
                eyebrow="Library"
                title="Add Exercise"
                description="Exercises you add here power your programs, quick-assign, and PR tracking — they share one library."
              >
                <div className="space-y-3">
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
                </div>
              </SectionCard>

              <SectionCard
                eyebrow="The catalog"
                title={
                  <>
                    Exercise Library
                    <StatReadout
                      value={exercises.length}
                      className="ml-2 text-body-sm text-text-tertiary"
                      ariaLabel="exercises in library"
                    />
                  </>
                }
                trailing={
                  exercises.length > 0 ? (
                    <Input
                      placeholder="Search exercises…"
                      value={exQuery}
                      onChange={(e) => setExQuery(e.target.value)}
                      className="sm:max-w-xs"
                    />
                  ) : undefined
                }
              >
                {exercises.length === 0 ? (
                  <EditorsLetter
                    title="Library is empty."
                    body="Add your team's core lifts so you can build programs and quick-assign them."
                  />
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
                      <EditorsLetter
                        title="No matches."
                        body={`Nothing in the library matches “${exQuery.trim()}”.`}
                      />
                    );
                  }
                  return (
                    <div>
                      {filtered.map((e, i) => (
                        <Reveal key={e.id} staggerIndex={Math.min(i, 10)}>
                          <div className="flex flex-wrap items-center gap-3 py-3.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-annual text-body-lg text-text-primary">
                                {e.name}
                              </p>
                              {(e.equipment || e.instructions) && (
                                <p className="truncate font-annual text-body-sm text-text-tertiary">
                                  {e.equipment ? e.equipment : ''}
                                  {e.equipment && e.instructions ? ' · ' : ''}
                                  {e.instructions ?? ''}
                                </p>
                              )}
                            </div>
                            <InkBadge label={CATEGORY_LABEL[e.category] ?? e.category} tone="team" />
                            {e.body_region && (
                              <InkBadge label={e.body_region.replace('_', ' ')} tone="neutral" />
                            )}
                            {e.is_global && <InkBadge label="Global" tone="neutral" />}
                          </div>
                          <HairlineRule ink="team" />
                        </Reveal>
                      ))}
                    </div>
                  );
                })()}
              </SectionCard>
            </Reveal>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
