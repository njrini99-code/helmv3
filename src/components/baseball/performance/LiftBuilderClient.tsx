'use client';

// =============================================================================
// src/components/baseball/performance/LiftBuilderClient.tsx
//
// Wave 4 — Lift Builder client surface (advanced lift planning).
//
// Three zones on a single full-height surface:
//
//   TOP    — Group scope selector + GroupAvailabilityGrid: select "Whole team"
//             or a named strength group. The grid shows each member's weekly
//             availability block for scheduling reference. Per-player toggling
//             in the grid is purely visual — the save scope is driven by the
//             scope selector, not individual player checkboxes.
//             NOTE: week navigation controls the slot labels only; re-fetching
//             server-side availability for a different week is deferred to Wave 5.
//
//   CENTER — LiftCanvas: three-pane drag-drop session builder (Wave 4 already
//             built). Receives the full exercise library + soreness flags so it
//             can surface conflict warnings as exercises are added.
//
//   BOTTOM — Save bar: session title + date + a Save button that calls
//             saveLiftSessionPlan with the selected scope (teamId or groupId).
//
//   MODAL  — ExerciseWizard: launched by "New exercise". onSubmit is wired to
//             createBuilderExercise / updateBuilderExercise. On success the
//             new exercise is prepended to local library state (optimistic).
//
// Draft state never touches the server until Save. Server actions enforce auth
// + capability + Sentry scoping regardless of what the client sends.
// =============================================================================

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconPlus,
  IconSave,
  IconChevronLeft,
  IconChevronRight,
  IconUsers,
  IconCheckCircle2,
  IconAlertCircle,
} from '@/components/icons';
import { GroupAvailabilityGrid } from '@/components/baseball/ui';
import { LiftCanvas } from '@/components/baseball/performance/lift-canvas';
import { ExerciseWizard } from '@/components/baseball/performance/ExerciseWizard';
import {
  saveLiftSessionPlan,
  createBuilderExercise,
  updateBuilderExercise,
  getGroupAvailabilityForWeek,
} from '@/app/baseball/actions/lift-builder';
import type {
  BuilderExercise,
  GroupSorenessFlag,
  GroupAvailabilityCell,
  LiftSessionDraftBlock,
} from '@/lib/baseball/exercise-conflict';

// =============================================================================
// Types
// =============================================================================

export interface LiftBuilderClientProps {
  teamId: string;
  /** Exercise library for this team (with stress-profile columns). */
  library: BuilderExercise[];
  /** Aggregated soreness flags for the team this week. */
  groupSoreness: GroupSorenessFlag[];
  /** Per-player weekly availability cells (initial server fetch — team-scoped). */
  availability: GroupAvailabilityCell[];
  /** Strength groups available for scoping the save target. */
  groups: ReadonlyArray<{ id: string; name: string }>;
  /** ISO YYYY-MM-DD Monday of the initial availability window. */
  weekOf: string;
}

// =============================================================================
// Helpers
// =============================================================================

/** Shift a YYYY-MM-DD by N days (UTC-safe). */
function shiftDate(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `ymd` (ISO, UTC). */
function mondayOf(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const daysBack = d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1;
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD for today (local). */
function todayYmd(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/** "Mon Jun 23 – Sun Jun 29" style label for a week. */
function weekLabel(weekOf: string): string {
  const start = new Date(`${weekOf}T00:00:00Z`);
  const end = new Date(`${weekOf}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

/** Build 7 human-readable slot labels (e.g. "Mon 6/23") for a week. */
function buildSlots(weekOf: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(`${weekOf}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'numeric',
      day: 'numeric',
      timeZone: 'UTC',
    });
  });
}

// Sentinel value for the "whole team" scope option.
const WHOLE_TEAM_VALUE = '__team__';

// =============================================================================
// LiftBuilderClient
// =============================================================================

