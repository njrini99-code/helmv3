'use client';

// =============================================================================
// src/components/baseball/performance/lift-canvas/SessionBlock.tsx
//
// A droppable, sortable block of exercises — one of the 7 LiftBlockType slots
// in the center canvas. Exercises inside are sortable via @dnd-kit/sortable
// (PointerSensor + KeyboardSensor live in the parent DndContext).
//
// Affordances per exercise row:
//   • Drag handle → reorder or move to another block
//   • PrescriptionChip → opens editor popover (3×5@75%)
//   • Duplicate  → copies the row immediately below
//   • Remove     → removes from this block
//
// Conflict badge: exercise rows show a colored left-border when the parent
// passes an ExerciseConflict entry for that draft. The detail pane (in
// LiftCanvas) handles the full warning card.
// =============================================================================

import { m, useReducedMotion } from 'framer-motion';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { IconArrowUpDown, IconCopy, IconX } from '@/components/icons';
import { PrescriptionChip } from './PrescriptionChip';
import { hoverLift } from '@/lib/baseball/motion';
import type {
  LiftSessionDraftBlock,
  LiftDraftExercise,
  BuilderExercise,
  ExerciseConflict,
  LiftBlockType,
} from '@/lib/baseball/exercise-conflict';

// ─── Block-type styling ───────────────────────────────────────────────────────

