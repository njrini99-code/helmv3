'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import {
  IconUsers,
  IconCheck,
  IconGraduationCap,
  IconArrowRight,
  IconRefresh,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import type { TeamHealthData } from '@/app/baseball/actions/team-dashboard';

interface TeamHealthHeroProps {
  data: TeamHealthData;
  loading?: boolean;
}

function ProgressRing({ 
  value, 
  max, 
  size = 48, 
  strokeWidth = 4,
  color = 'text-primary-500',
}: { 
  value: number; 
  max: number; 
  size?: number; 
  strokeWidth?: number;
  color?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference - progress * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-white/20"
      />
      {/* Progress circle */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={color}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.8, ease: [0.33, 1, 0.68, 1] })}
        style={{
          strokeDasharray: circumference,
        }}
      />
    </svg>
  );
}

function StatBlock({
  label,
  value,
  subtext,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="text-center p-3 rounded-xl bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-colors">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <Icon size={14} className="text-warm-400" />
        <span className="text-xs text-warm-400 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      {subtext && (
        <p className="text-xs text-warm-400 mt-0.5">{subtext}</p>
      )}
    </div>
  );
}

export function TeamHealthHero({ data, loading }: TeamHealthHeroProps) {
  // Color variables computed but could be used for conditional styling
  // Keeping for future enhancement
  const _eligibilityColor = data.eligibilityPct >= 90 
    ? 'text-green-400' 
    : data.eligibilityPct >= 75 
      ? 'text-amber-400' 
      : 'text-red-400';

  const _gpaColor = (data.teamGpa || 0) >= 3.0 
    ? 'text-green-400' 
    : (data.teamGpa || 0) >= 2.5 
      ? 'text-amber-400' 
      : 'text-red-400';
  
  // Mark as intentionally unused for now
  void _eligibilityColor;
  void _gpaColor;

  if (loading) {
    return (
      <div className="md:col-span-2 rounded-3xl bg-gradient-to-br from-warm-900 via-warm-800 to-warm-900 border border-warm-700/50 p-6 overflow-hidden animate-pulse">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-white/10" />
          <div>
            <div className="h-3.5 bg-white/10 rounded w-24 mb-2" />
            <div className="h-9 bg-white/10 rounded w-16" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2 mt-6">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="text-center p-3 rounded-xl bg-white/5">
              <div className="h-5 bg-white/10 rounded w-8 mx-auto mb-1" />
              <div className="h-3 bg-white/5 rounded w-12 mx-auto" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="md:col-span-2 relative group rounded-3xl bg-gradient-to-br from-warm-900 via-warm-800 to-warm-900 border border-warm-700/50 p-6 overflow-hidden hover:shadow-2xl transition-shadow duration-300">
      {/* Glow effect */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl group-hover:bg-primary-500/15 transition-colors duration-500" />
      
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <ProgressRing 
                value={data.rosterCount} 
                max={data.rosterCapacity}
                size={56}
                strokeWidth={5}
                color="text-primary-400"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <IconUsers size={20} className="text-primary-400" />
              </div>
            </div>
            <div>
              <p className="text-sm text-warm-400 mb-0.5">Team Health</p>
              <p className="text-3xl font-bold text-white tabular-nums">
                {data.rosterCount}
                <span className="text-lg text-warm-500 font-normal">/{data.rosterCapacity}</span>
              </p>
            </div>
          </div>

          {data.recentJoins > 0 && (
            <div className="px-3 py-1.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
              +{data.recentJoins} this week
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBlock
            label="Roster"
            value={data.rosterCount}
            subtext="players"
            icon={IconUsers}
          />
          <StatBlock
            label="Eligible"
            value={`${data.eligibilityPct}%`}
            subtext={`${data.eligibleCount} cleared`}
            icon={IconCheck}
          />
          <StatBlock
            label="Team GPA"
            value={data.teamGpa?.toFixed(2) || '—'}
            subtext="average"
            icon={IconGraduationCap}
          />
          <StatBlock
            label="Transfer Ready"
            value={data.transferReadyCount}
            subtext="activated"
            icon={IconRefresh}
          />
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-3 mt-6">
          <Link href="/baseball/dashboard/roster">
            <Button 
              variant="secondary" 
              size="sm" 
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              Manage Roster
            </Button>
          </Link>
          <Link href="/baseball/dashboard/academics">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-warm-400 hover:text-white hover:bg-white/10"
            >
              View Academics <IconArrowRight size={14} className="ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// Skeleton component for loading state
export function TeamHealthHeroSkeleton() {
  return (
    <div className="md:col-span-2 rounded-3xl bg-gradient-to-br from-warm-900 via-warm-800 to-warm-900 border border-warm-700/50 p-6 overflow-hidden animate-pulse">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full bg-white/10" />
        <div>
          <div className="h-3 bg-white/10 rounded w-20 mb-2" />
          <div className="h-8 bg-white/10 rounded w-24" />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="p-3 rounded-xl bg-white/5">
            <div className="h-3 bg-white/10 rounded w-16 mx-auto mb-2" />
            <div className="h-6 bg-white/10 rounded w-10 mx-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}
