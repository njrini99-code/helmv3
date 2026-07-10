'use client';

// =============================================================================
// src/components/baseball/performance/lift-canvas/ExerciseBin.tsx
//
// Body-part-filtered exercise browser — the LEFT pane of LiftCanvas. Exercises
// are draggable via @dnd-kit/core (useDraggable). Filter controls:
//   • Full-text search (name, category)
//   • Body-region group selector (maps SorenessRegionGroup → exercise regions)
//   • Pitcher-safe toggle (hides isPitcherSensitive exercises)
//   • Avoid-sore-regions toggle (hides exercises whose stressRegions overlap
//     with high-severity groupSoreness entries)
//
// A quick-add (+) button is rendered on hover/focus so keyboard users can add
// exercises without drag. Data state lives in the parent (LiftCanvas); this
// component is purely presentational.
// =============================================================================

import { useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  IconSearch,
  IconShieldCheck,
  IconWarning,
  IconPlus,
} from '@/components/icons';
import { EditorsLetter } from '@/components/baseball/living-annual';
import type { BuilderExercise, GroupSorenessFlag, StressLevel } from '@/lib/baseball/exercise-conflict';
import {
  SORENESS_REGIONS,
  type SorenessRegionGroup,
} from '@/lib/lifting/soreness-regions';

// ─── Region group metadata ────────────────────────────────────────────────────

const REGION_GROUPS: ReadonlyArray<{ group: SorenessRegionGroup; label: string }> = [
  { group: 'upper_body', label: 'Upper' },
  { group: 'trunk', label: 'Trunk' },
  { group: 'hips', label: 'Hips' },
  { group: 'lower_body', label: 'Lower' },
  { group: 'whole_body', label: 'General' },
];

// Map each SorenessRegionGroup → the region ID strings belonging to it.
const REGION_GROUP_IDS = Object.entries(SORENESS_REGIONS).reduce<
  Partial<Record<SorenessRegionGroup, string[]>>
>((acc, [id, region]) => {
  const g = region.group as SorenessRegionGroup;
  const prev = acc[g] ?? [];
  return { ...acc, [g]: [...prev, id] };
}, {});

// ─── Stress helpers ───────────────────────────────────────────────────────────

const STRESS_WEIGHT: Record<StressLevel, number> = { none: 0, low: 1, medium: 2, high: 3 };

function maxStressLevel(ex: BuilderExercise): StressLevel {
  const w = Math.max(
    STRESS_WEIGHT[ex.throwingArmStress],
    STRESS_WEIGHT[ex.spineLoading],
    STRESS_WEIGHT[ex.lowerBodyLoading],
    STRESS_WEIGHT[ex.rotationalStress],
    STRESS_WEIGHT[ex.gripStress],
  );
  return (['none', 'low', 'medium', 'high'] as const)[w as 0 | 1 | 2 | 3];
}

// Dateline-rule tone (replaces the retired border-l-2 stress stripe) — a
// short h-[2px] w-7 rounded-full rule above the card title, same color per
// stress level. The existing stress pill (below) still carries the label;
// the rule is the quieter graphic echo of it, not a replacement for it.
// Lane-ink ordinal ramp (spec §4.2 two-ink law): `low` stays team-quiet,
// `medium`/`high` both read pursuit clay at increasing weight — no amber,
// no orange, no red.
const STRESS_CLS: Record<StressLevel, string> = {
  none: '',
  low: 'bg-grade-plus/50',
  medium: 'bg-pursuit/60',
  high: 'bg-pursuit',
};

// ─── Draggable exercise card ──────────────────────────────────────────────────

interface ExerciseCardProps {
  exercise: BuilderExercise;
  groupSoreness: GroupSorenessFlag[];
  onAdd: (exercise: BuilderExercise) => void;
}

