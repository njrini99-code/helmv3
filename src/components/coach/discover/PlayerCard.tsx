'use client';

import { memo } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { StatusDot } from '@/components/ui/status-dot';
import { usePeekPanelStore } from '@/stores/peek-panel-store';
import {
  IconHeart,
  IconHeartFilled,
  IconMessage,
  IconMapPin,
  IconGraduationCap,
  IconCheck,
  IconVideo,
} from '@/components/icons';

export interface PlayerCardData {
  id: string;
  firstName: string;
  lastName: string;
  position: string;
  secondaryPosition?: string;
  graduationYear: number;
  highSchool: string;
  city: string;
  state: string;
  avatar?: string | null;
  coverImage?: string | null;
  stats?: {
    velocity?: number;
    exitVelo?: number;
    sixtyYard?: number;
    gpa?: number;
    height?: string;
    weight?: number;
  };
  verified?: boolean;
  status?: 'watchlist' | 'high_priority' | 'offer_extended' | 'committed' | 'uninterested';
  hasVideo?: boolean;
  videoThumbnail?: string | null;
  // Match score from recruiting philosophy (0-100)
  matchScore?: number;
}

interface PlayerCardProps {
  player: PlayerCardData;
  variant?: 'default' | 'compact' | 'featured';
  onWatchlist?: () => void;
  onMessage?: () => void;
  onPlayerClick?: () => void;
  isOnWatchlist?: boolean;
  isSelected?: boolean;
  onSelect?: () => void;
  showCheckbox?: boolean;
  isFeatured?: boolean;
  className?: string;
  usePeekPanel?: boolean;
}

