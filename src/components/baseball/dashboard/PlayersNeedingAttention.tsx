'use client';

import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { ShineEffect } from '@/components/ui/shine-effect';
import {
  IconWarning,
  IconChevronRight,
  IconGraduationCap,
  IconTrendingDown,
  IconClock,
  IconVideo,
  IconCheck,
} from '@/components/icons';
import type { AttentionItem } from '@/app/baseball/actions/team-dashboard';

interface PlayersNeedingAttentionProps {
  data: AttentionItem[];
  loading?: boolean;
}

const typeConfig: Record<AttentionItem['type'], {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  bgColor: string;
  href: string;
}> = {
  academic_risk: {
    icon: IconGraduationCap,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    href: '/baseball/dashboard/academics',
  },
  declining_stats: {
    icon: IconTrendingDown,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    href: '/baseball/dashboard/roster',
  },
  overdue_goals: {
    icon: IconClock,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    href: '/baseball/dashboard/dev-plans',
  },
  no_video: {
    icon: IconVideo,
    color: 'text-warm-500',
    bgColor: 'bg-warm-100',
    href: '/baseball/dashboard/videos',
  },
};

const typeLabels: Record<AttentionItem['type'], string> = {
  academic_risk: 'Academic Risk',
  declining_stats: 'Declining Stats',
  overdue_goals: 'Overdue Goals',
  no_video: 'No Video',
};

function AttentionCard({ item }: { item: AttentionItem }) {
  const config = typeConfig[item.type];
  const Icon = config.icon;

  return (
    <Link 
      href={config.href}
      className="flex items-center gap-3 p-3 rounded-xl border border-warm-100 bg-white hover:border-warm-200 hover:shadow-sm transition-all group"
    >
      <div className={`w-10 h-10 rounded-lg ${config.bgColor} flex items-center justify-center shrink-0`}>
        <Icon size={18} className={config.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-warm-900">{typeLabels[item.type]}</p>
          <span className={`text-xs font-semibold ${config.color} tabular-nums`}>
            ({item.count})
          </span>
        </div>
        <p className="text-xs text-warm-500 truncate mt-0.5">{item.description}</p>
      </div>
      <IconChevronRight 
        size={16} 
        className="text-warm-300 group-hover:text-warm-500 transition-colors shrink-0" 
      />
    </Link>
  );
}

export function PlayersNeedingAttention({ data, loading }: PlayersNeedingAttentionProps) {
  if (loading) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <div className="px-5 py-4 border-b border-warm-100/50">
          <div className="flex items-center gap-2">
            <Skeleton variant="rectangular" width={20} height={20} className="rounded" />
            <Skeleton variant="text" width={120} height={18} />
          </div>
        </div>
        <div className="p-4 space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl border border-warm-100">
              <Skeleton variant="rectangular" width={40} height={40} className="rounded-lg" />
              <div className="flex-1">
                <Skeleton variant="text" width="50%" height={14} className="mb-2" />
                <Skeleton variant="text" width="70%" height={12} />
              </div>
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
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <IconWarning size={16} className="text-amber-600" />
          </div>
          <h3 className="font-semibold text-warm-900">Needs Attention</h3>
        </div>
        {data.length > 0 && (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
            {data.reduce((acc, item) => acc + item.count, 0)} total
          </span>
        )}
      </div>

      <div className="p-4">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mb-3">
              <IconCheck size={24} className="text-green-600" />
            </div>
            <h4 className="text-sm font-medium text-warm-900 mb-1">All clear!</h4>
            <p className="text-xs text-warm-500 max-w-[200px]">
              No players need immediate attention right now
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.map(item => (
              <AttentionCard key={item.type} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
