'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { PipelineColumn } from './pipeline-column';
import { PipelineCard } from './pipeline-card';
import { PIPELINE_STAGES } from '@/lib/recruiting/stages';
import type { PipelineStage } from '@/lib/types';
import type { Recruit } from '@/lib/types/player-cards';

// ============================================
// TYPES
// ============================================

interface RecruitingPipelineProps {
  recruits: Recruit[];
  onMoveRecruit: (recruitId: string, newStage: PipelineStage) => void;
  onViewRecruit: (recruit: Recruit) => void;
  onQuickAdd: (stage: PipelineStage) => void;
}

// ============================================
// COMPONENT
// ============================================

export function RecruitingPipeline({
  recruits,
  onMoveRecruit,
  onViewRecruit,
  onQuickAdd,
}: RecruitingPipelineProps) {
  const [activeRecruit, setActiveRecruit] = useState<Recruit | null>(null);

  // Group recruits by stage
  const recruitsByStage = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage.id] = recruits.filter((r) => r.pipeline_stage === stage.id);
    return acc;
  }, {} as Record<PipelineStage, Recruit[]>);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  // Handle drag start
  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const recruit = recruits.find((r) => r.id === event.active.id);
      setActiveRecruit(recruit || null);
    },
    [recruits]
  );

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveRecruit(null);

      if (!over) return;

      const recruitId = active.id as string;
      const overId = over.id as string;

      // Check if dropped on a column
      const targetStage = PIPELINE_STAGES.find((s) => s.id === overId);
      if (targetStage) {
        onMoveRecruit(recruitId, targetStage.id);
        return;
      }

      // Check if dropped on another recruit
      const targetRecruit = recruits.find((r) => r.id === overId);
      if (targetRecruit) {
        onMoveRecruit(recruitId, targetRecruit.pipeline_stage);
      }
    },
    [recruits, onMoveRecruit]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => (
          <PipelineColumn
            key={stage.id}
            stage={stage}
            recruits={recruitsByStage[stage.id] || []}
            onViewRecruit={onViewRecruit}
            onQuickAdd={() => onQuickAdd(stage.id)}
          />
        ))}
      </div>

      {/* Drag Overlay */}
      <DragOverlay>
        {activeRecruit && <PipelineCard recruit={activeRecruit} isDragging />}
      </DragOverlay>
    </DndContext>
  );
}