const BLOCK_META: Record<LiftBlockType, { label: string; cls: string }> = {
  warmup:       { label: 'Warmup',       cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  power:        { label: 'Power',        cls: 'border-red-200 bg-red-50 text-red-700' },
  main:         { label: 'Main Strength',cls: 'border-primary-200 bg-primary-50 text-primary-700' },
  accessory:    { label: 'Accessory',    cls: 'border-warm-200 bg-warm-50 text-warm-700' },
  arm_care:     { label: 'Arm Care',     cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  conditioning: { label: 'Conditioning', cls: 'border-orange-200 bg-orange-50 text-orange-700' },
  recovery:     { label: 'Recovery',     cls: 'border-green-200 bg-green-50 text-green-700' },
};

// ─── Sortable exercise row ────────────────────────────────────────────────────

interface SortableRowProps {
  draft: LiftDraftExercise;
  exercise: BuilderExercise | undefined;
  conflict: ExerciseConflict | undefined;
  blockId: string;
  isSelected: boolean;
  onSelect: () => void;
  onPrescriptionChange: (p: LiftDraftExercise['prescription']) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

function SortableRow({
  draft,
  exercise,
  conflict,
  blockId,
  isSelected,
  onSelect,
  onPrescriptionChange,
  onDuplicate,
  onRemove,
}: SortableRowProps) {
  const reduce = useReducedMotion();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: draft.id,
    data: { type: 'block-exercise' as const, blockId, draftId: draft.id, exercise },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Conflict level → left-border accent
  const conflictBorder =
    conflict?.level === 'high'
      ? 'border-l-2 border-l-red-400'
      : conflict?.level === 'caution'
      ? 'border-l-2 border-l-amber-400'
      : '';

  return (
    <m.div
      ref={setNodeRef}
      style={style}
      whileHover={hoverLift(reduce, { scale: 1, y: -1 })}
      className={[
        'flex items-center gap-2 rounded-xl border px-3 py-2 transition-all',
        isDragging ? 'opacity-40 shadow-xl ring-2 ring-primary-400/40' : 'bg-cream-50',
        isSelected
          ? 'border-primary-300 bg-primary-50/60'
          : 'border-warm-100 hover:border-warm-200',
        conflictBorder,
      ].join(' ')}
    >
      {/* ── Drag handle ────────────────────────────────────────────── */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="flex-shrink-0 cursor-grab touch-none rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-warm-300 hover:text-warm-500 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        aria-label="Drag to reorder exercise"
        {...listeners}
        {...attributes}
      >
        <IconArrowUpDown size={14} />
      </Button>

      {/* ── Name (click to select → shows detail pane) ─────────────── */}
      <Button
        variant="ghost"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 rounded"
        aria-pressed={isSelected}
        aria-label={`Select ${exercise?.name ?? 'exercise'} to view details`}
      >
        <p className="truncate text-sm font-medium text-warm-900">
          {exercise?.name ?? <span className="text-warm-400 italic">Unknown exercise</span>}
        </p>
      </Button>

      {/* ── Prescription chip ─────────────────────────────────────── */}
      <PrescriptionChip
        prescription={draft.prescription}
        onChange={onPrescriptionChange}
      />

      {/* ── Quick actions ─────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDuplicate}
          className="rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-warm-300 transition-colors hover:text-warm-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          aria-label={`Duplicate ${exercise?.name ?? 'exercise'}`}
        >
          <IconCopy size={13} />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          className="rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-warm-300 transition-colors hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
          aria-label={`Remove ${exercise?.name ?? 'exercise'} from block`}
        >
          <IconX size={13} />
        </Button>
      </div>
    </m.div>
  );
}

// ─── SessionBlock ─────────────────────────────────────────────────────────────

export interface SessionBlockProps {
  block: LiftSessionDraftBlock;
  /** Lookup map: exerciseId → BuilderExercise (from library prop). */
  exerciseMap: ReadonlyMap<string, BuilderExercise>;
  /** Conflict scores keyed by draft exercise id. */
  conflictMap: ReadonlyMap<string, ExerciseConflict>;
  selectedDraftId: string | null;
  onSelectExercise: (draftId: string) => void;
  onUpdateBlock: (updated: LiftSessionDraftBlock) => void;
  /** Called when the user duplicates an exercise row; parent re-scores conflict. */
  onDuplicateExercise: (blockId: string, draftId: string) => void;
}

export function SessionBlock({
  block,
  exerciseMap,
  conflictMap,
  selectedDraftId,
  onSelectExercise,
  onUpdateBlock,
  onDuplicateExercise,
}: SessionBlockProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `block-${block.id}`,
    data: { type: 'block-drop' as const, blockId: block.id },
  });

  const meta = BLOCK_META[block.type];
  const sortableIds = block.exercises.map((e) => e.id);

  // ── Local mutation helpers ──────────────────────────────────────────────────

  function updateExercise(draftId: string, partial: Partial<LiftDraftExercise>) {
    onUpdateBlock({
      ...block,
      exercises: block.exercises.map((e) =>
        e.id === draftId ? { ...e, ...partial } : e,
      ),
    });
  }

  function removeExercise(draftId: string) {
    onUpdateBlock({
      ...block,
      exercises: block.exercises.filter((e) => e.id !== draftId),
    });
  }

  return (
    <Card
      className={[
        'overflow-hidden p-0 transition-all',
        isOver ? 'ring-2 ring-primary-400/50 ring-offset-1' : '',
      ].join(' ')}
    >
      {/* ── Block header ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-warm-100 px-3 py-2.5">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-eyebrow font-semibold ${meta.cls}`}
        >
          {meta.label}
        </span>
        <span className="flex-1 text-sm font-semibold text-warm-900">{block.title}</span>
        {block.exercises.length > 0 && (
          <span className="text-xs tabular-nums text-warm-400">
            {block.exercises.length}
          </span>
        )}
      </div>

      {/* ── Exercise drop zone ────────────────────────────────────────── */}
      <div
        ref={setNodeRef}
        className={[
          'min-h-[56px] space-y-1.5 p-3 transition-colors',
          isOver ? 'bg-primary-50/40' : 'bg-transparent',
        ].join(' ')}
        aria-label={`${block.title} block — ${block.exercises.length} exercises`}
      >
        {block.exercises.length === 0 ? (
          <p
            className={[
              'text-center text-xs py-3 select-none',
              isOver ? 'text-primary-500 font-medium' : 'text-warm-300',
            ].join(' ')}
            aria-hidden
          >
            {isOver ? 'Drop here' : 'Drag exercises here'}
          </p>
        ) : (
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            {block.exercises.map((draft) => (
              <SortableRow
                key={draft.id}
                draft={draft}
                exercise={exerciseMap.get(draft.exerciseId)}
                conflict={conflictMap.get(draft.id)}
                blockId={block.id}
                isSelected={selectedDraftId === draft.id}
                onSelect={() => onSelectExercise(draft.id)}
                onPrescriptionChange={(prescription) =>
                  updateExercise(draft.id, { prescription })
                }
                onDuplicate={() => onDuplicateExercise(block.id, draft.id)}
                onRemove={() => removeExercise(draft.id)}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </Card>
  );
}
