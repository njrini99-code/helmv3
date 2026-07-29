'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { IconStar, IconClock } from '@/components/icons';
import type { Coach } from '../../crm-config';
import type { CoachEngagement } from '../../types/foundations';
import { EngagementBadge } from '../badges/EngagementBadge';
import { Button } from '@/components/ui/button';

// ============================================================================
// PipelineCard — DnD-draggable coach card for the kanban.
// Mirrors the baseball pipeline-card.tsx pattern (useDraggable + transform
// translate). Engagement badge is sourced from the parent-supplied map.
// ============================================================================

interface PipelineCardProps {
  coach: Coach;
  engagement?: CoachEngagement;
  isOverlay?: boolean;
  onClick?: () => void;
}

function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function PipelineCard({ coach, engagement, isOverlay, onClick }: PipelineCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: coach.id,
    data: { coach },
    disabled: isOverlay,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
  };

  const lastContacted = formatRelative(coach.last_contacted_at);
  const isOverdue =
    coach.next_follow_up_at && new Date(coach.next_follow_up_at) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'transition-all duration-200',
        isDragging && !isOverlay && 'opacity-30',
        !isDragging && !isOverlay && 'cursor-grab active:cursor-grabbing',
        isOverlay && 'rotate-2 shadow-raise scale-105 cursor-grabbing',
      )}
    >
      <div
        className={cn(
          'relative rounded-fw-md border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] overflow-hidden',
          'hover:shadow-soft hover:-translate-y-0.5 transition-all duration-200',
          isOverlay && 'ring-2 ring-accent-500',
        )}
      >
        <Button variant="ghost"
          type="button"
          onClick={(e) => {
            // Skip click handling if the user just finished a drag.
            if (isDragging) {
              e.preventDefault();
              return;
            }
            onClick?.();
          }}
          className="w-full text-left p-3"
        >
          <div className="flex items-start gap-2 mb-1.5">
            {coach.is_starred && (
              <IconStar
                size={12}
                className="fill-fw-warning text-fw-warning flex-shrink-0 mt-0.5"
              />
            )}
            {/* Priority dot — mirrors the CoachTable priority-cell idiom (a
                small colored dot, not an accent stripe). Amber for High (1),
                orange for Hot (2+); no dot at Normal (0). */}
            {coach.priority > 0 && (
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5',
                  coach.priority >= 2 ? 'bg-fw-danger' : 'bg-fw-warning',
                )}
                aria-label={coach.priority >= 2 ? 'Hot priority' : 'High priority'}
                title={coach.priority >= 2 ? 'Hot priority' : 'High priority'}
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">
                {coach.name}
              </p>
              <p className="text-xs text-text-tertiary truncate">{coach.school}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 mt-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {coach.conference && (
                <span className="text-eyebrow font-medium text-text-tertiary truncate">
                  {coach.conference}
                </span>
              )}
              {coach.division && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 rounded text-eyebrow font-bold flex-shrink-0',
                    coach.division === 'D2'
                      ? 'bg-surface-sunken text-text-secondary'
                      : 'bg-accent-100 text-accent-700',
                  )}
                >
                  {coach.division}
                </span>
              )}
            </div>
            <EngagementBadge coachId={coach.id} engagement={engagement} size="sm" />
          </div>

          <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-border-subtle/60">
            <span className="text-eyebrow text-text-tertiary truncate">
              {lastContacted ? `Last contact ${lastContacted}` : 'No contact yet'}
            </span>
            {isOverdue && (
              <span className="inline-flex items-center gap-0.5 text-eyebrow text-fw-danger-ink font-medium flex-shrink-0">
                <IconClock size={9} /> Overdue
              </span>
            )}
          </div>
        </Button>
      </div>
    </div>
  );
}
