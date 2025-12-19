// components/shared/PlayerCard.tsx
'use client';

import { IconEye, IconVideo, IconMessage, IconStar, IconStarFilled } from '@/components/icons';
import Link from 'next/link';

interface PlayerCardProps {
  player: {
    id: string;
    first_name: string;
    last_name: string;
    primary_position: string;
    grad_year: number | null;
    city: string | null;
    state: string | null;
    avatar_url: string | null;
    gpa: number | null;
    height_inches: number | null;
    weight_lbs: number | null;
    recruiting_activated: boolean;
    // Stats (optional)
    fb_velo?: number | null;
  };
  status?: string; // 'High Priority', 'Contacted', 'Watching', etc.
  onAddToWatchlist?: (playerId: string) => void;
  isOnWatchlist?: boolean;
  showActions?: boolean;
  compact?: boolean;
}

const statusColors: Record<string, string> = {
  'High Priority': 'bg-amber-100 text-amber-700 border-amber-200',
  'Contacted': 'bg-blue-100 text-blue-700 border-blue-200',
  'Watching': 'bg-slate-100 text-slate-600 border-slate-200',
  'Campus Visit': 'bg-purple-100 text-purple-700 border-purple-200',
  'Offer Out': 'bg-green-100 text-green-700 border-green-200',
  'Committed': 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

function formatHeight(inches: number | null): string {
  if (!inches) return '—';
  const feet = Math.floor(inches / 12);
  const remainingInches = inches % 12;
  return `${feet}'${remainingInches}"`;
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
}

export function PlayerCard({
  player,
  status,
  onAddToWatchlist,
  isOnWatchlist,
  showActions = true,
  compact = false,
}: PlayerCardProps) {
  const initials = getInitials(player.first_name, player.last_name);

  if (compact) {
    return (
      <Link
        href={`/player/${player.id}`}
        className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 hover:border-green-200 hover:shadow-md transition-all group"
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
          {player.avatar_url ? (
            <img src={player.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            initials
          )}
        </div>
        
        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 truncate group-hover:text-green-600 transition-colors">
            {player.first_name} {player.last_name}
          </p>
          <p className="text-xs text-slate-500">
            {player.primary_position} • {player.grad_year}
          </p>
        </div>

        {/* Recruiting indicator */}
        {player.recruiting_activated && (
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Recruiting Active" />
        )}
      </Link>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-lg hover:border-green-200 transition-all group">
      <div className="flex flex-col items-center text-center">
        {/* Avatar */}
        <Link href={`/player/${player.id}`} className="relative">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center text-white text-xl font-bold group-hover:scale-105 transition-transform">
            {player.avatar_url ? (
              <img src={player.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              initials
            )}
          </div>
          {/* Green glow for recruiting active */}
          {player.recruiting_activated && (
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white" title="Recruiting Active" />
          )}
        </Link>
        
        {/* Name & Position */}
        <Link href={`/player/${player.id}`} className="mt-3">
          <h3 className="font-semibold text-slate-900 group-hover:text-green-600 transition-colors">
            {player.first_name} {player.last_name}
          </h3>
        </Link>
        <div className="flex items-center gap-2 mt-1">
          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
            {player.primary_position}
          </span>
          {player.grad_year && (
            <span className="text-xs text-slate-400">{player.grad_year}</span>
          )}
        </div>

        {/* Location */}
        {(player.city || player.state) && (
          <p className="text-xs text-slate-400 mt-1">
            {[player.city, player.state].filter(Boolean).join(', ')}
          </p>
        )}

        {/* Stats Row */}
        <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-slate-100 w-full">
          <div className="text-center">
            <p className="text-lg font-bold text-slate-900">
              {player.fb_velo || '—'}
            </p>
            <p className="text-xs text-slate-400">Velo</p>
          </div>
          <div className="w-px h-8 bg-slate-100" />
          <div className="text-center">
            <p className="text-lg font-bold text-slate-900">
              {player.gpa?.toFixed(1) || '—'}
            </p>
            <p className="text-xs text-slate-400">GPA</p>
          </div>
          <div className="w-px h-8 bg-slate-100" />
          <div className="text-center">
            <p className="text-lg font-bold text-slate-900">
              {formatHeight(player.height_inches)}
            </p>
            <p className="text-xs text-slate-400">Height</p>
          </div>
        </div>

        {/* Status Badge */}
        {status && (
          <div className={`mt-4 px-3 py-1.5 rounded-full text-xs font-medium border ${statusColors[status] || statusColors['Watching']}`}>
            {status}
          </div>
        )}

        {/* Quick Actions */}
        {showActions && (
          <div className="flex items-center gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <Link
              href={`/player/${player.id}`}
              className="p-2 rounded-lg bg-slate-100 hover:bg-green-100 text-slate-500 hover:text-green-600 transition-colors"
              title="View Profile"
            >
              <IconEye className="w-4 h-4" />
            </Link>
            <Link
              href={`/player/${player.id}?tab=videos`}
              className="p-2 rounded-lg bg-slate-100 hover:bg-green-100 text-slate-500 hover:text-green-600 transition-colors"
              title="Watch Videos"
            >
              <IconVideo className="w-4 h-4" />
            </Link>
            <button
              className="p-2 rounded-lg bg-slate-100 hover:bg-green-100 text-slate-500 hover:text-green-600 transition-colors"
              title="Send Message"
            >
              <IconMessage className="w-4 h-4" />
            </button>
            {onAddToWatchlist && (
              <button
                onClick={() => onAddToWatchlist(player.id)}
                className={`p-2 rounded-lg transition-colors ${
                  isOnWatchlist
                    ? 'bg-red-100 text-red-600'
                    : 'bg-slate-100 hover:bg-amber-100 text-slate-500 hover:text-amber-600'
                }`}
                title={isOnWatchlist ? 'On Watchlist' : 'Add to Watchlist'}
              >
                {isOnWatchlist ? <IconStarFilled className="w-4 h-4" /> : <IconStar className="w-4 h-4" />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Grid wrapper for consistent layout
interface PlayerCardGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4;
}

export function PlayerCardGrid({ children, columns = 4 }: PlayerCardGridProps) {
  const gridCols = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  };

  return (
    <div className={`grid ${gridCols[columns]} gap-4`}>
      {children}
    </div>
  );
}
