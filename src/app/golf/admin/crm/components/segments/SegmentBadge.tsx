'use client';

import { cn } from '@/lib/utils';
import { IconBookmark } from '@/components/icons';
import type { CrmSegment } from '@/app/golf/admin/crm/types/foundations';

interface SegmentBadgeProps {
  segment: CrmSegment;
  /** Optional: pre-computed count of coaches matching this segment. */
  count?: number;
  /** Render variant — "pill" for the rail, "chip" for table cells. */
  variant?: 'pill' | 'chip';
  isActive?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  className?: string;
}

export function SegmentBadge({
  segment,
  count,
  variant = 'pill',
  isActive = false,
  onClick,
  onContextMenu,
  className,
}: SegmentBadgeProps) {
  if (variant === 'chip') {
    return (
      <button
        type="button"
        onClick={onClick}
        title={segment.description ?? segment.name}
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium',
          'bg-primary-50 text-primary-700 border border-primary-200/60',
          'hover:bg-primary-100 transition-colors',
          'max-w-[120px] truncate',
          className,
        )}
      >
        <IconBookmark size={9} />
        <span className="truncate">{segment.name}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={segment.description ?? segment.name}
      className={cn(
        'group w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md',
        'text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-white/15 text-white'
          : 'text-warm-400 hover:bg-white/5 hover:text-white',
        className,
      )}
    >
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <IconBookmark size={14} className="flex-shrink-0" />
        <span className="truncate text-left">{segment.name}</span>
      </span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'px-2 py-0.5 rounded-full text-xs font-medium tabular-nums flex-shrink-0',
            isActive
              ? 'bg-primary-500/20 text-primary-200'
              : 'bg-white/5 text-warm-500',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
