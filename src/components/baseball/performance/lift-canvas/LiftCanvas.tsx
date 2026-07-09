'use client';

// =============================================================================
// src/components/baseball/performance/lift-canvas/LiftCanvas.tsx
//
// Three-pane drag-drop session builder (Wave 4 — advanced lift planning).
//
//   LEFT   — Body-region filter + pitcher-safe / avoid-sore-regions toggles
//             + ExerciseBin (draggable exercise cards filtered by selection).
//
//   CENTER — Session canvas: 7 LiftBlockType blocks (warmup → recovery).
//             Exercises drag in from the bin, reorder within a block, or move
//             between blocks via @dnd-kit (PointerSensor + KeyboardSensor).
//             Blocks themselves reorder via up/down keyboard buttons.
//
//   RIGHT  — Selected-exercise detail: primary/secondary regions, stress
//             profile, equipment, suggested substitutes. Conflict warning via
//             CommandCard with keep / swap-for-affected / replace-all.
//
// Props:
//   library        — full exercise library (BuilderExercise[])
//   groupSoreness  — aggregated group soreness flags (GroupSorenessFlag[])
//   initialBlocks  — optional pre-seeded draft blocks
//   onChange       — called whenever blocks change (no server calls here)
//
// Conflict detection: every exercise added is scored via scoreExerciseConflict
// from '@/lib/baseball/exercise-conflict'. Scores live in a local Map<draftId,
// ExerciseConflict> so re-renders stay cheap.
// =============================================================================

