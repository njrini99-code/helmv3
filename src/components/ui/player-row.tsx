'use client';

import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { BadgeChip } from '@/components/ui/filter-chips';
import { IconStar, IconMapPin, IconVideo } from '@/components/icons';

interface Player {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
  primary_position: string;
  secondary_position?: string | null;
  grad_year: number;
  city?: string | null;
  state?: string | null;
  high_school_name?: string | null;
  height_feet?: number | null;
  height_inches?: number | null;
  weight?: number | null;
  bats?: string | null;
  throws?: string | null;
  gpa?: number | null;
  player_videos?: { id: string }[];
  recruiting_activated?: boolean;
}

interface PlayerRowProps {
  player: Player;
  onClick?: () => void;
  onStar?: () => void;
  isStarred?: boolean;
  showStats?: boolean;
  showVideo?: boolean;
  compact?: boolean;
  className?: string;
  actions?: React.ReactNode;
}

export function PlayerRow({
  player,
  onClick,
  onStar,
  isStarred = false,
  showStats = true,
  showVideo = true,
  compact = false,
  className,
  actions,
}: PlayerRowProps) {
  const fullName = `${player.first_name} ${player.last_name}`;
  const location = [player.city, player.state].filter(Boolean).join(', ');
  const height = player.height_feet && player.height_inches
    ? `${player.height_feet}'${player.height_inches}"`
    : null;
  const videoCount = player.player_videos?.length || 0;

  if (compact) {
    return (
      <div
        onClick={onClick}
        className={cn(
          'flex items-center gap-3 p-3 rounded-xl transition-colors',
          onClick && 'cursor-pointer hover:bg-slate-50',
          className
        )}
      >
        <Avatar
          src={player.avatar_url}
          name={fullName}
          size="sm"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900 truncate">{fullName}</span>
            <BadgeChip size="sm">{player.primary_position}</BadgeChip>
          </div>
          <p className="text-xs text-slate-500 truncate">
            {player.high_school_name} • {player.grad_year}
          </p>
        </div>
        {actions}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200',
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:border-slate-300 hover:shadow-sm',
        className
      )}
    >
      {/* Avatar */}
      <Avatar
        src={player.avatar_url}
        name={fullName}
        size="lg"
      />

      {/* Main Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-semibold text-slate-900 truncate">{fullName}</h3>
          <BadgeChip variant="success">{player.primary_position}</BadgeChip>
          {player.secondary_position && (
            <BadgeChip>{player.secondary_position}</BadgeChip>
          )}
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span className="font-medium text-slate-700">{player.grad_year}</span>
          {player.high_school_name && (
            <span className="truncate">{player.high_school_name}</span>
          )}
          {location && (
            <span className="flex items-center gap-1">
              <IconMapPin size={14} className="text-slate-400" />
              {location}
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      {showStats && (
        <div className="hidden md:flex items-center gap-6 text-sm">
          {height && (
            <div className="text-center">
              <p className="text-slate-400 text-xs mb-0.5">Height</p>
              <p className="font-medium text-slate-700">{height}</p>
            </div>
          )}
          {player.weight && (
            <div className="text-center">
              <p className="text-slate-400 text-xs mb-0.5">Weight</p>
              <p className="font-medium text-slate-700">{player.weight} lbs</p>
            </div>
          )}
          {player.bats && player.throws && (
            <div className="text-center">
              <p className="text-slate-400 text-xs mb-0.5">B/T</p>
              <p className="font-medium text-slate-700">{player.bats}/{player.throws}</p>
            </div>
          )}
          {player.gpa && (
            <div className="text-center">
              <p className="text-slate-400 text-xs mb-0.5">GPA</p>
              <p className="font-medium text-slate-700">{player.gpa.toFixed(2)}</p>
            </div>
          )}
        </div>
      )}

      {/* Video indicator */}
      {showVideo && videoCount > 0 && (
        <div className="hidden sm:flex items-center gap-1 text-slate-400">
          <IconVideo size={16} />
          <span className="text-xs font-medium">{videoCount}</span>
        </div>
      )}

      {/* Star button */}
      {onStar && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onStar();
          }}
          className={cn(
            'p-2 rounded-lg transition-colors',
            isStarred
              ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50'
              : 'text-slate-300 hover:text-amber-500 hover:bg-slate-50'
          )}
        >
          <IconStar size={20} className={isStarred ? 'fill-current' : ''} />
        </button>
      )}

      {/* Custom actions */}
      {actions}
    </div>
  );
}

