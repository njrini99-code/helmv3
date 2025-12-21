'use client';

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
    gpa?: number;
    height?: string;
    weight?: number;
  };
  verified?: boolean;
  status?: 'watchlist' | 'high_priority' | 'offer_extended' | 'committed' | 'uninterested';
}

interface PlayerCardProps {
  player: PlayerCardData;
  variant?: 'default' | 'compact' | 'featured';
  onWatchlist?: () => void;
  onMessage?: () => void;
  isOnWatchlist?: boolean;
  className?: string;
  usePeekPanel?: boolean;
}

export function PlayerCard({
  player,
  variant = 'default',
  onWatchlist,
  onMessage,
  isOnWatchlist = false,
  className,
  usePeekPanel = true,
}: PlayerCardProps) {
  const { openPlayerPanel } = usePeekPanelStore();

  const handleClick = (e: React.MouseEvent) => {
    if (usePeekPanel) {
      e.preventDefault();
      openPlayerPanel(player.id);
    }
  };

  if (variant === 'compact') {
    return (
      <div
        onClick={handleClick}
        className={cn(
          "flex items-center gap-3 p-3 rounded-xl cursor-pointer",
          "bg-white border border-slate-100",
          "transition-all duration-200",
          "hover:-translate-y-0.5 hover:shadow-md hover:border-slate-200",
          className
        )}
      >
        <PlayerAvatar player={player} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900 truncate">
            {player.firstName} {player.lastName}
          </div>
          <div className="text-sm text-slate-500">
            {player.position} • {player.graduationYear}
          </div>
        </div>
        {player.status && (
          <StatusDot variant={getStatusVariant(player.status)} />
        )}
      </div>
    );
  }

  if (variant === 'featured') {
    return (
      <div className={cn(
        "relative overflow-hidden rounded-2xl",
        "bg-white border border-slate-100",
        "transition-all duration-200",
        "hover:-translate-y-1 hover:shadow-xl",
        className
      )}>
        {/* Cover Image */}
        <div className="h-32 bg-gradient-to-br from-green-400 to-emerald-500 relative">
          {player.coverImage && (
            <img
              src={player.coverImage}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />

          {/* Actions overlay */}
          <div className="absolute top-3 right-3 flex gap-2">
            <ActionButton
              icon={isOnWatchlist ? IconHeartFilled : IconHeart}
              onClick={onWatchlist}
              active={isOnWatchlist}
              activeClass="bg-red-500 text-white"
            />
            <ActionButton icon={IconMessage} onClick={onMessage} />
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
              <h3 className="font-semibold text-lg text-slate-900 group-hover:text-green-600 transition-colors">
                {player.firstName} {player.lastName}
              </h3>
              {player.verified && <VerifiedBadge />}
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-500 mb-4">
            <span className="font-medium text-slate-700">{player.position}</span>
            {player.secondaryPosition && (
              <>
                <span>•</span>
                <span>{player.secondaryPosition}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
            <div className="flex items-center gap-1.5">
              <IconGraduationCap size={16} className="text-slate-400" />
              <span>Class of {player.graduationYear}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <IconMapPin size={16} className="text-slate-400" />
              <span>{player.state}</span>
            </div>
          </div>

          {/* Stats Row */}
          {player.stats && (
            <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
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
      "relative overflow-hidden rounded-2xl",
      "bg-white border border-slate-100",
      "transition-all duration-200",
      "hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-200",
      "group",
      className
    )}>
      <div className="p-5">
        <div className="flex items-start gap-4">
          <PlayerAvatar player={player} size="md" />

          <div className="flex-1 min-w-0">
            <div onClick={handleClick} className="cursor-pointer">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-slate-900 group-hover:text-green-600 transition-colors truncate">
                  {player.firstName} {player.lastName}
                </h3>
                {player.verified && <VerifiedBadge />}
              </div>
            </div>

            <div className="text-sm text-slate-500 mb-2">
              {player.position} • Class of {player.graduationYear}
            </div>

            <div className="flex items-center gap-1.5 text-sm text-slate-400">
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
          <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-100">
            {player.stats.velocity && (
              <StatBadge label="Velo" value={`${player.stats.velocity}`} unit="mph" compact />
            )}
            {player.stats.gpa && (
              <StatBadge label="GPA" value={player.stats.gpa.toFixed(1)} compact />
            )}
            {player.stats.height && (
              <StatBadge label="Ht" value={player.stats.height} compact />
            )}
          </div>
        )}

        {/* Hover Actions */}
        <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ActionButton
            icon={isOnWatchlist ? IconHeartFilled : IconHeart}
            onClick={onWatchlist}
            active={isOnWatchlist}
            activeClass="text-red-500"
            size="sm"
          />
          <ActionButton icon={IconMessage} onClick={onMessage} size="sm" />
        </div>
      </div>
    </div>
  );
}

// ===== Sub-components =====

function PlayerAvatar({
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
      "rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center flex-shrink-0 overflow-hidden",
      sizeClasses[size],
      border && "ring-4 ring-white shadow-md"
    )}>
      {player.avatar ? (
        <img src={player.avatar} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="font-medium text-slate-600">
          {player.firstName.charAt(0)}{player.lastName.charAt(0)}
        </span>
      )}
    </div>
  );
}

function VerifiedBadge() {
  return (
    <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0" title="Verified Profile">
      <IconCheck size={10} className="text-white" />
    </div>
  );
}

function StatBadge({
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
        <span className="text-slate-400">{label}</span>{' '}
        <span className="font-medium text-slate-700">{value}</span>
        {unit && <span className="text-slate-400 text-xs ml-0.5">{unit}</span>}
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="text-lg font-semibold text-slate-900">
        {value}
        {unit && <span className="text-sm font-normal text-slate-400 ml-0.5">{unit}</span>}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  onClick,
  active = false,
  activeClass = '',
  size = 'md'
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onClick?: () => void;
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
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "rounded-lg bg-white/90 backdrop-blur-sm text-slate-600",
        "hover:bg-white hover:text-slate-900",
        "transition-all duration-200",
        "active:scale-95",
        sizeClasses[size],
        active && activeClass
      )}
    >
      <Icon size={16} />
    </button>
  );
}

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
export { PlayerAvatar, VerifiedBadge, StatBadge };