import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { motion, useReducedMotion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { CommandCard } from '@/components/baseball/ui/CommandCard';
import {
  IconDumbbell,
  IconInfo,
  IconChevronUp,
  IconChevronDown,
  IconWarning,
} from '@/components/icons';
import { ExerciseBin } from './ExerciseBin';
import { SessionBlock } from './SessionBlock';
import type {
  BuilderExercise,
  GroupSorenessFlag,
  LiftSessionDraftBlock,
  LiftDraftExercise,
  ExerciseConflict,
  LiftBlockType,
} from '@/lib/baseball/exercise-conflict';
import { scoreExerciseConflict, suggestSubstitutions } from '@/lib/baseball/exercise-conflict';
import type { SorenessRegionGroup } from '@/lib/lifting/soreness-regions';

// ─── Default block set ────────────────────────────────────────────────────────

const DEFAULT_BLOCK_ORDER: LiftBlockType[] = [
  'warmup', 'power', 'main', 'accessory', 'arm_care', 'conditioning', 'recovery',
];

const DEFAULT_BLOCK_TITLES: Record<LiftBlockType, string> = {
  warmup: 'Warmup',
  power: 'Power',
  main: 'Main Strength',
  accessory: 'Accessory',
  arm_care: 'Arm Care',
  conditioning: 'Conditioning',
  recovery: 'Recovery',
};

function buildDefaultBlocks(): LiftSessionDraftBlock[] {
  return DEFAULT_BLOCK_ORDER.map((type) => ({
    id: `default-${type}`,
    type,
    title: DEFAULT_BLOCK_TITLES[type],
    exercises: [],
  }));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function draftId(): string {
  return `d-${crypto.randomUUID()}`;
}

/** Returns the blockId that owns the given draftId, or undefined. */
function blockForDraft(
  targetDraftId: string,
  blocks: LiftSessionDraftBlock[],
): string | undefined {
  return blocks.find((b) => b.exercises.some((e) => e.id === targetDraftId))?.id;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface LiftCanvasProps {
  library: BuilderExercise[];
  groupSoreness: GroupSorenessFlag[];
  initialBlocks?: LiftSessionDraftBlock[];
  onChange: (blocks: LiftSessionDraftBlock[]) => void;
}

// ─── Detail / conflict pane ───────────────────────────────────────────────────

interface DetailPaneProps {
  exercise: BuilderExercise | null;
  conflict: ExerciseConflict | null;
  library: BuilderExercise[];
  groupSoreness: GroupSorenessFlag[];
  onKeepConflict: () => void;
  onSwapForAffected: (sub: BuilderExercise) => void;
  onReplaceAll: (sub: BuilderExercise) => void;
}

function DetailPane({
  exercise,
  conflict,
  library,
  groupSoreness,
  onKeepConflict,
  onSwapForAffected,
  onReplaceAll,
}: DetailPaneProps) {
  const substitutes = useMemo(
    () => (exercise ? suggestSubstitutions(exercise, library, groupSoreness) : []),
    [exercise, library, groupSoreness],
  );

  if (!exercise) {
    return (
      <Card className="flex h-full flex-col items-center justify-center p-6">
        <EmptyState
          icon={<IconInfo size={28} />}
          title="Select an exercise"
          description="Click any exercise in a block to see its stress profile and substitutes."
        />
      </Card>
    );
  }

  const sub = substitutes[0];

  const stressRows: ReadonlyArray<{ label: string; value: string }> = [
    { label: 'Throwing arm', value: exercise.throwingArmStress },
    { label: 'Spine loading', value: exercise.spineLoading },
    { label: 'Lower body',   value: exercise.lowerBodyLoading },
    { label: 'Rotational',   value: exercise.rotationalStress },
    { label: 'Grip',         value: exercise.gripStress },
  ].filter((r) => r.value !== 'none');

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto">
      {/* Conflict warning card */}
      {conflict && conflict.level !== 'none' && (
        <CommandCard
          tone={conflict.level === 'high' ? 'urgent' : 'watch'}
          eyebrow="Exercise conflict"
          title={`${exercise.name} — ${conflict.level === 'high' ? 'High risk' : 'Use caution'}`}
          description={conflict.warnings.join(' · ')}
          evidence={conflict.affectedRegions.slice(0, 3).map((r) => (
            <span
              key={r}
              className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-eyebrow font-medium text-red-700"
            >
              {r}
            </span>
          ))}
          actions={[
            { label: 'Keep', onClick: onKeepConflict },
            ...(sub
              ? [
                  {
                    label: `Swap → ${sub.name}`,
                    onClick: () => onSwapForAffected(sub),
                  },
                  {
                    label: 'Replace all',
                    onClick: () => onReplaceAll(sub),
                  },
                ]
              : []),
          ]}
        />
      )}

      {/* Detail card */}
      <Card className="space-y-4 p-4">
        {/* Identity */}
        <div>
          <p className="text-eyebrow font-semibold uppercase tracking-wide text-warm-400">
            Exercise detail
          </p>
          <h3 className="mt-0.5 text-base font-semibold text-warm-900">{exercise.name}</h3>
          <p className="text-xs text-warm-500">
            {exercise.category} · {exercise.movementPattern}
          </p>
        </div>

        {/* Pitcher-sensitive flag */}
        {exercise.isPitcherSensitive && (
          <div className="flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-700">
            <IconWarning size={13} aria-hidden />
            Pitcher-sensitive — caution in-season
          </div>
        )}

        {/* Body regions */}
        {exercise.primaryBodyRegions.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-warm-500">Primary regions</p>
            <div className="flex flex-wrap gap-1">
              {exercise.primaryBodyRegions.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {exercise.secondaryBodyRegions.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-warm-500">Secondary regions</p>
            <div className="flex flex-wrap gap-1">
              {exercise.secondaryBodyRegions.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-warm-100 px-2 py-0.5 text-xs text-warm-600"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Stress profile */}
        {stressRows.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-warm-500">Stress profile</p>
            <div className="space-y-1">
              {stressRows.map((row) => (
                <div key={row.label} className="flex items-center justify-between text-xs">
                  <span className="text-warm-600">{row.label}</span>
                  <span
                    className={
                      row.value === 'high'
                        ? 'font-semibold text-red-600'
                        : row.value === 'medium'
                        ? 'font-semibold text-amber-600'
                        : 'text-warm-500'
                    }
                  >
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Equipment */}
        {exercise.equipment.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-warm-500">Equipment</p>
            <div className="flex flex-wrap gap-1">
              {exercise.equipment.map((eq) => (
                <span
                  key={eq}
                  className="rounded-full border border-warm-200 bg-cream-50 px-2 py-0.5 text-xs text-warm-600"
                >
                  {eq}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Substitutes */}
        {substitutes.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-warm-500">
              Suggested substitutes
            </p>
            <div className="space-y-1">
              {substitutes.slice(0, 4).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-warm-100 bg-warm-50 px-2.5 py-1.5"
                >
                  <span className="text-xs font-medium text-warm-800">{s.name}</span>
                  <span className="text-micro text-warm-400">{s.category}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Drag overlay preview ─────────────────────────────────────────────────────

function DragPreviewCard({ exercise }: { exercise: BuilderExercise }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-primary-200 bg-cream-50 px-3 py-2 shadow-xl">
      <IconDumbbell size={14} className="text-primary-500" />
      <span className="text-sm font-medium text-warm-900">{exercise.name}</span>
    </div>
  );
}

// ─── LiftCanvas (main component) ──────────────────────────────────────────────

export function LiftCanvas({
  library,
  groupSoreness,
  initialBlocks,
  onChange,
}: LiftCanvasProps) {
  const reduce = useReducedMotion();

  // ── State ───────────────────────────────────────────────────────────────────
  const [blocks, setBlocksState] = useState<LiftSessionDraftBlock[]>(
    () => initialBlocks ?? buildDefaultBlocks(),
  );

  // Map draftId → ExerciseConflict (scores computed on add, cleared on remove)
  const [conflictMap, setConflictMap] = useState<Map<string, ExerciseConflict>>(
    () => new Map(),
  );

  // Acknowledged conflicts: user clicked "Keep" — suppress warning for this draft
  const [acknowledgedDraftIds, setAcknowledgedDraftIds] = useState<Set<string>>(
    () => new Set(),
  );

  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);

  // ExerciseBin filter state
  const [binSearch, setBinSearch] = useState('');
  const [selectedRegionGroup, setSelectedRegionGroup] =
    useState<SorenessRegionGroup | null>(null);
  const [pitcherSafeOnly, setPitcherSafeOnly] = useState(false);
  const [avoidSoreRegions, setAvoidSoreRegions] = useState(false);

  // Active drag (for DragOverlay)
  const [activeDragExercise, setActiveDragExercise] =
    useState<BuilderExercise | null>(null);

  // Mobile tab — which pane is visible on small screens
  const [activeTab, setActiveTab] = useState<'library' | 'session' | 'details'>(
    'session',
  );

  // ── Derived ─────────────────────────────────────────────────────────────────

  /** O(1) lookup: exerciseId → BuilderExercise */
  const exerciseMap = useMemo<ReadonlyMap<string, BuilderExercise>>(
    () => new Map(library.map((ex) => [ex.id, ex])),
    [library],
  );

  /** Selected exercise resolved from the selected draftId */
  const selectedExercise = useMemo<BuilderExercise | null>(() => {
    if (!selectedDraftId) return null;
    for (const block of blocks) {
      const draft = block.exercises.find((e) => e.id === selectedDraftId);
      if (draft) return exerciseMap.get(draft.exerciseId) ?? null;
    }
    return null;
  }, [selectedDraftId, blocks, exerciseMap]);

  const selectedConflict = useMemo<ExerciseConflict | null>(() => {
    if (!selectedDraftId) return null;
    const c = conflictMap.get(selectedDraftId);
    if (!c || acknowledgedDraftIds.has(selectedDraftId)) return null;
    return c;
  }, [selectedDraftId, conflictMap, acknowledgedDraftIds]);

  // ── Block mutations ──────────────────────────────────────────────────────────

  function updateBlocks(next: LiftSessionDraftBlock[]) {
    setBlocksState(next);
    onChange(next);
  }

  function updateBlock(updated: LiftSessionDraftBlock) {
    updateBlocks(blocks.map((b) => (b.id === updated.id ? updated : b)));
  }

  /** Add an exercise to a specific block, scoring its conflict. */
  const addExerciseToBlock = useCallback(
    (blockId: string, exercise: BuilderExercise) => {
      const newDraftId = draftId();
      const newDraft: LiftDraftExercise = {
        id: newDraftId,
        exerciseId: exercise.id,
        prescription: {},
      };

      const conflict = scoreExerciseConflict(exercise, groupSoreness);
      if (conflict.level !== 'none') {
        setConflictMap((prev) => new Map(prev).set(newDraftId, conflict));
        // Auto-select so the right pane shows the warning immediately
        setSelectedDraftId(newDraftId);
      }

      updateBlocks(
        blocks.map((b) =>
          b.id === blockId
            ? { ...b, exercises: [...b.exercises, newDraft] }
            : b,
        ),
      );
    },
    [blocks, groupSoreness], // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Replace exercise at draftId with a substitute (single slot). */
  function swapExerciseForDraft(targetDraftId: string, substitute: BuilderExercise) {
    const newId = draftId();
    setConflictMap((prev) => {
      const next = new Map(prev);
      next.delete(targetDraftId);
      const score = scoreExerciseConflict(substitute, groupSoreness);
      if (score.level !== 'none') next.set(newId, score);
      return next;
    });
    setAcknowledgedDraftIds((prev) => {
      const next = new Set(prev);
      next.delete(targetDraftId);
      return next;
    });
    setSelectedDraftId(newId);
    updateBlocks(
      blocks.map((b) => ({
        ...b,
        exercises: b.exercises.map((e) =>
          e.id === targetDraftId
            ? { id: newId, exerciseId: substitute.id, prescription: e.prescription }
            : e,
        ),
      })),
    );
  }

  /** Replace ALL occurrences of the selected exercise across all blocks. */
  function replaceAllWithSubstitute(
    sourceExerciseId: string,
    substitute: BuilderExercise,
  ) {
    const idMapping = new Map<string, string>();
    const nextBlocks = blocks.map((b) => ({
      ...b,
      exercises: b.exercises.map((e) => {
        if (e.exerciseId !== sourceExerciseId) return e;
        const newId = draftId();
        idMapping.set(e.id, newId);
        return { ...e, id: newId, exerciseId: substitute.id };
      }),
    }));

    setConflictMap((prev) => {
      const next = new Map(prev);
      for (const [oldId, newId] of idMapping) {
        next.delete(oldId);
        const score = scoreExerciseConflict(substitute, groupSoreness);
        if (score.level !== 'none') next.set(newId, score);
      }
      return next;
    });
    setAcknowledgedDraftIds((prev) => {
      const next = new Set(prev);
      for (const oldId of idMapping.keys()) next.delete(oldId);
      return next;
    });
    setSelectedDraftId(null);
    updateBlocks(nextBlocks);
  }

  /** Move block up (decrement index) */
  function moveBlockUp(blockId: string) {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx <= 0) return;
    updateBlocks(arrayMove(blocks, idx, idx - 1));
  }

  /** Move block down (increment index) */
  function moveBlockDown(blockId: string) {
    const idx = blocks.findIndex((b) => b.id === blockId);
    if (idx < 0 || idx >= blocks.length - 1) return;
    updateBlocks(arrayMove(blocks, idx, idx + 1));
  }

  // ── Quick-add from ExerciseBin (keyboard + button path) ─────────────────────

  /**
   * When an exercise is quick-added from the bin (not via drag), add it to
   * the first block that is of the exercise's natural category, falling back
   * to the first block overall.
   */
  function handleQuickAdd(exercise: BuilderExercise) {
    const target =
      blocks.find((b) => b.exercises.length < 20) ?? blocks[0];
    if (target) addExerciseToBlock(target.id, exercise);
  }

  // ── Duplicate exercise (Wave 5: re-score conflict for the new draft) ─────────

  function handleDuplicateExercise(blockId: string, targetDraftId: string) {
    const block = blocks.find((b) => b.id === blockId);
    if (!block) return;
    const idx = block.exercises.findIndex((e) => e.id === targetDraftId);
    const original = block.exercises[idx];
    if (idx < 0 || original == null) return;

    const newId = draftId();
    const copy: LiftDraftExercise = {
      id: newId,
      exerciseId: original.exerciseId,
      prescription: { ...original.prescription },
    };

    // Score conflict for the duplicate and store under the new draft id
    const exercise = exerciseMap.get(original.exerciseId);
    if (exercise) {
      const conflict = scoreExerciseConflict(exercise, groupSoreness);
      if (conflict.level !== 'none') {
        setConflictMap((prev) => new Map(prev).set(newId, conflict));
      }
    }

    const nextExercises = [...block.exercises];
    nextExercises.splice(idx + 1, 0, copy);
    updateBlocks(
      blocks.map((b) =>
        b.id === blockId ? { ...b, exercises: nextExercises } : b,
      ),
    );
  }

  // ── DnD sensors ─────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // ── DnD handlers ────────────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current;
    if (data?.type === 'bin-exercise') {
      setActiveDragExercise(data.exercise as BuilderExercise);
    } else if (data?.type === 'block-exercise') {
      setActiveDragExercise(
        (data.exercise as BuilderExercise | undefined) ?? null,
      );
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragExercise(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const activeType = activeData?.type as string | undefined;

    const overId = String(over.id);

    if (activeType === 'bin-exercise') {
      // ── Bin → Block drop ─────────────────────────────────────────────────
      const exercise = activeData?.exercise as BuilderExercise | undefined;
      if (!exercise) return;

      // Determine target block
      let targetBlockId: string | undefined;
      if (overId.startsWith('block-')) {
        targetBlockId = overId.slice(6);
      } else {
        // Dropped on an existing exercise row → find its block
        targetBlockId = blockForDraft(overId, blocks);
      }

      if (targetBlockId) {
        addExerciseToBlock(targetBlockId, exercise);
      }
      return;
    }

    if (activeType === 'block-exercise') {
      // ── Block exercise reorder or move ────────────────────────────────────
      const { blockId: sourceBlockId, draftId: activeDraftId } = activeData as {
        blockId: string;
        draftId: string;
        exercise?: BuilderExercise;
      };

      // Determine target block and target position
      let targetBlockId: string | undefined;
      let targetDraftId: string | undefined;

      if (overId.startsWith('block-')) {
        targetBlockId = overId.slice(6);
      } else {
        // over is another exercise row
        targetDraftId = overId;
        targetBlockId =
          (over.data.current as { blockId?: string } | undefined)?.blockId ??
          blockForDraft(overId, blocks);
      }

      if (!targetBlockId) return;

      if (targetBlockId === sourceBlockId) {
        // ── Reorder within block ─────────────────────────────────────────
        const block = blocks.find((b) => b.id === sourceBlockId);
        if (!block) return;
        const oldIdx = block.exercises.findIndex((e) => e.id === activeDraftId);
        const newIdx = targetDraftId
          ? block.exercises.findIndex((e) => e.id === targetDraftId)
          : block.exercises.length - 1;
        if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
        updateBlocks(
          blocks.map((b) =>
            b.id === sourceBlockId
              ? { ...b, exercises: arrayMove(b.exercises, oldIdx, newIdx) }
              : b,
          ),
        );
      } else {
        // ── Move exercise to different block ─────────────────────────────
        const sourceBlock = blocks.find((b) => b.id === sourceBlockId);
        const movedDraft = sourceBlock?.exercises.find(
          (e) => e.id === activeDraftId,
        );
        if (!movedDraft) return;

        const targetBlock = blocks.find((b) => b.id === targetBlockId);
        if (!targetBlock) return;

        // Insert before targetDraftId (or at end)
        const targetIdx = targetDraftId
          ? targetBlock.exercises.findIndex((e) => e.id === targetDraftId)
          : targetBlock.exercises.length;

        const nextTarget = [...targetBlock.exercises];
        nextTarget.splice(
          targetIdx < 0 ? nextTarget.length : targetIdx,
          0,
          movedDraft,
        );

        updateBlocks(
          blocks.map((b) => {
            if (b.id === sourceBlockId) {
              return {
                ...b,
                exercises: b.exercises.filter((e) => e.id !== activeDraftId),
              };
            }
            if (b.id === targetBlockId) {
              return { ...b, exercises: nextTarget };
            }
            return b;
          }),
        );
      }
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div
      className="flex flex-col gap-4 lg:flex-row lg:h-full"
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* ── Mobile segmented tab control ──────────────────────────────── */}
      <div
        className="flex rounded-xl border border-warm-200 bg-warm-50 p-1 lg:hidden"
        role="tablist"
        aria-label="Canvas section"
      >
        {(
          [
            { id: 'library', label: 'Library' },
            { id: 'session', label: 'Session' },
            { id: 'details', label: 'Details' },
          ] as const
        ).map(({ id, label }) => (
          <Button
            key={id}
            variant="ghost"
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={[
              'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
              activeTab === id
                ? 'bg-cream-50 text-warm-900 shadow-sm'
                : 'text-warm-500 hover:text-warm-700',
            ].join(' ')}
          >
            {label}
          </Button>
        ))}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* ── LEFT PANE: body-region filter + exercise bin ──────────────── */}
        <aside
          className={[
            'flex-col rounded-2xl border border-warm-100 glass-standard p-3',
            'lg:w-64 lg:flex-shrink-0',
            activeTab === 'library' ? 'flex' : 'hidden lg:flex',
          ].join(' ')}
          aria-label="Exercise library"
        >
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-warm-400">
            Exercise Library
          </p>
          <ExerciseBin
            library={library}
            groupSoreness={groupSoreness}
            selectedRegionGroup={selectedRegionGroup}
            onRegionGroupChange={setSelectedRegionGroup}
            pitcherSafeOnly={pitcherSafeOnly}
            onPitcherSafeChange={setPitcherSafeOnly}
            avoidSoreRegions={avoidSoreRegions}
            onAvoidSoreChange={setAvoidSoreRegions}
            search={binSearch}
            onSearchChange={setBinSearch}
            onAddExercise={handleQuickAdd}
          />
        </aside>

        {/* ── CENTER PANE: session canvas ───────────────────────────────── */}
        <main
          className={[
            'min-w-0 flex-1 flex-col gap-3 overflow-y-auto',
            activeTab === 'session' ? 'flex' : 'hidden lg:flex',
          ].join(' ')}
          aria-label="Session canvas"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-warm-400">
              Session blocks
            </p>
            <p className="text-xs text-warm-400">
              {blocks.reduce((s, b) => s + b.exercises.length, 0)} exercises
            </p>
          </div>

          {blocks.map((block, idx) => (
            <div key={block.id} className="relative">
              {/* Block reorder controls */}
              <div className="absolute -left-8 top-1/2 flex -translate-y-1/2 flex-col gap-0.5">
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => moveBlockUp(block.id)}
                  disabled={idx === 0}
                  className="rounded p-0.5 text-warm-300 hover:text-warm-600 disabled:pointer-events-none disabled:opacity-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  aria-label={`Move ${block.title} block up`}
                >
                  <IconChevronUp size={14} />
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => moveBlockDown(block.id)}
                  disabled={idx === blocks.length - 1}
                  className="rounded p-0.5 text-warm-300 hover:text-warm-600 disabled:pointer-events-none disabled:opacity-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  aria-label={`Move ${block.title} block down`}
                >
                  <IconChevronDown size={14} />
                </Button>
              </div>

              <SessionBlock
                block={block}
                exerciseMap={exerciseMap}
                conflictMap={conflictMap}
                selectedDraftId={selectedDraftId}
                onSelectExercise={setSelectedDraftId}
                onUpdateBlock={updateBlock}
                onDuplicateExercise={handleDuplicateExercise}
              />
            </div>
          ))}
        </main>

        {/* ── RIGHT PANE: exercise detail + conflict warnings ───────────── */}
        <aside
          className={[
            'flex-col gap-3',
            'lg:w-72 lg:flex-shrink-0',
            activeTab === 'details' ? 'flex' : 'hidden lg:flex',
          ].join(' ')}
          aria-label="Exercise detail"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-warm-400">
            Details
          </p>
          <DetailPane
            exercise={selectedExercise}
            conflict={selectedConflict}
            library={library}
            groupSoreness={groupSoreness}
            onKeepConflict={() => {
              if (selectedDraftId) {
                setAcknowledgedDraftIds((prev) =>
                  new Set(prev).add(selectedDraftId),
                );
              }
            }}
            onSwapForAffected={(sub) => {
              if (selectedDraftId) swapExerciseForDraft(selectedDraftId, sub);
            }}
            onReplaceAll={(sub) => {
              if (selectedExercise) {
                replaceAllWithSubstitute(selectedExercise.id, sub);
              }
            }}
          />
        </aside>

        {/* ── DragOverlay: preview card while dragging ──────────────────── */}
        <DragOverlay>
          {activeDragExercise && (
            <DragPreviewCard exercise={activeDragExercise} />
          )}
        </DragOverlay>
      </DndContext>
    </motion.div>
  );
}

