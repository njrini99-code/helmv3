'use client';

import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { Coach, CoachStatus } from '../../crm-config';
import type { CoachEngagement } from '../../types/foundations';
import { PipelineCard } from './PipelineCard';
import { Button } from '@/components/ui/button';

// ============================================================================
// PipelineColumn — droppable kanban column for one coach_status value.
// ============================================================================

// Columns like new_lead can carry ~2,000 coaches — mounting a useDraggable
// hook per card for all of them janks the board. Render only the first
// INITIAL_CARD_LIMIT (by the column's existing/incoming order) until the
// caller asks for more. The header count + drop-empty-state still read off
// the full `coaches` prop, so those never lie about the true column size.
const INITIAL_CARD_LIMIT = 60;

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

  // Capped render — see INITIAL_CARD_LIMIT above. `coaches` keeps its
  // existing (caller-supplied) order; the cap only trims how many of that
  // order get a mounted PipelineCard/useDraggable (each reveal grows the
  // window by another INITIAL_CARD_LIMIT), it never reorders them, so
  // drag-and-drop targets among the visible cards are unaffected.
  const [visibleCount, setVisibleCount] = useState(INITIAL_CARD_LIMIT);
  const visibleCoaches = coaches.slice(0, visibleCount);
  const remaining = coaches.length - visibleCoaches.length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex-shrink-0 w-[280px] rounded-card border border-border-subtle bg-surface-tint overflow-hidden',
        'flex flex-col transition-all duration-200 min-h-[400px]',
        isOver && 'ring-2 ring-accent-500 ring-offset-2 bg-accent-50/40',
      )}
    >
      {/* Column header */}
      <div
        className={cn(
          'px-3 py-2.5 flex items-center justify-between gap-2 border-b border-border-subtle/60',
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
            isOver && 'bg-accent-650 text-text-on-accent',
          )}
        >
          {coaches.length}
        </span>
      </div>

      {description && (
        <p className="px-3 pt-2 text-eyebrow text-text-tertiary">{description}</p>
      )}

      {/* Card list */}
      <div className="flex-1 px-2 py-2 space-y-2 overflow-y-auto">
        {visibleCoaches.map((coach) => (
          <PipelineCard
            key={coach.id}
            coach={coach}
            engagement={engagementMap[coach.id]}
            onClick={() => onCoachClick?.(coach)}
          />
        ))}

        {remaining > 0 && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => setVisibleCount((count) => count + INITIAL_CARD_LIMIT)}
            className="w-full py-2 text-center text-xs font-medium text-accent-700 hover:bg-accent-50/60 rounded-fw-md transition-colors"
          >
            Show 60 more ({remaining} remaining)
          </Button>
        )}

        {coaches.length === 0 && (
          <div
            className={cn(
              'text-center text-xs py-8 transition-colors',
              isOver ? 'text-accent-700 font-semibold' : 'text-text-tertiary',
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
