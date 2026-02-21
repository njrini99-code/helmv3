'use client';

import { memo, useState } from 'react';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  IconMapPin,
  IconUsers,
  IconBuilding,
  IconChevronRight,
  IconEye,
  IconSparkles,
} from '@/components/icons';

export interface TeamCardData {
  id: string;
  name: string;
  type: 'high_school' | 'showcase' | 'travel_ball' | 'juco';
  city: string;
  state: string;
  logoUrl?: string | null;
  primaryColor?: string;
  playerCount: number;
  recruitingActiveCount: number;
  topProspects?: Array<{
    id: string;
    name: string;
    position: string;
    gradYear: number;
    avatarUrl?: string | null;
  }>;
  recentActivity?: string;
  division?: string;
}

interface TeamCardProps {
  team: TeamCardData;
  onViewProfile?: (teamId: string) => void;
  onTeamClick?: (teamId: string) => void;
  variant?: 'default' | 'compact';
  className?: string;
}

const TYPE_LABELS: Record<TeamCardData['type'], string> = {
  high_school: 'High School',
  showcase: 'Showcase',
  travel_ball: 'Travel Ball',
  juco: 'JUCO',
};

const TYPE_COLORS: Record<TeamCardData['type'], { bg: string; text: string; border: string }> = {
  high_school: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  showcase: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  travel_ball: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  juco: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
};

export const TeamCard = memo(function TeamCard({
  team,
  onViewProfile,
  onTeamClick,
  variant = 'default',
  className,
}: TeamCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const typeStyle = TYPE_COLORS[team.type];

  return (
    <motion.div
      className={cn(
        'group relative rounded-2xl bg-white border border-slate-200/80 overflow-hidden',
        'transition-all duration-300 ease-out cursor-pointer',
        'hover:border-slate-300 hover:shadow-lg hover:shadow-slate-200/50',
        className
      )}
      onClick={() => onTeamClick?.(team.id)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      {/* Card Content */}
      <div className="p-4">
        {/* Header: Logo + Info */}
        <div className="flex items-start gap-3">
          {/* Team Logo */}
          <div
            className={cn(
              'relative flex-shrink-0 w-11 h-11 rounded-lg overflow-hidden',
              'border border-slate-200 bg-slate-50',
              'flex items-center justify-center'
            )}
            style={{
              backgroundColor: team.primaryColor
                ? `${team.primaryColor}15`
                : undefined,
              borderColor: team.primaryColor
                ? `${team.primaryColor}30`
                : undefined,
            }}
          >
            {team.logoUrl ? (
              <Image
                src={team.logoUrl}
                alt={team.name}
                width={44}
                height={44}
                className="object-contain"
              />
            ) : (
              <span
                className="text-lg font-bold"
                style={{ color: team.primaryColor || '#64748b' }}
              >
                {team.name.charAt(0)}
              </span>
            )}
          </div>

          {/* Team Info */}
          <div className="flex-1 min-w-0 overflow-hidden">
            {/* Type Badge - Above Name */}
            <div className="mb-1">
              <span
                className={cn(
                  'inline-flex px-2 py-0.5 text-micro font-medium rounded-full border',
                  typeStyle.bg,
                  typeStyle.text,
                  typeStyle.border
                )}
              >
                {TYPE_LABELS[team.type]}
              </span>
            </div>
            <h3 className="font-semibold text-slate-900 truncate leading-tight text-sm">
              {team.name}
            </h3>
            <div className="flex items-center gap-1 mt-0.5 text-xs text-slate-500">
              <IconMapPin size={12} className="flex-shrink-0" />
              <span className="truncate">
                {team.city}, {team.state}
              </span>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <IconUsers size={14} className="text-slate-400 flex-shrink-0" />
            <span className="text-xs text-slate-600 whitespace-nowrap">
              <span className="font-semibold text-slate-900">
                {team.playerCount}
              </span>{' '}
              players
            </span>
          </div>

          {team.recruitingActiveCount > 0 && (
            <div className="flex items-center gap-1.5">
              <IconSparkles size={14} className="text-primary-500 flex-shrink-0" />
              <span className="text-xs text-slate-600 whitespace-nowrap">
                <span className="font-semibold text-primary-600">
                  {team.recruitingActiveCount}
                </span>{' '}
                active
              </span>
            </div>
          )}
        </div>

        {/* Top Prospects Preview */}
        {team.topProspects && team.topProspects.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-micro font-medium text-slate-400 uppercase tracking-wide mb-1.5">
              Top Prospects
            </p>
            <div className="flex items-center gap-2">
              {/* Avatar Stack */}
              <div className="flex -space-x-1.5 flex-shrink-0">
                {team.topProspects.slice(0, 3).map((prospect, index) => (
                  <div
                    key={prospect.id}
                    className={cn(
                      'relative w-6 h-6 rounded-full border-2 border-white',
                      'bg-slate-200 flex items-center justify-center',
                      'text-micro font-medium text-slate-600'
                    )}
                    style={{ zIndex: 3 - index }}
                  >
                    {prospect.avatarUrl ? (
                      <Image
                        src={prospect.avatarUrl}
                        alt={prospect.name}
                        fill
                        className="object-cover rounded-full"
                      />
                    ) : (
                      <span>
                        {prospect.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Names */}
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-xs text-slate-600 truncate">
                  {team.topProspects
                    .slice(0, 2)
                    .map((p) => p.name.split(' ')[1] || p.name)
                    .join(', ')}
                  {team.topProspects.length > 2 && (
                    <span className="text-slate-400">
                      {' '}
                      +{team.topProspects.length - 2}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div
          className={cn(
            'mt-4 pt-4 border-t border-slate-100',
            'transition-opacity duration-200',
            variant === 'compact' ? 'opacity-0 group-hover:opacity-100' : ''
          )}
        >
          <Button
            variant="primary"
            size="sm"
            className="w-full justify-center gap-1.5 text-xs"
            onClick={(event) => {
              event.stopPropagation();
              onViewProfile?.(team.id);
            }}
          >
            <IconEye size={14} className="flex-shrink-0" />
            <span>View Profile</span>
            <IconChevronRight size={12} className="flex-shrink-0" />
          </Button>
        </div>
      </div>

      {/* Hover Highlight Border */}
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        style={{
          background: `linear-gradient(135deg, ${team.primaryColor || '#16a34a'}10 0%, transparent 50%)`,
          border: `1px solid ${team.primaryColor || '#16a34a'}20`,
          borderRadius: 'inherit',
        }}
      />
    </motion.div>
  );
});

// Grid component for team cards
interface TeamCardGridProps {
  teams: TeamCardData[];
  onViewProfile?: (teamId: string) => void;
  onTeamClick?: (teamId: string) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export function TeamCardGrid({
  teams,
  onViewProfile,
  onTeamClick,
  loading,
  emptyMessage = 'No teams found',
}: TeamCardGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl bg-white border border-slate-200/80 p-4 animate-pulse"
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-lg bg-slate-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-100 rounded w-16" />
                <div className="h-4 bg-slate-200 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
              </div>
            </div>
            <div className="mt-4 flex gap-3">
              <div className="h-4 bg-slate-100 rounded w-16" />
              <div className="h-4 bg-slate-100 rounded w-16" />
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="h-8 bg-slate-200 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
          <IconBuilding size={32} className="text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">
          No teams found
        </h3>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {teams.map((team, index) => (
        <motion.div
          key={team.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.05 }}
        >
          <TeamCard
            team={team}
            onViewProfile={onViewProfile}
            onTeamClick={onTeamClick}
          />
        </motion.div>
      ))}
    </div>
  );
}