function ExerciseCard({ exercise, groupSoreness, onAdd }: ExerciseCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `bin-${exercise.id}`,
    data: { type: 'bin-exercise' as const, exercise },
  });

  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  // Highlight border when exercise overlaps sore regions (severity ≥ 4)
  const hasSorenessOverlap = useMemo(
    () =>
      exercise.stressRegions.some((r) =>
        groupSoreness.some((s) => s.bodyRegion === r && s.maxSeverity >= 4),
      ),
    [exercise.stressRegions, groupSoreness],
  );

  const stress = maxStressLevel(exercise);
  const ruleAccent = hasSorenessOverlap ? 'bg-pursuit' : stress !== 'none' ? STRESS_CLS[stress] : '';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'group relative rounded-xl border bg-cream-50 px-3 py-2.5 transition-shadow',
        isDragging ? 'opacity-40 shadow-xl' : 'border-warm-100 hover:border-warm-200 hover:shadow-sm',
      ].join(' ')}
    >
      {/* Drag handle area covering most of the card */}
      <div
        className="cursor-grab active:cursor-grabbing"
        {...listeners}
        {...attributes}
        aria-label={`Drag ${exercise.name} to a session block`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {ruleAccent && <span aria-hidden className={`mb-1 block h-[2px] w-7 rounded-full ${ruleAccent}`} />}
            <p className="truncate text-sm font-medium text-warm-900">{exercise.name}</p>
            <p className="text-eyebrow text-warm-400">{exercise.category}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {exercise.isPitcherSensitive && (
              <span className="inline-flex items-center rounded-full bg-pursuit/10 px-1.5 py-0.5 text-micro font-medium text-pursuit">
                Pitcher ⚡
              </span>
            )}
            {stress !== 'none' && (
              <span
                className={[
                  'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                  stress === 'high'
                    ? 'border-pursuit/50 bg-pursuit/20 text-pursuit'
                    : stress === 'medium'
                    ? 'border-pursuit/30 bg-pursuit/10 text-pursuit'
                    : 'border-grade-plus/30 bg-grade-plus/10 text-grade-plus',
                ].join(' ')}
              >
                {stress}
              </span>
            )}
          </div>
        </div>

        {exercise.primaryBodyRegions.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {exercise.primaryBodyRegions.slice(0, 3).map((r) => (
              <span
                key={r}
                className="rounded-full bg-warm-100 px-1.5 py-0.5 text-micro text-warm-500"
              >
                {r}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Quick-add button — visible on hover / keyboard focus, so non-drag users can add */}
      <Button
        variant="ghost"
        size="icon-sm"
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onAdd(exercise);
        }}
        className="absolute right-1.5 top-1.5 flex items-center justify-center rounded-lg bg-primary-100 p-1 text-primary-700 opacity-0 pointer-events-none transition-opacity hover:bg-primary-200 focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 group-hover:opacity-100 group-hover:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
        aria-label={`Add ${exercise.name} to selected block`}
      >
        <IconPlus size={13} />
      </Button>
    </div>
  );
}

// ─── ExerciseBin ─────────────────────────────────────────────────────────────

export interface ExerciseBinProps {
  library: BuilderExercise[];
  groupSoreness: GroupSorenessFlag[];
  /** Currently-selected body region group filter (null = show all). */
  selectedRegionGroup: SorenessRegionGroup | null;
  onRegionGroupChange: (group: SorenessRegionGroup | null) => void;
  pitcherSafeOnly: boolean;
  onPitcherSafeChange: (val: boolean) => void;
  avoidSoreRegions: boolean;
  onAvoidSoreChange: (val: boolean) => void;
  search: string;
  onSearchChange: (val: string) => void;
  /** Called when user clicks the quick-add (+) button on an exercise card. */
  onAddExercise: (exercise: BuilderExercise) => void;
}

