'use client';

import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { StatusDot } from '@/components/ui/status-dot';
import { Button } from '@/components/ui/button';
import { IconNote, IconMessage, IconDumbbell } from '@/components/icons';

// ============ TYPES ============

export type PlayerTileVariant = 'list' | 'grid' | 'compact';

export interface PlayerTileProps {
  playerId: string;
  name: string;
  position?: string;
  avatarUrl?: string | null;
  /** Maps directly to StatusDot variant. */
  statusDotTone?: 'success' | 'warning' | 'error' | 'neutral';
  /** 0–10; rendered only when canViewReadiness=true. */
  sorenessLevel?: number | null;
  groupLabel?: string | null;
  canViewReadiness?: boolean;
  onQuickAction?: (action: 'note' | 'message' | 'modify_lift') => void;
  variant?: PlayerTileVariant;
  className?: string;
}

// ============ SORENESS PILL ============

function SorenessPill({ level }: { level: number }) {
  const isElevated = level >= 5;
  return (
    <span
      aria-label={`Soreness level ${level}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums flex-shrink-0',
        // Ink system (Living Annual doctrine — no raw amber): elevated soreness
        // reads pursuit clay soft, same lane as ProfileTimeline/shared.tsx warning.
        isElevated
          ? 'bg-pursuit/10 text-pursuit'
          : 'bg-warm-100 text-warm-600'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'w-1.5 h-1.5 rounded-full flex-shrink-0',
          isElevated ? 'bg-pursuit' : 'bg-warm-400'
        )}
      />
      {level}
    </span>
  );
}

// ============ GROUP LABEL BADGE ============

function GroupBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 flex-shrink-0">
      {label}
    </span>
  );
}

// ============ QUICK ACTION MENU ============

interface QuickActionMenuProps {
  onQuickAction: (action: 'note' | 'message' | 'modify_lift') => void;
}

function QuickActionMenu({ onQuickAction }: QuickActionMenuProps) {
  return (
    <div className="flex items-center gap-0.5 flex-shrink-0" role="group" aria-label="Quick actions">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onQuickAction('note')}
        aria-label="Add note"
        className={cn(
          'rounded-lg text-warm-400',
          'min-h-[44px] min-w-[44px]',
          'hover:bg-warm-100 hover:text-warm-700',
          'active:bg-warm-200 active:duration-75',
          'transition-colors duration-150'
        )}
      >
        <IconNote size={16} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onQuickAction('message')}
        aria-label="Send message"
        className={cn(
          'rounded-lg text-warm-400',
          'min-h-[44px] min-w-[44px]',
          'hover:bg-warm-100 hover:text-warm-700',
          'active:bg-warm-200 active:duration-75',
          'transition-colors duration-150'
        )}
      >
        <IconMessage size={16} />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onQuickAction('modify_lift')}
        aria-label="Modify lift"
        className={cn(
          'rounded-lg text-warm-400',
          'min-h-[44px] min-w-[44px]',
          'hover:bg-warm-100 hover:text-warm-700',
          'active:bg-warm-200 active:duration-75',
          'transition-colors duration-150'
        )}
      >
        <IconDumbbell size={16} />
      </Button>
    </div>
  );
}

// ============ LIST VARIANT ============
// Horizontal flex row: h-12 items-center gap-3
// Avatar(sm) | name + position | StatusDot | soreness pill | group badge | quick-action menu

function PlayerTileList({
  name,
  position,
  avatarUrl,
  statusDotTone,
  sorenessLevel,
  groupLabel,
  canViewReadiness,
  onQuickAction,
  className,
}: Omit<PlayerTileProps, 'playerId' | 'variant'>) {
  const showSoreness = canViewReadiness === true && sorenessLevel != null;

  return (
    <div
      className={cn(
        'flex h-12 items-center gap-3 px-2 rounded-xl',
        'transition-colors duration-150',
        className
      )}
    >
      {/* Avatar */}
      <Avatar src={avatarUrl} name={name} size="sm" />

      {/* Name + position */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-warm-900 truncate leading-tight">
          {name}
        </p>
        {position && (
          <p className="text-xs text-warm-500 truncate leading-tight">
            {position}
          </p>
        )}
      </div>

      {/* Status dot */}
      {statusDotTone && (
        <StatusDot variant={statusDotTone} size="sm" />
      )}

      {/* Soreness pill */}
      {showSoreness && <SorenessPill level={sorenessLevel!} />}

      {/* Group label */}
      {groupLabel && <GroupBadge label={groupLabel} />}

      {/* Quick actions */}
      {onQuickAction && <QuickActionMenu onQuickAction={onQuickAction} />}
    </div>
  );
}

// ============ GRID VARIANT ============
// Vertical card: p-3 rounded-xl bg-cream-50 border border-warm-200/40
// Avatar(md) centered | name | position | StatusDot + soreness

function PlayerTileGrid({
  name,
  position,
  avatarUrl,
  statusDotTone,
  sorenessLevel,
  groupLabel,
  canViewReadiness,
  onQuickAction,
  className,
}: Omit<PlayerTileProps, 'playerId' | 'variant'>) {
  const showSoreness = canViewReadiness === true && sorenessLevel != null;

  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 p-3 rounded-xl',
        'bg-cream-50 border border-warm-200/40',
        'transition-colors duration-150',
        className
      )}
    >
      {/* Avatar */}
      <Avatar src={avatarUrl} name={name} size="md" />

      {/* Name */}
      <p className="text-sm font-medium text-warm-900 text-center truncate w-full leading-tight">
        {name}
      </p>

      {/* Position */}
      {position && (
        <p className="text-xs text-warm-500 text-center leading-tight -mt-1">
          {position}
        </p>
      )}

      {/* Status row: dot + soreness */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {statusDotTone && <StatusDot variant={statusDotTone} size="sm" />}
        {showSoreness && <SorenessPill level={sorenessLevel!} />}
      </div>

      {/* Group label */}
      {groupLabel && <GroupBadge label={groupLabel} />}

      {/* Quick actions */}
      {onQuickAction && (
        <div className="pt-1">
          <QuickActionMenu onQuickAction={onQuickAction} />
        </div>
      )}
    </div>
  );
}

// ============ COMPACT VARIANT ============
// Inline chip: flex h-8 items-center gap-1.5 rounded-full bg-warm-100 px-2 text-sm
// Avatar(xs) | name only

function PlayerTileCompact({
  name,
  avatarUrl,
  className,
}: Omit<PlayerTileProps, 'playerId' | 'variant'>) {
  return (
    <div
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full bg-warm-100 px-2',
        'text-sm font-medium text-warm-900',
        'flex-shrink-0',
        className
      )}
    >
      <Avatar src={avatarUrl} name={name} size="xs" />
      <span className="truncate max-w-[120px]">{name}</span>
    </div>
  );
}

// ============ PUBLIC EXPORT ============

/**
 * PlayerTile — compact player presence tile.
 *
 * Three variants:
 *   - list    Horizontal row (h-12). Used in live-room rows, roster lists.
 *   - grid    Vertical card (p-3). Used in group pickers, availability grids.
 *   - compact Inline chip (h-8 rounded-full). Used in inline mentions and tags.
 *
 * Soreness pill is visible only when canViewReadiness=true AND sorenessLevel != null.
 * Quick action buttons are absent when onQuickAction is not provided.
 * All interactive elements meet the 44px iOS HIG touch target minimum.
 */
export function PlayerTile({
  playerId: _playerId,
  variant = 'list',
  ...rest
}: PlayerTileProps) {
  if (variant === 'compact') {
    return <PlayerTileCompact {...rest} />;
  }
  if (variant === 'grid') {
    return <PlayerTileGrid {...rest} />;
  }
  // default: list
  return <PlayerTileList {...rest} />;
}
