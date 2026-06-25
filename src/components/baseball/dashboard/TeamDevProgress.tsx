'use client';

import Link from 'next/link';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShineEffect } from '@/components/ui/shine-effect';
import {
  IconNote,
  IconChevronRight,
  IconWarning,
  IconAlertCircle,
  IconRefresh,
} from '@/components/icons';
import type { DevPlanProgressItem } from '@/app/baseball/actions/team-dashboard';
import { Button } from '@/components/ui/button';

interface TeamDevProgressProps {
  data: DevPlanProgressItem[];
  loading?: boolean;
  /** Truthy when the dashboard hook failed. Renders the recoverable error face. */
  error?: boolean;
  /** Retry handler — typically the hook's `refetch`. */
  onRetry?: () => void;
}

function ProgressBar({
  value,
  className,
  label,
}: {
  value: number;
  className?: string;
  label?: string;
}) {
  // Restricted accent set — primary (good ≥75) → amber (watch 25–74) → red
  // (behind <25). Orange folds to amber so the bar matches the daily-home palette.
  const colorClass = value >= 75
    ? 'bg-primary-500'
    : value >= 25
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <div
      className={`h-1.5 rounded-full bg-warm-200 overflow-hidden ${className ?? ''}`}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 motion-reduce:transition-none ${colorClass}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function DevPlanCard({ item }: { item: DevPlanProgressItem }) {
  return (
    <Link
      href={`/baseball/dashboard/dev-plans?player=${item.playerId}`}
      className="flex items-center gap-3 p-3 rounded-xl border border-warm-100 bg-cream-50 hover:border-warm-200 hover:shadow-sm transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <Avatar 
        name={item.playerName} 
        src={item.avatarUrl || undefined}
        size="sm"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-warm-900 truncate">{item.playerName}</p>
          {item.hasOverdue && (
            <Badge variant="warning" className="text-eyebrow px-1.5 py-0">
              <IconWarning size={10} className="mr-0.5" />
              Overdue
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <ProgressBar
            value={item.progressPct}
            className="flex-1 max-w-[100px]"
            label={`${item.playerName} development plan ${item.progressPct}% complete`}
          />
          <span className="text-xs text-warm-500 tabular-nums">
            {item.completedGoals}/{item.totalGoals} goals
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-warm-900 tabular-nums">{item.progressPct}%</span>
        <IconChevronRight
          size={16}
          className="text-warm-300 group-hover:text-warm-500 group-hover:translate-x-0.5 transition-all motion-reduce:transition-none"
        />
      </div>
    </Link>
  );
}

/** Shared header so loading / error / empty / content read identically. */
function DevProgressHeader() {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100/50">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center">
          <IconNote size={16} className="text-primary-600" />
        </div>
        <h3 className="font-semibold text-warm-900 tracking-tight">Dev Plan Progress</h3>
      </div>
      <Link
        href="/baseball/dashboard/dev-plans"
        className="text-xs text-warm-500 hover:text-warm-900 flex items-center gap-1 transition-colors group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        View all
        <IconChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none" />
      </Link>
    </div>
  );
}

export function TeamDevProgress({ data, loading, error, onRetry }: TeamDevProgressProps) {
  const prefersReducedMotion = useReducedMotion();

  if (loading) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <DevProgressHeader />
        <div className="p-4 space-y-3">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-warm-100">
              <Skeleton variant="circular" width={32} height={32} />
              <div className="flex-1">
                <Skeleton variant="text" width="60%" height={14} className="mb-2" />
                <Skeleton variant="rectangular" width={100} height={6} className="rounded-full" />
              </div>
              <Skeleton variant="text" width={40} height={18} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <DevProgressHeader />
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center justify-center py-10 px-4 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-3">
            <IconAlertCircle size={22} className="text-destructive" />
          </div>
          <h4 className="text-sm font-medium text-warm-900 mb-1">Couldn&apos;t load dev plans</h4>
          <p className="text-xs text-warm-500 max-w-[220px] mb-3">
            This is usually temporary — your plans are safe. Try again in a moment.
          </p>
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<IconRefresh size={14} />}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative glass-standard rounded-2xl overflow-clip">
      <ShineEffect />
      <DevProgressHeader />

      <div className="p-4">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center mb-3">
              <IconNote size={20} className="text-warm-400" />
            </div>
            <h4 className="text-sm font-medium text-warm-900 mb-1">No active dev plans</h4>
            <p className="text-xs text-warm-500 max-w-[220px] mb-4">
              Create development plans to track player goals and progress.
            </p>
            <Link href="/baseball/dashboard/dev-plans">
              <Button variant="secondary" size="sm">
                Create Dev Plan
              </Button>
            </Link>
          </div>
        ) : (
          <LazyMotion features={domAnimation} strict>
            <ul className="space-y-2">
              {data.slice(0, 5).map((item, index) => (
                <m.li
                  key={item.playerId}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: prefersReducedMotion ? 0 : index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                >
                  <DevPlanCard item={item} />
                </m.li>
              ))}
            </ul>
          </LazyMotion>
        )}
      </div>
    </div>
  );
}
