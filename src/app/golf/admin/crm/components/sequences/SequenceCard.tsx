'use client';

import { cn } from '@/lib/utils';
import { IconChevronRight, IconTrash, IconPlay } from '@/components/icons';
import type { CrmSequence } from '@/app/golf/actions/crm-sequences';
import { IconButton } from '@/components/ui/button';

interface SequenceCardProps {
  sequence: CrmSequence;
  stepCount?: number;
  activeEnrollmentCount?: number;
  isSelected?: boolean;
  onClick?: () => void;
  onToggleActive?: (next: boolean) => void;
  onDelete?: () => void;
}

// ============================================================================
// SequenceCard — single row in the SequencesList. Click selects the sequence
// (parent shows the SequenceBuilder below the list). Inline toggle for the
// is_active flag and a delete affordance. Style mirrors other admin/crm
// glassmorphism rows (CoachTable / SegmentBadge).
// ============================================================================
export function SequenceCard({
  sequence,
  stepCount,
  activeEnrollmentCount,
  isSelected = false,
  onClick,
  onToggleActive,
  onDelete,
}: SequenceCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        'group relative w-full text-left flex items-center gap-3 px-4 py-3',
        'rounded-fw-md border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)]',
        'transition-all duration-200 cursor-pointer',
        'hover:bg-surface-tint hover:shadow-raise',
        isSelected && 'ring-2 ring-accent-500 border-accent-300',
      )}
    >
      {/* Active dot */}
      <div
        className={cn(
          'flex-shrink-0 w-2 h-2 rounded-full',
          sequence.is_active ? 'bg-accent-500' : 'bg-border-strong',
        )}
        aria-hidden
      />

      {/* Title + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary truncate">
            {sequence.name}
          </h3>
          <span
            className={cn(
              'px-1.5 py-0.5 rounded text-eyebrow font-bold uppercase tracking-wider',
              sequence.trigger_kind === 'manual'
                ? 'bg-surface-sunken text-text-secondary'
                : 'bg-surface-sunken text-text-secondary',
            )}
          >
            {sequence.trigger_kind.replace('_', ' ')}
          </span>
        </div>
        {sequence.description && (
          <p className="text-xs text-text-tertiary truncate mt-0.5">
            {sequence.description}
          </p>
        )}
      </div>

      {/* Counts */}
      <div className="hidden sm:flex items-center gap-4 text-xs text-text-tertiary flex-shrink-0">
        <div className="flex flex-col items-end">
          <span className="font-semibold text-text-primary tabular-nums">
            {stepCount ?? 0}
          </span>
          <span className="text-eyebrow uppercase tracking-wider">steps</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-semibold text-text-primary tabular-nums">
            {activeEnrollmentCount ?? 0}
          </span>
          <span className="text-eyebrow uppercase tracking-wider">active</span>
        </div>
      </div>

      {/* Actions */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation-only wrapper prevents card click when interacting with action buttons */}
      <div
        className="flex items-center gap-1 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {onToggleActive && (
          <IconButton variant="primary"
            aria-label={sequence.is_active ? 'Pause sequence' : 'Activate sequence'}
            type="button"
            onClick={() => onToggleActive(!sequence.is_active)}
            title={sequence.is_active ? 'Pause sequence' : 'Activate sequence'}
            className={cn(
              'p-1.5 rounded-fw-sm transition-colors',
              sequence.is_active
                ? 'text-accent-700 hover:bg-accent-50'
                : 'text-text-tertiary hover:bg-surface-sunken',
            )}
          >
            <IconPlay size={14} />
          </IconButton>
        )}
        {onDelete && (
          <IconButton variant="default" aria-label="Delete"
            type="button"
            onClick={onDelete}
            title="Delete sequence"
            className="p-1.5 rounded-fw-sm text-text-tertiary hover:text-fw-danger-ink hover:bg-fw-danger-bg/50 transition-colors"
          >
            <IconTrash size={14} />
          </IconButton>
        )}
        <IconChevronRight size={14} className="text-text-tertiary" />
      </div>
    </div>
  );
}
