'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton-loader';
import { ShineEffect } from '@/components/ui/shine-effect';
import {
  IconEye,
  IconBuilding,
  IconStar,
  IconChevronRight,
  IconTrendingUp,
  IconTrendingDown,
} from '@/components/icons';
import type { CollegeInterestSummary as CollegeInterestData, CollegeInterestItem } from '@/app/baseball/actions/team-dashboard';

interface CollegeInterestSummaryProps {
  data: CollegeInterestData;
  loading?: boolean;
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
        <Icon size={14} className="text-warm-400" />
      </div>
      <p className="text-2xl font-bold text-warm-900 tabular-nums">{value}</p>
      <p className="text-xs text-warm-500">{label}</p>
      {change !== undefined && change !== 0 && (
        <div className={`flex items-center justify-center gap-0.5 mt-1 text-xs ${
          change > 0 ? 'text-green-600' : 'text-red-600'
        }`}>
          {change > 0 ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
          <span>{change > 0 ? '+' : ''}{change}%</span>
        </div>
      )}
    </div>
  );
}

function InterestRow({ item }: { item: CollegeInterestItem }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-warm-100 last:border-0">
      <div className="w-8 h-8 rounded-lg bg-warm-100 flex items-center justify-center shrink-0">
        <IconBuilding size={14} className="text-warm-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-warm-900 truncate">{item.schoolName}</p>
          {item.isWatchlisted && (
            <Badge variant="success" className="text-[10px] px-1.5 py-0">
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

export function CollegeInterestSummary({ data, loading }: CollegeInterestSummaryProps) {
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

  const hasInterest = data.totalProfileViews > 0 || data.topInterest.length > 0;

  return (
    <div className="relative glass-standard rounded-2xl overflow-clip">
      <ShineEffect />
      
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
            <IconEye size={18} className="text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-warm-900 tracking-tight">Who's Looking at Your Players</h2>
            <p className="text-xs text-warm-500">Last 30 days</p>
          </div>
        </div>
        <Link 
          href="/baseball/dashboard/college-interest" 
          className="text-xs text-warm-500 hover:text-warm-900 flex items-center gap-1 transition-colors group"
        >
          Full Report <IconChevronRight size={12} className="group-hover:tranwarm-x-0.5 transition-transform" />
        </Link>
      </div>

      <div className="p-6">
        {!hasInterest ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center mb-3">
              <IconEye size={20} className="text-warm-400" />
            </div>
            <h4 className="text-sm font-medium text-warm-900 mb-1">No college interest yet</h4>
            <p className="text-xs text-warm-500 max-w-[240px]">
              When college coaches view your players' profiles, you'll see the activity here
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
                <h4 className="text-xs font-medium text-warm-500 uppercase tracking-wide mb-3">
                  Top Interest
                </h4>
                <div>
                  {data.topInterest.map((item, idx) => (
                    <InterestRow key={`${item.schoolName}-${item.playerId}-${idx}`} item={item} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