// Skeleton loading state
export function PlayerRowSkeleton({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 animate-pulse">
        <div className="w-8 h-8 rounded-full bg-slate-200" />
        <div className="flex-1">
          <div className="h-4 bg-slate-200 rounded w-32 mb-1" />
          <div className="h-3 bg-slate-200 rounded w-24" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 animate-pulse">
      <div className="w-12 h-12 rounded-full bg-slate-200" />
      <div className="flex-1">
        <div className="h-5 bg-slate-200 rounded w-40 mb-2" />
        <div className="h-4 bg-slate-200 rounded w-64" />
      </div>
      <div className="hidden md:flex items-center gap-6">
        <div className="w-12 h-10 bg-slate-200 rounded" />
        <div className="w-12 h-10 bg-slate-200 rounded" />
        <div className="w-12 h-10 bg-slate-200 rounded" />
      </div>
    </div>
  );
}

// Grid card variant for player display
interface PlayerCardProps {
  player: Player;
  onClick?: () => void;
  onStar?: () => void;
  isStarred?: boolean;
  className?: string;
}

export function PlayerCard({
  player,
  onClick,
  onStar,
  isStarred = false,
  className,
}: PlayerCardProps) {
  const fullName = `${player.first_name} ${player.last_name}`;
  const location = [player.city, player.state].filter(Boolean).join(', ');
  const height = player.height_feet && player.height_inches
    ? `${player.height_feet}'${player.height_inches}"`
    : null;

  return (
    <div
      onClick={onClick}
      className={cn(
        'bg-white rounded-2xl border border-slate-200 p-4',
        'transition-all duration-200',
        onClick && 'cursor-pointer hover:border-slate-300 hover:shadow-md',
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <Avatar
          src={player.avatar_url}
          name={fullName}
          size="xl"
        />
        {onStar && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStar();
            }}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              isStarred
                ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50'
                : 'text-slate-300 hover:text-amber-500 hover:bg-slate-50'
            )}
          >
            <IconStar size={18} className={isStarred ? 'fill-current' : ''} />
          </button>
        )}
      </div>

      {/* Name & Position */}
      <div className="mb-2">
        <h3 className="font-semibold text-slate-900 truncate">{fullName}</h3>
        <div className="flex items-center gap-2 mt-1">
          <BadgeChip variant="success" size="sm">{player.primary_position}</BadgeChip>
          <span className="text-sm leading-relaxed text-slate-500">{player.grad_year}</span>
        </div>
      </div>

      {/* School & Location */}
      <p className="text-sm leading-relaxed text-slate-500 truncate mb-3">
        {player.high_school_name}
        {location && ` • ${location}`}
      </p>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
        {height && (
          <div className="text-center">
            <p className="text-xs text-slate-400">Height</p>
            <p className="text-sm font-medium text-slate-700">{height}</p>
          </div>
        )}
        {player.weight && (
          <div className="text-center">
            <p className="text-xs text-slate-400">Weight</p>
            <p className="text-sm font-medium text-slate-700">{player.weight}</p>
          </div>
        )}
        {player.bats && player.throws && (
          <div className="text-center">
            <p className="text-xs text-slate-400">B/T</p>
            <p className="text-sm font-medium text-slate-700">{player.bats}/{player.throws}</p>
          </div>
        )}
      </div>
    </div>
  );
}
