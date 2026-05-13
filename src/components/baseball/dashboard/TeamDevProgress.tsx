'use client';

import Link from 'next/link';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton-loader';
import { ShineEffect } from '@/components/ui/shine-effect';
import {
  IconNote,
  IconChevronRight,
  IconWarning,
} from '@/components/icons';
import type { DevPlanProgressItem } from '@/app/baseball/actions/team-dashboard';

interface TeamDevProgressProps {
  data: DevPlanProgressItem[];
  loading?: boolean;
}

function ProgressBar({ value, className }: { value: number; className?: string }) {
  const colorClass = value >= 75 
    ? 'bg-green-500' 
    : value >= 50 
      ? 'bg-amber-500' 
      : value >= 25 
        ? 'bg-orange-500' 
        : 'bg-red-500';

  return (
    <div className={`h-1.5 rounded-full bg-warm-200 overflow-hidden ${className}`}>
      <div 
        className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
        style={{ width: `${Math.min(value, 100)}%` }}
      />
    </div>
  );
}

function DevPlanCard({ item }: { item: DevPlanProgressItem }) {
  return (
    <Link 
      href={`/baseball/dashboard/dev-plans?player=${item.playerId}`}
      className="flex items-center gap-3 p-3 rounded-xl border border-warm-100 bg-white hover:border-warm-200 hover:shadow-sm transition-all group"
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
            <Badge variant="warning" className="text-[10px] px-1.5 py-0">
              <IconWarning size={10} className="mr-0.5" />
              Overdue
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <ProgressBar value={item.progressPct} className="flex-1 max-w-[100px]" />
          <span className="text-xs text-warm-500">
            {item.completedGoals}/{item.totalGoals} goals
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-semibold text-warm-900 tabular-nums">{item.progressPct}%</span>
        <IconChevronRight 
          size={16} 
          className="text-warm-300 group-hover:text-warm-500 transition-colors" 
        />
      </div>
    </Link>
  );
}

export function TeamDevProgress({ data, loading }: TeamDevProgressProps) {
  if (loading) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <div className="px-5 py-4 border-b border-warm-100/50">
          <div className="flex items-center gap-2">
            <Skeleton variant="rectangular" width={20} height={20} className="rounded" />
            <Skeleton variant="text" width={140} height={18} />
          </div>
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4].map(i => (
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

  return (
    <div className="relative glass-standard rounded-2xl overflow-clip">
      <ShineEffect />
      <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <IconNote size={16} className="text-blue-600" />
          </div>
          <h3 className="font-semibold text-warm-900">Dev Plan Progress</h3>
        </div>
        <Link 
          href="/baseball/dashboard/dev-plans" 
          className="text-xs text-warm-500 hover:text-warm-900 flex items-center gap-1 transition-colors group"
        >
          View all <IconChevronRight size={12} className="group-hover:tranwarm-x-0.5 transition-transform" />
        </Link>
      </div>

      <div className="p-4">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-warm-100 flex items-center justify-center mb-3">
              <IconNote size={20} className="text-warm-400" />
            </div>
            <h4 className="text-sm font-medium text-warm-900 mb-1">No active dev plans</h4>
            <p className="text-xs text-warm-500 max-w-[200px]">
              Create development plans to track player goals and progress
            </p>
            <Link href="/baseball/dashboard/dev-plans">
              <button className="mt-4 px-4 py-2 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors">
                Create Dev Plan →
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {data.slice(0, 5).map(item => (
              <DevPlanCard key={item.playerId} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
