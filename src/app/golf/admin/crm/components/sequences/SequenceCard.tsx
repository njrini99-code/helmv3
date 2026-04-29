'use client';

import { cn } from '@/lib/utils';
import { IconChevronRight, IconTrash, IconPlay } from '@/components/icons';
import type { CrmSequence } from '@/app/golf/actions/crm-sequences';

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
        'bg-white/70 backdrop-blur-xl border border-white/20 rounded-xl',
        'transition-all duration-200 cursor-pointer',
        'hover:bg-white/80 hover:shadow-card-hover',
        isSelected && 'ring-2 ring-primary-500 border-primary-300',
      )}
    >
      {/* Active dot */}
      <div
        className={cn(
          'flex-shrink-0 w-2 h-2 rounded-full',
          sequence.is_active ? 'bg-primary-500' : 'bg-warm-300',
        )}
        aria-hidden
      />

      {/* Title + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-warm-900 truncate">
            {sequence.name}
          </h3>
          <span
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider',
              sequence.trigger_kind === 'manual'
                ? 'bg-warm-100 text-warm-600'
                : 'bg-blue-50 text-blue-700',
            )}
          >
            {sequence.trigger_kind.replace('_', ' ')}
          </span>
        </div>
        {sequence.description && (
          <p className="text-xs text-warm-500 truncate mt-0.5">
            {sequence.description}
          </p>
        )}
      </div>

      {/* Counts */}
      <div className="hidden sm:flex items-center gap-4 text-xs text-warm-500 flex-shrink-0">
        <div className="flex flex-col items-end">
          <span className="font-semibold text-warm-800 tabular-nums">
            {stepCount ?? 0}
          </span>
          <span className="text-[10px] uppercase tracking-wider">steps</span>
        </div>
        <div className="flex flex-col items-end">
          <span className="font-semibold text-warm-800 tabular-nums">
            {activeEnrollmentCount ?? 0}
          </span>
          <span className="text-[10px] uppercase tracking-wider">active</span>
        </div>
      </div>

      {/* Actions */}
      <div
        className="flex items-center gap-1 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {onToggleActive && (
          <button
            type="button"
            onClick={() => onToggleActive(!sequence.is_active)}
            title={sequence.is_active ? 'Pause sequence' : 'Activate sequence'}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              sequence.is_active
                ? 'text-primary-600 hover:bg-primary-50'
                : 'text-warm-400 hover:bg-warm-100',
            )}
          >
            <IconPlay size={14} />
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            title="Delete sequence"
            className="p-1.5 rounded-lg text-warm-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <IconTrash size={14} />
          </button>
        )}
        <IconChevronRight size={14} className="text-warm-300" />
      </div>
    </div>
  );
}
