'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { PlusIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PipelineCard } from './pipeline-card';
import type { PIPELINE_STAGES } from '@/lib/recruiting/stages';
import type { Recruit } from '@/lib/types/player-cards';

// ============================================
// TYPES
// ============================================

interface PipelineColumnProps {
  stage: (typeof PIPELINE_STAGES)[number];
  recruits: Recruit[];
  onViewRecruit: (recruit: Recruit) => void;
  onQuickAdd: () => void;
}

// ============================================
// CONFIG
// ============================================

const headerColors: Record<string, string> = {
  warm: 'bg-warm-100 text-warm-700',
  blue: 'bg-blue-100 text-blue-700',
  amber: 'bg-amber-100 text-amber-700',
  purple: 'bg-purple-100 text-purple-700',
  primary: 'bg-primary-100 text-primary-700',
};

// ============================================
// COMPONENT
// ============================================

export function PipelineColumn({
  stage,
  recruits,
  onViewRecruit,
  onQuickAdd,
}: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-[280px]',
        'flex flex-col',
        'bg-warm-50 rounded-[16px]',
        'border-2 border-dashed',
        isOver
          ? 'border-primary-400 bg-primary-50/50'
          : 'border-transparent'
      )}
    >
      {/* Column Header */}
      <div className="p-3 border-b border-warm-200">
        <div className="flex items-center justify-between">
          <div
            className={cn(
              'px-3 py-1 rounded-full text-sm font-semibold',
              headerColors[stage.color]
            )}
          >
            {stage.label}
          </div>
          <span className="text-sm text-warm-500 font-medium">
            {recruits.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 min-h-[200px] overflow-y-auto">
        <SortableContext
          items={recruits.map((r) => r.id)}
          strategy={verticalListSortingStrategy}
        >
          {recruits.map((recruit) => (
            <PipelineCard
              key={recruit.id}
              recruit={recruit}
              onClick={() => onViewRecruit(recruit)}
            />
          ))}
        </SortableContext>

        {/* Empty State */}
        {recruits.length === 0 && (
          <div
            className="
            flex items-center justify-center
            h-24
            text-sm text-warm-400
            border-2 border-dashed border-warm-200
            rounded-[12px]
          "
          >
            Drop recruits here
          </div>
        )}
      </div>

      {/* Quick Add Button */}
      {stage.id !== 'committed' && stage.id !== 'uninterested' && (
        <button
          onClick={onQuickAdd}
          className="
            flex items-center justify-center gap-1.5
            mx-2 mb-2 py-2
            text-sm text-warm-500
            border border-warm-200 rounded-[10px]
            hover:bg-white hover:border-warm-300
            transition-all duration-200
          "
        >
          <PlusIcon className="w-4 h-4" />
          Quick Add
        </button>
      )}
    </div>
  );
}