const PlayerCardComponent = function PlayerCard({
  player,
  variant = 'default',
  onWatchlist,
  onMessage,
  onPlayerClick,
  isOnWatchlist = false,
  isSelected = false,
  onSelect,
  showCheckbox = false,
  isFeatured = false,
  className,
  usePeekPanel = true,
}: PlayerCardProps) {
  const { openPlayerPanel } = usePeekPanelStore();

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();

    // Use onPlayerClick if provided, otherwise fall back to Zustand store
    if (onPlayerClick) {
      onPlayerClick();
    } else if (usePeekPanel) {
      openPlayerPanel(player.id);
    }
  };

  if (variant === 'compact') {
    return (
      <div
        onClick={handleClick}
        className={cn(
          "flex items-center gap-3 p-3 rounded-[16px] cursor-pointer relative",
          "bg-cream-100/75 backdrop-blur-md border border-warm-200/55",
          "transition-[transform,box-shadow,border-color] duration-200",
          "hover:-tranwarm-y-0.5 hover:shadow-md hover:border-warm-200/55",
          isSelected && "ring-2 ring-primary-500 ring-offset-2 border-primary-200",
          className
        )}
      >
        {/* Checkbox for compare mode */}
        {showCheckbox && (
          <button
            type="button"
            aria-label="Select player for comparison"
            onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
            className={cn(
              'w-5 h-5 rounded-md border-2 flex items-center justify-center transition-[color,background-color,border-color,transform] duration-200 flex-shrink-0',
              isSelected
                ? 'bg-primary-600 border-primary-600 text-white scale-110'
                : 'border-warm-300 hover:border-primary-500 bg-white'
            )}
          >
            {isSelected && <IconCheck size={12} />}
          </button>
        )}
        
        <PlayerAvatar player={player} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-warm-900 truncate">
            {player.firstName} {player.lastName}
          </div>
          <div className="text-sm leading-relaxed text-warm-500">
            {player.position} • {player.graduationYear}
          </div>
        </div>
        {player.hasVideo && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-warm-100 text-warm-600 text-xs">
            <IconVideo size={10} />
          </div>
        )}
        {player.status && (
          <StatusDot variant={getStatusVariant(player.status)} />
        )}
      </div>
    );
  }

  if (variant === 'featured') {
    return (
      <div className={cn(
        "relative overflow-hidden rounded-[20px]",
        "bg-cream-100/75 backdrop-blur-md border border-warm-200/55",
        "transition-[transform,box-shadow,border-color] duration-200",
        "hover:-tranwarm-y-1 hover:shadow-xl hover:border-warm-200/55",
        isSelected && "ring-2 ring-primary-500 ring-offset-2 border-primary-200",
        isFeatured && "ring-2 ring-amber-400/50 ring-offset-2 ring-offset-white shadow-amber-100",
        className
      )}>
        {/* Checkbox for compare mode */}
        {showCheckbox && (
          <div className="absolute top-3 left-3 z-10">
            <button
              type="button"
              aria-label="Select player for comparison"
              onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
              className={cn(
                'w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-[color,background-color,border-color,transform] duration-200',
                isSelected
                  ? 'bg-primary-600 border-primary-600 text-white scale-110'
                  : 'border-warm-300 hover:border-primary-500 bg-cream-50/92 backdrop-blur-sm'
              )}
            >
              {isSelected && <IconCheck size={14} />}
            </button>
          </div>
        )}

        {/* Video indicator badge */}
        {player.hasVideo && (
          <div className="absolute top-3 right-12 z-10 flex items-center gap-1 
                          px-2 py-1 rounded-full bg-black/70 backdrop-blur-sm text-white text-xs">
            <IconVideo size={12} />
            <span>Video</span>
          </div>
        )}

        {/* Cover Image */}
        <div className="h-32 bg-gradient-to-br from-warm-200 to-warm-300 relative">
          {player.coverImage && (
            <Image
              src={player.coverImage}
              alt={`${player.firstName} ${player.lastName} cover`}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 420px"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

          {/* Actions overlay */}
          <div className="absolute top-3 right-3 flex gap-2">
            <ActionButton
              icon={isOnWatchlist ? IconHeartFilled : IconHeart}
              onClick={onWatchlist}
              label={isOnWatchlist ? 'Remove from watchlist' : 'Save to watchlist'}
              active={isOnWatchlist}
              activeClass="text-emerald-600"
            />
            <ActionButton icon={IconMessage} onClick={onMessage} label="Message player" />
          </div>
        </div>

        {/* Content */}
        <div className="p-5 pt-0">
          {/* Avatar - overlapping cover */}
          <div className="-mt-10 mb-3 relative z-10">
            <PlayerAvatar player={player} size="lg" border />
          </div>

          <div onClick={handleClick} className="group cursor-pointer">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-lg text-warm-900 group-hover:text-emerald-600 transition-colors">
                {player.firstName} {player.lastName}
              </h3>
              {player.verified && <VerifiedBadge />}
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm text-warm-500 mb-4">
            <span className="font-medium text-warm-700">{player.position}</span>
            {player.secondaryPosition && (
              <>
                <span>•</span>
                <span>{player.secondaryPosition}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm text-warm-500 mb-4">
            <div className="flex items-center gap-1.5">
              <IconGraduationCap size={16} className="text-warm-400" />
              <span>Class of {player.graduationYear}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <IconMapPin size={16} className="text-warm-400" />
              <span>{player.state}</span>
            </div>
          </div>

          {/* Stats Row */}
          {player.stats && (
            <div className="flex items-center gap-4 pt-4 border-t border-warm-100">
              {player.stats.velocity && (
                <StatBadge label="Velo" value={`${player.stats.velocity}`} unit="mph" />
              )}
              {player.stats.gpa && (
                <StatBadge label="GPA" value={player.stats.gpa.toFixed(1)} />
              )}
              {player.stats.height && (
                <StatBadge label="Height" value={player.stats.height} />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Default variant
  return (
    <div className={cn(
      "relative overflow-hidden rounded-[20px]",
      "bg-cream-100/75 backdrop-blur-md border border-warm-200/55",
      "transition-[transform,box-shadow,border-color] duration-200",
      "hover:-tranwarm-y-1 hover:shadow-lg hover:border-warm-200/55",
      "group",
      isSelected && "ring-2 ring-primary-500 ring-offset-2 border-primary-200",
      isFeatured && "ring-2 ring-amber-400/50 ring-offset-2 ring-offset-white shadow-amber-100",
      className
    )}>
      {/* Checkbox for compare mode */}
      {showCheckbox && (
        <div className="absolute top-3 left-3 z-10">
          <button
            type="button"
            aria-label="Select player for comparison"
            onClick={(e) => { e.stopPropagation(); onSelect?.(); }}
            className={cn(
              'w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-[color,background-color,border-color,transform] duration-200',
              isSelected
                ? 'bg-primary-600 border-primary-600 text-white scale-110'
                : 'border-warm-300 hover:border-primary-500 bg-cream-50/92 backdrop-blur-sm'
            )}
          >
            {isSelected && <IconCheck size={14} />}
          </button>
        </div>
      )}

      {/* Video indicator badge */}
      {player.hasVideo && (
        <div className="absolute top-3 right-14 z-10 flex items-center gap-1 
                        px-2 py-1 rounded-full bg-black/70 backdrop-blur-sm text-white text-xs
                        opacity-0 group-hover:opacity-100 transition-opacity">
          <IconVideo size={12} />
          <span>Video</span>
        </div>
      )}

      {/* Featured indicator glow */}
      {isFeatured && (
        <div className="absolute inset-0 rounded-2xl pointer-events-none
                        bg-gradient-to-br from-amber-50 to-transparent opacity-50" />
      )}

      <div className="p-5 relative">
        <div className="flex items-start gap-4">
          <PlayerAvatar player={player} size="md" />

          <div className="flex-1 min-w-0">
            <div onClick={handleClick} className="cursor-pointer">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-warm-900 group-hover:text-emerald-600 transition-colors truncate">
                  {player.firstName} {player.lastName}
                </h3>
                {player.verified && <VerifiedBadge />}
                {isFeatured && (
                  <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                    Hot
                  </span>
                )}
              </div>
            </div>

            <div className="text-sm leading-relaxed text-warm-500 mb-2">
              {player.position} • Class of {player.graduationYear}
            </div>

            <div className="flex items-center gap-1.5 text-sm text-warm-400">
              <IconMapPin size={14} className="flex-shrink-0" />
              <span className="truncate">{player.highSchool}, {player.state}</span>
            </div>
          </div>

          {/* Status */}
          {player.status && (
            <StatusDot variant={getStatusVariant(player.status)} />
          )}
        </div>

        {/* Stats */}
        {player.stats && (
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-warm-100">
            {player.stats.velocity && (
              <StatBadge label="Velo" value={`${player.stats.velocity}`} unit="mph" compact />
            )}
            {player.stats.gpa && (
              <StatBadge label="GPA" value={player.stats.gpa.toFixed(1)} compact />
            )}
            {player.stats.height && (
              <StatBadge label="Ht" value={player.stats.height} compact />
            )}
            {player.hasVideo && (
              <div className="ml-auto flex items-center gap-1 text-xs text-warm-500">
                <IconVideo size={12} />
                <span>Video</span>
              </div>
            )}
          </div>
        )}

        {/* Hover Actions */}
        <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionButton
            icon={isOnWatchlist ? IconHeartFilled : IconHeart}
            onClick={onWatchlist}
            label={isOnWatchlist ? 'Remove from watchlist' : 'Save to watchlist'}
            active={isOnWatchlist}
            activeClass="text-emerald-600"
            size="sm"
          />
          <ActionButton icon={IconMessage} onClick={onMessage} label="Message player" size="sm" />
        </div>
      </div>
    </div>
  );
};

// Memoize the main component to prevent unnecessary re-renders
export const PlayerCard = memo(PlayerCardComponent);
PlayerCard.displayName = 'PlayerCard';

// ===== Sub-components =====

const PlayerAvatar = memo(function PlayerAvatar({
  player,
  size = 'md',
  border = false
}: {
  player: { firstName: string; lastName: string; avatar?: string | null };
  size?: 'sm' | 'md' | 'lg';
  border?: boolean;
}) {
  const sizeClasses = {
    sm: 'w-10 h-10 text-sm',
    md: 'w-12 h-12 text-base',
    lg: 'w-20 h-20 text-xl',
  };

  return (
    <div className={cn(
      "rounded-full bg-gradient-to-br from-warm-200 to-warm-300 flex items-center justify-center flex-shrink-0 overflow-hidden",
      sizeClasses[size],
      border && "ring-4 ring-white shadow-md"
    )}>
      {player.avatar ? (
        <Image
          src={player.avatar}
          alt={`${player.firstName} ${player.lastName}`}
          width={size === 'lg' ? 80 : size === 'md' ? 48 : 40}
          height={size === 'lg' ? 80 : size === 'md' ? 48 : 40}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="font-medium text-warm-600">
          {player.firstName.charAt(0)}{player.lastName.charAt(0)}
        </span>
      )}
    </div>
  );
});

const VerifiedBadge = memo(function VerifiedBadge() {
  return (
    <div className="w-4 h-4 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0" title="Verified Profile">
      <IconCheck size={10} className="text-white" />
    </div>
  );
});

const StatBadge = memo(function StatBadge({
  label,
  value,
  unit,
  compact = false
}: {
  label: string;
  value: string;
  unit?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="text-sm">
        <span className="text-warm-400">{label}</span>{' '}
        <span className="font-medium text-warm-700">{value}</span>
        {unit && <span className="text-warm-400 text-xs ml-0.5">{unit}</span>}
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="text-lg font-semibold text-warm-900">
        {value}
        {unit && <span className="text-sm font-normal leading-relaxed text-warm-400 ml-0.5">{unit}</span>}
      </div>
      <div className="text-xs text-warm-500">{label}</div>
    </div>
  );
});

const ActionButton = memo(function ActionButton({
  icon: Icon,
  onClick,
  label,
  active = false,
  activeClass = '',
  size = 'md'
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick?: () => void;
  label: string;
  active?: boolean;
  activeClass?: string;
  size?: 'sm' | 'md';
}) {
  const sizeClasses = {
    sm: 'p-1.5',
    md: 'p-2',
  };

  return (
    <button
      type="button"
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "rounded-lg bg-cream-50/92 backdrop-blur-sm text-warm-600",
        "hover:bg-white active:bg-cream-100/75 hover:text-warm-900",
        "transition-[color,background-color,transform] duration-200",
        "active:scale-95",
        sizeClasses[size],
        active && activeClass
      )}
    >
      <Icon size={16} />
    </button>
  );
});

function getStatusVariant(status: string): 'info' | 'warning' | 'success' {
  const variants: Record<string, 'info' | 'warning' | 'success'> = {
    watchlist: 'info',
    high_priority: 'warning',
    offer_extended: 'info',
    committed: 'success',
    uninterested: 'info',
  };
  return variants[status] || 'info';
}

// Export sub-components for reuse
