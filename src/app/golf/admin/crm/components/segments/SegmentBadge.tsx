'use client';

import { cn } from '@/lib/utils';
import { IconBookmark } from '@/components/icons';
import type { CrmSegment } from '@/app/golf/admin/crm/types/foundations';
import { Button } from '@/components/ui/button';

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
      <Button variant="primary"
        type="button"
        onClick={onClick}
        title={segment.description ?? segment.name}
        className={cn(
          'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-fw-sm text-eyebrow font-medium',
          'bg-accent-50 text-accent-700 border border-accent-200/60',
          'hover:bg-accent-100 transition-colors',
          'max-w-[120px] truncate',
          className,
        )}
      >
        <IconBookmark size={9} />
        <span className="truncate">{segment.name}</span>
      </Button>
    );
  }

  return (
    <Button variant="ghost"
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={segment.description ?? segment.name}
      className={cn(
        'group w-full flex items-center justify-between gap-2 px-3 py-2 rounded-fw-sm',
        'text-sm font-medium transition-all duration-200',
        isActive
          ? 'bg-nav-surface text-nav-text'
          : 'text-nav-text-dim hover:bg-nav-surface hover:text-nav-text',
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
              ? 'bg-accent-500/25 text-nav-accent'
              : 'bg-nav-surface text-nav-text-dim',
          )}
        >
          {count}
        </span>
      )}
    </Button>
  );
}
