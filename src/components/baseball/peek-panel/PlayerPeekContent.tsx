'use client';

import { memo, useEffect, useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { QuickStatsDisplay } from './QuickStatsDisplay';
import { PlayerQuickActions } from './PlayerQuickActions';
import { getPlayerPeekData, type PlayerPeekData } from '@/app/baseball/actions/player-peek';
import {
  IconMapPin,
  IconGraduationCap,
  IconRuler,
  IconActivity,
  IconVideo,
} from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

interface PlayerPeekContentProps {
  playerId: string;
  onClose?: () => void;
  className?: string;
}

// Player avatar component
const PlayerAvatar = memo(function PlayerAvatar({
  avatarUrl,
  firstName,
  lastName,
  size = 'lg',
}: {
  avatarUrl: string | null;
  firstName: string;
  lastName: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizeClasses = {
    sm: 'w-12 h-12 text-base',
    md: 'w-16 h-16 text-lg',
    lg: 'w-20 h-20 text-2xl',
  };

  return (
    <div
      className={cn(
        'rounded-2xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-warm-200 to-warm-300',
        'flex items-center justify-center ring-4 ring-white shadow-lg',
        sizeClasses[size]
      )}
    >
      {avatarUrl ? (
        <Image
          src={avatarUrl}
          alt={`${firstName} ${lastName}`}
          width={size === 'lg' ? 80 : size === 'md' ? 64 : 48}
          height={size === 'lg' ? 80 : size === 'md' ? 64 : 48}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="font-bold text-warm-600">
          {firstName.charAt(0)}
          {lastName.charAt(0)}
        </span>
      )}
    </div>
  );
});

// Loading skeleton
const PlayerPeekSkeleton = memo(function PlayerPeekSkeleton() {
  return (
    <div className="p-5 space-y-5 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-start gap-4">
        <Skeleton className="w-20 h-20 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>

      {/* Actions skeleton */}
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-10 rounded-lg" />
          <Skeleton className="h-10 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 flex-1 rounded-lg" />
          <Skeleton className="h-9 flex-1 rounded-lg" />
        </div>
      </div>
    </div>
  );
});

// Pipeline stage badge
const PipelineStageBadge = memo(function PipelineStageBadge({
  stage,
}: {
  stage: string | null;
}) {
  if (!stage) return null;

  const stageConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    watchlist: { label: 'Watchlist', variant: 'secondary' },
    high_priority: { label: 'High Priority', variant: 'default' },
    offer_extended: { label: 'Offer Extended', variant: 'default' },
    committed: { label: 'Committed', variant: 'default' },
  };

  const config = stageConfig[stage];
  if (!config) return null;

  return (
    <Badge variant={config.variant} className="text-xs">
      {config.label}
    </Badge>
  );
});

const PlayerPeekContentComponent = function PlayerPeekContent({
  playerId,
  onClose,
  className,
}: PlayerPeekContentProps) {
  const [player, setPlayer] = useState<PlayerPeekData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPlayer() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await getPlayerPeekData(playerId);
        if (result.success && result.data) {
          setPlayer(result.data);
        } else {
          setError(result.error || 'Failed to load player');
        }
      } catch (err) {
        console.error('Error loading player:', err);
        setError('Failed to load player');
      } finally {
        setIsLoading(false);
      }
    }

    loadPlayer();
  }, [playerId]);

  const handleWatchlistChange = (isOnWatchlist: boolean) => {
    if (player) {
      setPlayer({ ...player, isOnWatchlist });
    }
  };

  if (isLoading) {
    return <PlayerPeekSkeleton />;
  }

  if (error || !player) {
    return (
      <div className="p-5 text-center">
        <p className="text-warm-500">{error || 'Player not found'}</p>
      </div>
    );
  }

  // Format height
  const height =
    player.heightFeet && player.heightInches
      ? `${player.heightFeet}'${player.heightInches}"`
      : null;

  // Build stats array
  const stats = [
    player.stats.pitchVelo && { label: 'Velo', value: player.stats.pitchVelo, unit: ' mph', highlight: true },
    player.stats.exitVelo && { label: 'Exit Velo', value: player.stats.exitVelo, unit: ' mph' },
    player.stats.sixtyTime && { label: '60 yd', value: player.stats.sixtyTime, unit: 's' },
    player.stats.popTime && { label: 'Pop Time', value: player.stats.popTime, unit: 's' },
    player.gpa && { label: 'GPA', value: player.gpa },
  ].filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="p-5 border-b border-warm-100">
        <div className="flex items-start gap-4">
          <PlayerAvatar
            avatarUrl={player.avatarUrl}
            firstName={player.firstName}
            lastName={player.lastName}
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-bold text-warm-900 truncate">
                {player.firstName} {player.lastName}
              </h2>
              {player.hasVideo && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warm-100 text-warm-600 text-xs">
                  <IconVideo size={12} />
                  Video
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 mt-1 text-warm-600">
              <span className="font-semibold">{player.primaryPosition}</span>
              {player.secondaryPosition && (
                <>
                  <span className="text-warm-300">•</span>
                  <span>{player.secondaryPosition}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 mt-2 text-sm text-warm-500">
              <IconGraduationCap size={14} className="text-warm-400" />
              <span>Class of {player.gradYear}</span>
            </div>

            {player.highSchoolName && (
              <div className="flex items-center gap-1.5 mt-1 text-sm text-warm-500">
                <IconMapPin size={14} className="text-warm-400" />
                <span className="truncate">
                  {player.highSchoolName}
                  {player.city && player.state && `, ${player.city}, ${player.state}`}
                  {!player.city && player.state && `, ${player.state}`}
                </span>
              </div>
            )}

            {/* Pipeline stage badge */}
            {player.pipelineStage && (
              <div className="mt-2">
                <PipelineStageBadge stage={player.pipelineStage} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Physical info */}
      <div className="px-5 py-3 bg-warm-50/50 border-b border-warm-100">
        <div className="flex items-center gap-4 text-sm">
          {height && (
            <div className="flex items-center gap-1.5 text-warm-600">
              <IconRuler size={14} className="text-warm-400" />
              <span>{height}</span>
            </div>
          )}
          {player.weightLbs && (
            <div className="flex items-center gap-1.5 text-warm-600">
              <IconActivity size={14} className="text-warm-400" />
              <span>{player.weightLbs} lbs</span>
            </div>
          )}
          {(player.bats || player.throws) && (
            <div className="text-warm-600">
              {player.bats && <span>B: {player.bats}</span>}
              {player.bats && player.throws && <span className="mx-1">/</span>}
              {player.throws && <span>T: {player.throws}</span>}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats.length > 0 && (
        <div className="p-5 border-b border-warm-100">
          <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-3">
            Key Stats
          </h3>
          <QuickStatsDisplay stats={stats} variant="grid" />
        </div>
      )}

      {/* Actions - fixed at bottom */}
      <div className="mt-auto p-5 pt-4 bg-white border-t border-warm-100">
        <PlayerQuickActions
          playerId={player.id}
          isOnWatchlist={player.isOnWatchlist}
          hasVideo={player.hasVideo}
          onWatchlistChange={handleWatchlistChange}
          onClose={onClose}
        />
      </div>
    </div>
  );
};

export const PlayerPeekContent = memo(PlayerPeekContentComponent);
PlayerPeekContent.displayName = 'PlayerPeekContent';
