'use client';

import { cn } from '@/lib/utils';
import {
  IconMail,
  IconCheckCircle2,
  IconEye,
  IconTarget as MousePointerClick,
  IconXCircle as Ban,
} from '@/components/icons';
import type { DeliverabilitySummary } from '@/app/golf/actions/crm-insights';

// ============================================================================
// DeliverabilityCards — top-row KPI grid for the Insights dashboard
// ============================================================================
// Mirrors the StatCard pattern in EmailTrackingView.tsx (same glass surface +
// icon-pill + tabular-nums numerals). Renders 5 cards: Sent / Delivered /
// Opened / Clicked / Bounced; rate subtitles when available.
// ============================================================================

interface DeliverabilityCardsProps {
  summary: DeliverabilitySummary | null;
  loading?: boolean;
}

function formatRate(rate: number | null): string {
  if (rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}

export function DeliverabilityCards({ summary, loading }: DeliverabilityCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-3 w-20 bg-warm-100 rounded animate-pulse" />
                <div className="h-7 w-16 bg-warm-100 rounded animate-pulse" />
              </div>
              <div className="w-10 h-10 rounded-full bg-warm-50 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const sent = summary?.total_sent ?? 0;
  const delivered = summary?.delivered ?? 0;
  const opened = summary?.opened ?? 0;
  const clicked = summary?.clicked ?? 0;
  const bounced = summary?.bounced ?? 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <KpiCard
        icon={<IconMail size={20} />}
        iconBg="bg-blue-100"
        iconColor="text-blue-600"
        label="Sent"
        value={sent.toLocaleString()}
      />
      <KpiCard
        icon={<IconCheckCircle2 size={20} />}
        iconBg="bg-emerald-100"
        iconColor="text-emerald-600"
        label="Delivered"
        value={delivered.toLocaleString()}
        subtitle={
          summary?.delivery_rate !== null && summary?.delivery_rate !== undefined
            ? `${formatRate(summary.delivery_rate)} delivery`
            : undefined
        }
      />
      <KpiCard
        icon={<IconEye size={20} />}
        iconBg="bg-violet-100"
        iconColor="text-violet-600"
        label="Opened"
        value={opened.toLocaleString()}
        subtitle={
          summary?.open_rate !== null && summary?.open_rate !== undefined
            ? `${formatRate(summary.open_rate)} open rate`
            : undefined
        }
      />
      <KpiCard
        icon={<MousePointerClick size={20} />}
        iconBg="bg-indigo-100"
        iconColor="text-indigo-600"
        label="Clicked"
        value={clicked.toLocaleString()}
        subtitle={
          summary?.click_rate !== null && summary?.click_rate !== undefined
            ? `${formatRate(summary.click_rate)} click rate`
            : undefined
        }
      />
      <KpiCard
        icon={<Ban size={20} />}
        iconBg="bg-red-100"
        iconColor="text-red-600"
        label="Bounced"
        value={bounced.toLocaleString()}
        subtitle={
          summary?.bounce_rate !== null && summary?.bounce_rate !== undefined
            ? `${formatRate(summary.bounce_rate)} bounce rate`
            : undefined
        }
        emphasis={bounced > 0 ? 'warn' : undefined}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// KpiCard — local subcomponent. Mirrors EmailTrackingView's StatCard styling.
// ----------------------------------------------------------------------------
function KpiCard({
  icon,
  iconBg,
  iconColor,
  label,
  value,
  subtitle,
  emphasis,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  subtitle?: string;
  emphasis?: 'warn';
}) {
  return (
    <div
      className={cn(
        'bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-5',
        'shadow-glass transition-[transform,box-shadow] duration-200 group',
        'hover:-translate-y-0.5 hover:shadow-lg',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-warm-500 uppercase tracking-wider">{label}</p>
          <p
            className={cn(
              'text-2xl font-bold tabular-nums tracking-tight mt-1',
              emphasis === 'warn' ? 'text-red-700' : 'text-warm-900',
            )}
          >
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-warm-400 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
            'transition-transform duration-200 group-hover:scale-105',
            iconBg,
            iconColor,
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
