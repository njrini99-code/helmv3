'use client';

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { Coach, CoachStatus } from '../../crm-config';
import type { CoachEngagement } from '../../types/foundations';
import { PipelineCard } from './PipelineCard';

// ============================================================================
// PipelineColumn — droppable kanban column for one coach_status value.
// ============================================================================

interface PipelineColumnProps {
  status: CoachStatus;
  label: string;
  description?: string;
  /** Tailwind color tokens for the header band (background + text). */
  headerBg: string;
  headerText: string;
  /** Tailwind classes applied to the count badge. */
  countBg: string;
  countText: string;
  /** Optional dot color used in the column header. */
  dotColor?: string;
  /** Whether dropping into this column triggers a win/loss reason prompt. */
  promptsReason?: boolean;
  coaches: Coach[];
  engagementMap: Record<string, CoachEngagement>;
  onCoachClick?: (coach: Coach) => void;
}

export function PipelineColumn({
  status,
  label,
  description,
  headerBg,
  headerText,
  countBg,
  countText,
  dotColor,
  promptsReason,
  coaches,
  engagementMap,
  onCoachClick,
}: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { status, promptsReason: !!promptsReason },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-[280px] rounded-2xl glass-subtle overflow-hidden',
        'flex flex-col transition-all duration-200 min-h-[400px]',
        isOver && 'ring-2 ring-primary-500 ring-offset-2 bg-primary-50/40',
      )}
    >
      {/* Column header */}
      <div
        className={cn(
          'px-3 py-2.5 flex items-center justify-between gap-2 border-b border-warm-100/60',
          headerBg,
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {dotColor && (
            <span
              aria-hidden="true"
              className={cn('w-2 h-2 rounded-full', dotColor)}
            />
          )}
          <h3 className={cn('text-sm font-semibold tracking-tight truncate', headerText)}>
            {label}
          </h3>
        </div>
        <span
          className={cn(
            'inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 rounded-full text-eyebrow font-bold tabular-nums',
            countBg,
            countText,
            isOver && 'bg-primary-600 text-white',
          )}
        >
          {coaches.length}
        </span>
      </div>

      {description && (
        <p className="px-3 pt-2 text-eyebrow text-warm-400">{description}</p>
      )}

      {/* Card list */}
      <div className="flex-1 px-2 py-2 space-y-2 overflow-y-auto">
        {coaches.map((coach) => (
          <PipelineCard
            key={coach.id}
            coach={coach}
            engagement={engagementMap[coach.id]}
            onClick={() => onCoachClick?.(coach)}
          />
        ))}

        {coaches.length === 0 && (
          <div
            className={cn(
              'text-center text-xs py-8 transition-colors',
              isOver ? 'text-primary-700 font-semibold' : 'text-warm-300',
            )}
          >
            {isOver
              ? 'Drop here'
              : promptsReason
                ? 'Drop to close'
                : 'Drop coaches here'}
          </div>
        )}
      </div>
    </div>
  );
}
