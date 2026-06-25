'use client';

import Link from 'next/link';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { ShineEffect } from '@/components/ui/shine-effect';
import { Button } from '@/components/ui/button';
import {
  IconWarning,
  IconChevronRight,
  IconGraduationCap,
  IconTrendingDown,
  IconClock,
  IconVideo,
  IconCheck,
  IconAlertCircle,
  IconRefresh,
} from '@/components/icons';
import type { AttentionItem } from '@/app/baseball/actions/team-dashboard';

interface PlayersNeedingAttentionProps {
  data: AttentionItem[];
  loading?: boolean;
  /** Truthy when the dashboard hook failed. Renders the recoverable error face. */
  error?: boolean;
  /** Retry handler — typically the hook's `refetch`. */
  onRetry?: () => void;
}

/** Shared header so loading / error / empty / content read identically. */
function AttentionHeader({ totalCount }: { totalCount?: number }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-warm-100/50">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
          <IconWarning size={16} className="text-amber-600" />
        </div>
        <h3 className="font-semibold text-warm-900 tracking-tight">Needs Attention</h3>
      </div>
      {totalCount != null && totalCount > 0 && (
        <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full tabular-nums">
          {totalCount} total
        </span>
      )}
    </div>
  );
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
  // Folded onto amber (warning) — the daily home keeps a restricted accent set
  // (red / amber / primary-green / warm), matching the Signals + Command Center
  // surfaces, rather than a separate orange categorical hue.
  overdue_goals: {
    icon: IconClock,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
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
      className="flex items-center gap-3 p-3 rounded-xl border border-warm-100 bg-cream-50 hover:border-warm-200 hover:shadow-sm transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
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
        className="text-warm-300 group-hover:text-warm-500 group-hover:translate-x-0.5 transition-all motion-reduce:transition-none shrink-0"
      />
    </Link>
  );
}

export function PlayersNeedingAttention({ data, loading, error, onRetry }: PlayersNeedingAttentionProps) {
  const prefersReducedMotion = useReducedMotion();

  if (loading) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <AttentionHeader />
        <div className="p-4 space-y-3">
          {[0, 1, 2, 3].map(i => (
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

  if (error) {
    return (
      <div className="relative glass-standard rounded-2xl overflow-clip">
        <ShineEffect />
        <AttentionHeader />
        <div
          role="alert"
          aria-live="assertive"
          className="flex flex-col items-center justify-center py-10 px-4 text-center"
        >
          <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center mb-3">
            <IconAlertCircle size={22} className="text-destructive" />
          </div>
          <h4 className="text-sm font-medium text-warm-900 mb-1">Couldn&apos;t load alerts</h4>
          <p className="text-xs text-warm-500 max-w-[220px] mb-3">
            This is usually temporary — your roster is safe. Try again in a moment.
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

  const total = data.reduce((acc, item) => acc + item.count, 0);

  return (
    <div className="relative glass-standard rounded-2xl overflow-clip">
      <ShineEffect />
      <AttentionHeader totalCount={total} />

      <div className="p-4">
        {data.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mb-3">
              <IconCheck size={24} className="text-primary-600" />
            </div>
            <h4 className="text-sm font-medium text-warm-900 mb-1">All clear</h4>
            <p className="text-xs text-warm-500 max-w-[200px]">
              No players need immediate attention right now.
            </p>
          </div>
        ) : (
          <LazyMotion features={domAnimation} strict>
            <ul className="space-y-2">
              {data.map((item, index) => (
                <m.li
                  key={item.type}
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: prefersReducedMotion ? 0 : index * 0.05, ease: [0.22, 1, 0.36, 1] }}
                >
                  <AttentionCard item={item} />
                </m.li>
              ))}
            </ul>
          </LazyMotion>
        )}
      </div>
    </div>
  );
}
