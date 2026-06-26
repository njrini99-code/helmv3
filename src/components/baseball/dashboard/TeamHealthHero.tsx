'use client';

import Link from 'next/link';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import {
  IconUsers,
  IconCheck,
  IconGraduationCap,
  IconArrowRight,
  IconRefresh,
  IconAlertCircle,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import type { TeamHealthData } from './dashboard-types';

interface TeamHealthHeroProps {
  data: TeamHealthData;
  loading?: boolean;
  /** Truthy when the dashboard hook failed. Renders the recoverable error face. */
  error?: boolean;
  /** Retry handler — typically the hook's `refetch`. */
  onRetry?: () => void;
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
    <svg
      width={size}
      height={size}
      className="-rotate-90"
      aria-hidden="true"
      focusable="false"
    >
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
      <m.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className={color}
        initial={{ strokeDashoffset: prefersReducedMotion ? offset : circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.8, ease: [0.33, 1, 0.68, 1] }}
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
  /** Optional tier color for the value (eligibility / GPA health). */
  valueClassName = 'text-white',
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  valueClassName?: string;
}) {
  return (
    <div className="text-center p-3 rounded-xl bg-white/5 backdrop-blur-sm ring-1 ring-inset ring-white/5 hover:bg-white/10 hover:ring-white/10 transition-colors duration-200">
      <div className="flex items-center justify-center gap-1.5 mb-1">
        <Icon size={14} className="text-warm-400" />
        <span className="text-eyebrow text-warm-400 uppercase">{label}</span>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${valueClassName}`}>{value}</p>
      {subtext && (
        <p className="text-xs text-warm-400 mt-0.5">{subtext}</p>
      )}
    </div>
  );
}

/** Shared shell so loading / error / content all share one matte hero surface. */
function HeroShell({ children, pulse }: { children: React.ReactNode; pulse?: boolean }) {
  return (
    <div
      className={`md:col-span-2 relative rounded-3xl bg-gradient-to-br from-warm-900 via-warm-800 to-warm-900 border border-warm-700/50 p-6 overflow-hidden ${pulse ? 'animate-pulse' : ''}`}
    >
      {children}
    </div>
  );
}

function HeroSkeletonBody() {
  return (
    <>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-full bg-white/10" />
        <div>
          <div className="h-3 bg-white/10 rounded w-20 mb-2" />
          <div className="h-8 bg-white/10 rounded w-24" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="p-3 rounded-xl bg-white/5">
            <div className="h-3 bg-white/10 rounded w-16 mx-auto mb-2" />
            <div className="h-6 bg-white/10 rounded w-10 mx-auto" />
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-6">
        <div className="h-9 w-32 rounded-md bg-white/10" />
        <div className="h-9 w-32 rounded-md bg-white/5" />
      </div>
    </>
  );
}

export function TeamHealthHero({ data, loading, error, onRetry }: TeamHealthHeroProps) {
  const prefersReducedMotion = useReducedMotion();

  // Health tiers drive the value color so a coach can read risk at a glance —
  // primary-green (healthy) → amber (watch) → red (at risk). No off-palette hues.
  const eligibilityColor =
    data.eligibilityPct >= 90
      ? 'text-primary-400'
      : data.eligibilityPct >= 75
        ? 'text-amber-400'
        : 'text-red-400';

  const gpaColor =
    (data.teamGpa ?? 0) >= 3.0
      ? 'text-primary-400'
      : (data.teamGpa ?? 0) >= 2.5
        ? 'text-amber-400'
        : 'text-red-400';

  if (loading) {
    return (
      <HeroShell pulse>
        <HeroSkeletonBody />
      </HeroShell>
    );
  }

  if (error) {
    return (
      <HeroShell>
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center justify-center text-center py-6"
        >
          <div className="w-12 h-12 rounded-2xl bg-red-500/15 flex items-center justify-center mb-3">
            <IconAlertCircle size={24} className="text-red-400" />
          </div>
          <h3 className="text-base font-semibold text-white tracking-tight">
            Couldn&apos;t load team health
          </h3>
          <p className="text-sm leading-relaxed text-warm-400 mt-1.5 max-w-sm">
            This is usually temporary — your roster is safe. Try again in a moment.
          </p>
          {onRetry && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onRetry}
              leftIcon={<IconRefresh size={15} />}
              className="mt-4 bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              Try again
            </Button>
          )}
        </div>
      </HeroShell>
    );
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="md:col-span-2 relative group rounded-3xl bg-gradient-to-br from-warm-900 via-warm-800 to-warm-900 border border-warm-700/50 p-6 overflow-hidden hover:shadow-2xl transition-shadow duration-300"
      >
        {/* Glow effect */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl group-hover:bg-primary-500/15 transition-colors duration-500 motion-reduce:transition-none" />

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div
                className="relative"
                role="img"
                aria-label={`Roster: ${data.rosterCount} of ${data.rosterCapacity} spots filled`}
              >
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
                <p className="text-eyebrow text-warm-400 uppercase mb-1">Team Health</p>
                <p className="text-3xl font-bold text-white tabular-nums leading-none">
                  {data.rosterCount}
                  <span className="text-lg text-warm-500 font-normal">/{data.rosterCapacity}</span>
                </p>
              </div>
            </div>

            {data.recentJoins > 0 && (
              <div className="px-3 py-1.5 rounded-full bg-primary-500/20 text-primary-300 text-xs font-medium ring-1 ring-inset ring-primary-400/20">
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
              valueClassName={eligibilityColor}
            />
            <StatBlock
              label="Team GPA"
              value={data.teamGpa?.toFixed(2) || '—'}
              subtext="average"
              icon={IconGraduationCap}
              valueClassName={data.teamGpa != null ? gpaColor : 'text-warm-500'}
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
      </m.div>
    </LazyMotion>
  );
}

// Skeleton component for loading state (shared surface + body with the live hero)
export function TeamHealthHeroSkeleton() {
  return (
    <HeroShell pulse>
      <HeroSkeletonBody />
    </HeroShell>
  );
}
