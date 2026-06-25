'use client';

import Link from 'next/link';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ShineEffect } from '@/components/ui/shine-effect';
import { Button } from '@/components/ui/button';
import {
  IconEye,
  IconBuilding,
  IconStar,
  IconChevronRight,
  IconTrendingUp,
  IconTrendingDown,
  IconAlertCircle,
  IconRefresh,
} from '@/components/icons';
import type { CollegeInterestSummary as CollegeInterestData, CollegeInterestItem } from '@/app/baseball/actions/team-dashboard';

interface CollegeInterestSummaryProps {
  data: CollegeInterestData;
  loading?: boolean;
  /** Truthy when the dashboard hook failed. Renders the recoverable error face. */
  error?: boolean;
  /** Retry handler — typically the hook's `refetch`. */
  onRetry?: () => void;
}

/** Shared header so loading / error / empty / content read identically. */
function InterestHeader() {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100/50">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center">
          <IconEye size={18} className="text-primary-600" />
        </div>
        <div>
          <h2 className="font-semibold text-warm-900 tracking-tight">Who&apos;s Looking at Your Players</h2>
          <p className="text-xs text-warm-500">Last 30 days</p>
        </div>
      </div>
      <Link
        href="/baseball/dashboard/college-interest"
        className="text-xs text-warm-500 hover:text-warm-900 flex items-center gap-1 transition-colors group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        Full Report
        <IconChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform motion-reduce:transition-none" />
      </Link>
    </div>
  );
}

function StatCard({
  value,
  label,
  change,
  icon: Icon,
}: {
  value: number;
  label: string;
  change?: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center gap-1 mb-1">
        <Icon size={14} className="text-warm-400" aria-hidden="true" />
      </div>
      <p className="text-2xl font-bold text-warm-900 tabular-nums">{value}</p>
      <p className="text-xs text-warm-500">{label}</p>
      {change !== undefined && change !== 0 && (
        <div className={`flex items-center justify-center gap-0.5 mt-1 text-xs ${
          change > 0 ? 'text-primary-600' : 'text-red-600'
        }`}>
          {change > 0
            ? <IconTrendingUp size={12} aria-hidden="true" />
            : <IconTrendingDown size={12} aria-hidden="true" />}
          <span>
            <span className="sr-only">{change > 0 ? 'up ' : 'down '}</span>
            {change > 0 ? '+' : ''}{change}%
          </span>
        </div>
      )}
    </div>
  );
}

function InterestRow({ item }: { item: CollegeInterestItem }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-warm-100 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-warm-100 flex items-center justify-center shrink-0">
        <IconBuilding size={14} className="text-warm-500" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-warm-900 truncate">{item.schoolName}</p>
          {item.isWatchlisted && (
            <Badge variant="success" className="text-eyebrow px-1.5 py-0">
              <IconStar size={8} className="mr-0.5" />
              Watchlist
            </Badge>
          )}
        </div>
        <p className="text-xs text-warm-500 truncate">
          → {item.playerName} ({item.viewCount} {item.viewCount === 1 ? 'view' : 'views'})
        </p>
      </div>
    </div>
  );
}

export function CollegeInterestSummary({ data, loading, error, onRetry }: CollegeInterestSummaryProps) {
  const prefersReducedMotion = useReducedMotion();

  if (loading) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <div className="px-6 py-4 border-b border-warm-100/50">
          <div className="flex items-center gap-3">
            <Skeleton variant="rectangular" width={36} height={36} className="rounded-lg" />
            <div>
              <Skeleton variant="text" width={200} height={18} className="mb-1" />
              <Skeleton variant="text" width={120} height={12} />
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-6 mb-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="text-center">
                <Skeleton variant="text" width={40} height={28} className="mx-auto mb-1" />
                <Skeleton variant="text" width={60} height={12} className="mx-auto" />
              </div>
            ))}
          </div>
          <Skeleton variant="text" width={100} height={14} className="mb-3" />
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-3 py-2">
                <Skeleton variant="rectangular" width={32} height={32} className="rounded-lg" />
                <div className="flex-1">
                  <Skeleton variant="text" width="60%" height={14} className="mb-1" />
                  <Skeleton variant="text" width="40%" height={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <InterestHeader />
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center justify-center py-10 px-6 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-3">
            <IconAlertCircle size={22} className="text-destructive" />
          </div>
          <h4 className="text-sm font-medium text-warm-900 mb-1">Couldn&apos;t load college interest</h4>
          <p className="text-xs text-warm-500 max-w-[240px] mb-3">
            This is usually temporary — your players&apos; data is safe. Try again in a moment.
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

  const hasInterest = data.totalProfileViews > 0 || data.topInterest.length > 0;

  return (
    <div className="relative glass-standard rounded-2xl overflow-clip">
      <ShineEffect />

      {/* Header */}
      <InterestHeader />

      <div className="p-6">
        {!hasInterest ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center mb-3">
              <IconEye size={20} className="text-warm-400" aria-hidden="true" />
            </div>
            <h4 className="text-sm font-medium text-warm-900 mb-1">No college interest yet</h4>
            <p className="text-xs text-warm-500 max-w-[240px]">
              When college coaches view your players&apos; profiles, you&apos;ll see the activity here.
            </p>
          </div>
        ) : (
          <>
            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-6 pb-6 border-b border-warm-100">
              <StatCard
                value={data.totalProfileViews}
                label="Profile Views"
                change={data.profileViewsChange}
                icon={IconEye}
              />
              <StatCard
                value={data.schoolsInterested}
                label="Schools"
                icon={IconBuilding}
              />
              <StatCard
                value={data.watchlistAdds}
                label="Watchlist Adds"
                icon={IconStar}
              />
            </div>

            {/* Top Interest */}
            {data.topInterest.length > 0 && (
              <div className="pt-4">
                <h4 className="text-eyebrow text-warm-500 uppercase mb-3">
                  Top Interest
                </h4>
                <LazyMotion features={domAnimation} strict>
                  <div>
                    {data.topInterest.map((item, idx) => (
                      <m.div
                        key={`${item.schoolName}-${item.playerId}-${idx}`}
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.28, delay: prefersReducedMotion ? 0 : idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <InterestRow item={item} />
                      </m.div>
                    ))}
                  </div>
                </LazyMotion>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