export function ExerciseBin({
  library,
  groupSoreness,
  selectedRegionGroup,
  onRegionGroupChange,
  pitcherSafeOnly,
  onPitcherSafeChange,
  avoidSoreRegions,
  onAvoidSoreChange,
  search,
  onSearchChange,
  onAddExercise,
}: ExerciseBinProps) {
  // Sore region IDs at severity ≥ 4 (i.e. meaningful soreness)
  const soreRegionIds = useMemo(
    () => new Set(groupSoreness.filter((s) => s.maxSeverity >= 4).map((s) => s.bodyRegion)),
    [groupSoreness],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const regionIds = selectedRegionGroup
      ? (REGION_GROUP_IDS[selectedRegionGroup] ?? [])
      : null;

    return library.filter((ex) => {
      if (
        q &&
        !ex.name.toLowerCase().includes(q) &&
        !ex.category.toLowerCase().includes(q)
      )
        return false;
      if (pitcherSafeOnly && ex.isPitcherSensitive) return false;
      if (
        avoidSoreRegions &&
        ex.stressRegions.some((r) => soreRegionIds.has(r))
      )
        return false;
      if (
        regionIds &&
        !ex.primaryBodyRegions.some((r) => regionIds.includes(r))
      )
        return false;
      return true;
    });
  }, [library, search, pitcherSafeOnly, avoidSoreRegions, soreRegionIds, selectedRegionGroup]);

  return (
    <div className="flex h-full flex-col gap-3">
      {/* ── Search ───────────────────────────────────────────────────── */}
      <div className="relative">
        <IconSearch
          size={14}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-warm-400"
          aria-hidden
        />
        <Input
          className="pl-8"
          placeholder="Search exercises…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label="Search exercise library"
        />
      </div>

      {/* ── Safety toggles ───────────────────────────────────────────── */}
      <fieldset className="space-y-1.5">
        <legend className="sr-only">Safety filters</legend>
        <div className="flex cursor-pointer items-center gap-2">
          <Checkbox
            id="pitcher-safe-filter"
            checked={pitcherSafeOnly}
            onChange={(e) =>
              onPitcherSafeChange((e.target as HTMLInputElement).checked)
            }
          />
          <label htmlFor="pitcher-safe-filter" className="flex cursor-pointer items-center gap-1 text-xs text-warm-600">
            <IconShieldCheck size={13} className="text-primary-500" aria-hidden />
            Pitcher-safe only
          </label>
        </div>
        <div className="flex cursor-pointer items-center gap-2">
          <Checkbox
            id="avoid-sore-filter"
            checked={avoidSoreRegions}
            onChange={(e) =>
              onAvoidSoreChange((e.target as HTMLInputElement).checked)
            }
          />
          <label htmlFor="avoid-sore-filter" className="flex cursor-pointer items-center gap-1 text-xs text-warm-600">
            <IconWarning size={13} className="text-pursuit" aria-hidden />
            Avoid sore regions
          </label>
        </div>
      </fieldset>

      {/* ── Region group filter ──────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by body region">
        <Button
          variant="ghost"
          type="button"
          onClick={() => onRegionGroupChange(null)}
          aria-pressed={selectedRegionGroup === null}
          className={[
            'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors min-h-[44px]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
            selectedRegionGroup === null
              ? 'border-primary-300 bg-primary-100 text-primary-800'
              : 'border-warm-200 bg-cream-50 text-warm-600 hover:bg-warm-50',
          ].join(' ')}
        >
          All
        </Button>
        {REGION_GROUPS.map(({ group, label }) => (
          <Button
            key={group}
            variant="ghost"
            type="button"
            onClick={() =>
              onRegionGroupChange(selectedRegionGroup === group ? null : group)
            }
            aria-pressed={selectedRegionGroup === group}
            className={[
              'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors min-h-[44px]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
              selectedRegionGroup === group
                ? 'border-primary-300 bg-primary-100 text-primary-800'
                : 'border-warm-200 bg-cream-50 text-warm-600 hover:bg-warm-50',
            ].join(' ')}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* ── Exercise list ────────────────────────────────────────────── */}
      <div className="flex-1 space-y-2 overflow-y-auto" aria-label="Exercise list">
        {filtered.length === 0 ? (
          // No EMPTY_ISSUE_PRESETS variant covers "filtered to zero" for the
          // exercise library, so this composes EditorsLetter directly with the
          // exact prior copy (narrow-sidebar padding override — this mounts in
          // a lg:w-64 column, where the letter's default px-7 py-8 overflows).
          <EditorsLetter
            title="No exercises match."
            body="Adjust filters or search to find exercises."
            className="px-4 py-6"
          />
        ) : (
          filtered.map((ex) => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              groupSoreness={groupSoreness}
              onAdd={onAddExercise}
            />
          ))
        )}
      </div>

      <p className="text-center text-eyebrow text-warm-400" aria-live="polite">
        {filtered.length} of {library.length} exercises
      </p>
    </div>
  );
}