export function LiftBuilderClient({
  teamId,
  library: initialLibrary,
  groupSoreness,
  availability,
  groups,
  weekOf: initialWeekOf,
}: LiftBuilderClientProps) {
  const reduce = useReducedMotion();

  // ── Library (optimistic on exercise create/update) ─────────────────────────
  const [library, setLibrary] = useState<BuilderExercise[]>(initialLibrary);

  // ── Draft canvas blocks ────────────────────────────────────────────────────
  const [draftBlocks, setDraftBlocks] = useState<LiftSessionDraftBlock[]>([]);

  // ── Availability cells (refetched on week navigation) ──────────────────────
  const [availabilityCells, setAvailabilityCells] = useState<GroupAvailabilityCell[]>(availability);

  // ── Per-player selection ───────────────────────────────────────────────────
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(
    () => new Set(availability.map((c) => c.playerId)),
  );

  // ── Week navigation — shifts slots AND (Wave 5) refetches server data ──────
  const [weekOf, setWeekOf] = useState<string>(initialWeekOf);
  const slots = buildSlots(weekOf);
  const [weekNavPending, startWeekNav] = useTransition();

  /** Navigate to the previous or next week, refetching server availability. */
  function navigateWeek(direction: -1 | 1) {
    const newWeek = shiftDate(mondayOf(weekOf), direction * 7);
    setWeekOf(newWeek);
    startWeekNav(async () => {
      try {
        const cells = await getGroupAvailabilityForWeek({
          teamId,
          groupId: selectedGroupId ?? undefined,
          weekOf: newWeek,
        });
        setAvailabilityCells(cells);
        setSelectedPlayerIds(new Set(cells.map((c) => c.playerId)));
      } catch {
        // Keep the prior week's cells if the refetch fails; the labels still advance.
      }
    });
  }

  // ── Per-player toggle on the grid (drives saveLiftSessionPlan scope) ───────
  function togglePlayer(id: string) {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Group scope selector ───────────────────────────────────────────────────
  // '' (or WHOLE_TEAM_VALUE) → save to all team members
  // A group id → save to that group only
  const [scopeValue, setScopeValue] = useState<string>(WHOLE_TEAM_VALUE);
  const selectedGroupId: string | null =
    scopeValue === WHOLE_TEAM_VALUE ? null : scopeValue;
  const selectedGroupName =
    groups.find((g) => g.id === selectedGroupId)?.name ?? 'Whole team';

  // ── Session metadata ───────────────────────────────────────────────────────
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDate, setSessionDate] = useState(todayYmd);

  // ── Exercise Wizard ────────────────────────────────────────────────────────
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<
    Partial<BuilderExercise> | undefined
  >(undefined);

  // ── Save state ─────────────────────────────────────────────────────────────
  const [saveMsg, setSaveMsg] = useState<{
    text: string;
    tone: 'success' | 'error';
  } | null>(null);
  const [saving, startSave] = useTransition();

  // ── Save handler ───────────────────────────────────────────────────────────
  function handleSave() {
    if (!sessionTitle.trim()) {
      setSaveMsg({ text: 'Enter a session title before saving.', tone: 'error' });
      return;
    }
    if (!sessionDate) {
      setSaveMsg({ text: 'Choose a session date.', tone: 'error' });
      return;
    }
    const hasExercises = draftBlocks.some((b) => b.exercises.length > 0);
    if (!hasExercises) {
      setSaveMsg({
        text: 'Add at least one exercise to a block before saving.',
        tone: 'error',
      });
      return;
    }
    if (selectedPlayerIds.size === 0) {
      setSaveMsg({
        text: 'Select at least one athlete before saving.',
        tone: 'error',
      });
      return;
    }
    setSaveMsg(null);
    startSave(async () => {
      try {
        const res = await saveLiftSessionPlan({
          teamId,
          groupId: selectedGroupId ?? undefined,
          date: sessionDate,
          title: sessionTitle.trim(),
          blocks: draftBlocks,
          // Always send the explicit per-player selection. An empty set means
          // "nobody" — never fall back to the whole team/group.
          playerIds: [...selectedPlayerIds],
        });
        if (res.success) {
          setSaveMsg({
            text: `Saved — ${res.count ?? 0} session${res.count !== 1 ? 's' : ''} materialized for ${selectedGroupName}.`,
            tone: 'success',
          });
        } else {
          setSaveMsg({
            text: res.error ?? 'Could not save the session plan.',
            tone: 'error',
          });
        }
      } catch (e) {
        setSaveMsg({
          text:
            e instanceof Error
              ? e.message
              : 'Could not save the session plan.',
          tone: 'error',
        });
      }
    });
  }

  // ── Exercise Wizard submit ─────────────────────────────────────────────────
  async function handleWizardSubmit(value: BuilderExercise) {
    if (editingExercise?.id) {
      const res = await updateBuilderExercise({
        exerciseId: value.id,
        name: value.name,
        category:
          value.category as Parameters<typeof updateBuilderExercise>[0]['category'],
        movementPattern: value.movementPattern || null,
        primaryBodyRegions: value.primaryBodyRegions,
        secondaryBodyRegions: value.secondaryBodyRegions,
        stressRegions: value.stressRegions,
        throwingArmStress: value.throwingArmStress,
        spineLoading: value.spineLoading,
        lowerBodyLoading: value.lowerBodyLoading,
        rotationalStress: value.rotationalStress,
        gripStress: value.gripStress,
        isPitcherSensitive: value.isPitcherSensitive,
        equipment: value.equipment,
        demoVideoUrl: value.demoVideoUrl,
      });
      if (!res.success) throw new Error(res.error ?? 'Could not update exercise.');
      setLibrary((prev) => prev.map((ex) => (ex.id === value.id ? value : ex)));
    } else {
      const res = await createBuilderExercise({
        name: value.name,
        category:
          value.category as Parameters<typeof createBuilderExercise>[0]['category'],
        movementPattern: value.movementPattern || null,
        primaryBodyRegions: value.primaryBodyRegions,
        secondaryBodyRegions: value.secondaryBodyRegions,
        stressRegions: value.stressRegions,
        throwingArmStress: value.throwingArmStress,
        spineLoading: value.spineLoading,
        lowerBodyLoading: value.lowerBodyLoading,
        rotationalStress: value.rotationalStress,
        gripStress: value.gripStress,
        isPitcherSensitive: value.isPitcherSensitive,
        equipment: value.equipment,
        demoVideoUrl: value.demoVideoUrl,
      });
      if (!res.success) throw new Error(res.error ?? 'Could not create exercise.');
      const newEx: BuilderExercise = { ...value, id: res.id ?? value.id };
      setLibrary((prev) => [newEx, ...prev]);
    }
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  const scopeOptions = [
    { value: WHOLE_TEAM_VALUE, label: 'Whole team' },
    ...groups.map((g) => ({ value: g.id, label: g.name })),
  ];

  return (
    <motion.div
      className="space-y-6"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-2 text-xs font-medium text-warm-400"
          >
            <Link
              href="/baseball/dashboard/performance"
              className="rounded transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              Performance
            </Link>
            <span aria-hidden>/</span>
            <span className="text-warm-600" aria-current="page">
              Lift Builder
            </span>
          </nav>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-warm-900">
            Lift Builder
          </h1>
          <p className="mt-0.5 text-sm text-warm-500">
            Drag exercises into blocks, review conflict warnings, then save to
            a group or the whole team at once.
          </p>
        </div>
        <Button
          variant="outline"
          leftIcon={<IconPlus size={16} />}
          onClick={() => {
            setEditingExercise(undefined);
            setWizardOpen(true);
          }}
        >
          New exercise
        </Button>
      </div>

      {/* ── Scope + Availability ─────────────────────────────────────────── */}
      <section aria-labelledby="avail-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h2
                id="avail-heading"
                className="text-base font-semibold text-warm-900"
              >
                Group availability
              </h2>
              <p className="text-xs text-warm-500">
                Select a scope — sessions will be assigned to all members of
                the chosen group or team.
              </p>
            </div>
            {scopeOptions.length > 1 && (
              <Select
                label="Scope"
                options={scopeOptions}
                value={scopeValue}
                onChange={setScopeValue}
                className="w-48"
              />
            )}
          </div>

          {/* Week navigation */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous week"
              onClick={() => navigateWeek(-1)}
              disabled={weekNavPending}
            >
              <IconChevronLeft size={16} />
            </Button>
            <span className="max-w-[13rem] text-center text-sm font-medium text-warm-700">
              {weekLabel(weekOf)}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next week"
              onClick={() => navigateWeek(1)}
              disabled={weekNavPending}
            >
              <IconChevronRight size={16} />
            </Button>
          </div>
        </div>

        {availability.length === 0 ? (
          <Card className="p-8">
            <EmptyState
              icon={<IconUsers size={36} />}
              title="No players in roster"
              description="Add players to your team roster so they appear here for scheduling."
            />
          </Card>
        ) : (
          <div
            className={
              weekNavPending
                ? 'opacity-50 transition-opacity duration-150'
                : 'transition-opacity duration-150'
            }
            aria-busy={weekNavPending}
          >
            <GroupAvailabilityGrid
              cells={availabilityCells}
              slots={slots}
              selectedPlayerIds={selectedPlayerIds}
              onTogglePlayer={togglePlayer}
            />
          </div>
        )}
      </section>

      {/* ── Lift Canvas ───────────────────────────────────────────────────── */}
      <section aria-labelledby="canvas-heading" className="min-h-[560px]">
        <h2 id="canvas-heading" className="sr-only">
          Session canvas
        </h2>
        <LiftCanvas
          library={library}
          groupSoreness={groupSoreness}
          onChange={setDraftBlocks}
        />
      </section>

      {/* ── Save Bar ──────────────────────────────────────────────────────── */}
      <Card className="sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center gap-4 p-4">
        <div className="flex min-w-0 flex-1 flex-wrap gap-3">
          <Input
            className="min-w-[200px] flex-1"
            placeholder="Session title (e.g. Lower body — Monday)"
            value={sessionTitle}
            onChange={(e) => setSessionTitle(e.target.value)}
            aria-label="Session title"
          />
          <Input
            type="date"
            className="w-44"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            aria-label="Session date"
          />
        </div>

        <div className="flex items-center gap-3">
          {saveMsg && (
            <p
              role="status"
              aria-live="polite"
              className={`flex items-center gap-1.5 text-sm font-medium ${
                saveMsg.tone === 'error' ? 'text-red-600' : 'text-primary-700'
              }`}
            >
              {saveMsg.tone === 'error' ? (
                <IconAlertCircle size={14} aria-hidden />
              ) : (
                <IconCheckCircle2 size={14} aria-hidden />
              )}
              {saveMsg.text}
            </p>
          )}
          <Button
            variant="primary"
            leftIcon={<IconSave size={16} />}
            onClick={handleSave}
            isLoading={saving}
          >
            Save — {selectedPlayerIds.size} selected athlete
            {selectedPlayerIds.size === 1 ? '' : 's'}
          </Button>
        </div>
      </Card>

      {/* ── Exercise Wizard (modal) ────────────────────────────────────────── */}
      {wizardOpen && (
        <ExerciseWizard
          initial={editingExercise}
          onSubmit={handleWizardSubmit}
          onClose={() => {
            setWizardOpen(false);
            setEditingExercise(undefined);
          }}
        />
      )}
    </motion.div>
  );
}

// =============================================================================
// Loading skeleton — re-exported for page-level loading.tsx if needed.
// =============================================================================

export function LiftBuilderSkeleton() {
  return (
    <div
      className="space-y-6"
      aria-busy="true"
      aria-label="Loading lift builder…"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>

      {/* Availability grid */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-44" />
        <div className="overflow-x-auto">
          <div
            className="rounded-2xl border border-warm-100 overflow-hidden"
            style={{ display: 'grid', gridTemplateColumns: '160px repeat(7, 1fr)' }}
          >
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11 rounded-none" />
            ))}
            {Array.from({ length: 24 }).map((_, i) => (
              <Skeleton key={i + 8} className="h-11 rounded-none" />
            ))}
          </div>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex flex-col gap-4 lg:flex-row min-h-[480px]">
        <Skeleton className="w-64 flex-shrink-0 rounded-2xl" />
        <div className="flex-1 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="w-72 flex-shrink-0 rounded-2xl" />
      </div>

      {/* Save bar */}
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-xl" />
        <Skeleton className="h-10 w-44 rounded-xl" />
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>
    </div>
  );
}
