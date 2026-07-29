'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  IconSend,
  IconCheckCircle2,
  IconEye,
  IconTarget as MousePointerClick,
  IconXCircle as Ban,
  IconShieldAlert as ShieldAlert,
  IconClock,
} from '@/components/icons';
import type { ResendActivityStats } from '@/app/golf/actions/resend-activity';
import { formatCount, formatRate } from './shared';

interface KPIGridProps {
  stats: ResendActivityStats | null;
  loading: boolean;
}

interface CardSpec {
  label: string;
  value: string;
  secondary?: string;
  icon: React.ReactNode;
  accent: 'neutral' | 'success' | 'info' | 'warning' | 'error';
  live?: boolean;
}

const ACCENT_CONFIG = {
  neutral: { icon: 'text-text-tertiary',    text: 'text-text-primary' },
  success: { icon: 'text-accent-700', text: 'text-text-primary' },
  info:    { icon: 'text-info',        text: 'text-text-primary' },
  warning: { icon: 'text-warning',     text: 'text-text-primary' },
  error:   { icon: 'text-destructive', text: 'text-text-primary' },
};

export function KPIGrid({ stats, loading }: KPIGridProps) {
  const prefersReducedMotion = useReducedMotion();
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-6 animate-pulse"
          >
            <div className="h-3 w-20 bg-surface-sunken rounded mb-3" />
            <div className="h-9 w-24 bg-surface-sunken rounded mb-2" />
            <div className="h-3 w-16 bg-surface-sunken rounded" />
          </div>
        ))}
      </div>
    );
  }

  const deliveryRate = formatRate(stats.delivered, stats.sent);
  const openRate     = formatRate(stats.opened,    stats.delivered);
  const clickRate    = formatRate(stats.clicked,   stats.delivered);
  const bounceRate   = formatRate(stats.bounced,   stats.sent);

  const cards: CardSpec[] = [
    {
      label: 'Total sent',
      value: formatCount(stats.sent),
      secondary: `${stats.total.toLocaleString()} tracked`,
      icon: <IconSend size={18} />,
      accent: 'neutral',
      live: true,
    },
    {
      label: 'Delivered',
      value: formatCount(stats.delivered),
      secondary: `${deliveryRate} delivery rate`,
      icon: <IconCheckCircle2 size={18} />,
      accent: 'success',
    },
    {
      label: 'Open rate',
      value: openRate,
      secondary: `${formatCount(stats.opened)} unique opens`,
      icon: <IconEye size={18} />,
      accent: 'info',
    },
    {
      label: 'Click rate',
      value: clickRate,
      secondary: `${formatCount(stats.clicked)} unique clicks`,
      icon: <MousePointerClick size={18} />,
      accent: 'info',
    },
    {
      label: 'Pending',
      value: formatCount(stats.pending),
      secondary: 'Sent, not yet delivered',
      icon: <IconClock size={18} />,
      accent: 'warning',
    },
    {
      label: 'Bounced',
      value: formatCount(stats.bounced),
      secondary: `${bounceRate} bounce rate`,
      icon: <Ban size={18} />,
      accent: stats.bounced > 0 ? 'error' : 'neutral',
    },
    {
      label: 'Complaints',
      value: formatCount(stats.complained),
      secondary: 'Marked as spam',
      icon: <ShieldAlert size={18} />,
      accent: stats.complained > 0 ? 'error' : 'neutral',
    },
    {
      label: 'Total opens',
      value: formatCount(stats.open_count),
      secondary: `${formatCount(stats.click_count)} total clicks`,
      icon: <IconEye size={18} />,
      accent: 'info',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => {
        const cfg = ACCENT_CONFIG[card.accent];
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ delay: i * 0.03, duration: 0.25 })}
            className={cn(
              'rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-6',
              'hover:bg-surface-tint hover:shadow-raise transition-all duration-200'
            )}
          >
            <div className="flex items-start justify-between mb-3">
              <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
                {card.label}
              </p>
              <div className={cn('p-1.5 rounded-fw-sm bg-surface', cfg.icon)}>
                {card.icon}
              </div>
            </div>

            <p className={cn('text-3xl font-bold tabular-nums tracking-tight', cfg.text)}>
              {card.value}
            </p>

            <div className="mt-2 flex items-center gap-2">
              {card.secondary && (
                <p className="text-xs text-text-tertiary truncate">{card.secondary}</p>
              )}
              {card.live && (
                <span className="inline-flex items-center gap-1 text-eyebrow font-semibold text-accent-700 uppercase tracking-wider">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-accent-500 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-500" />
                  </span>
                  Live
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DailyTrendChart — minimal inline chart of sends/delivers/opens by day
// ---------------------------------------------------------------------------
interface DailyTrendChartProps {
  data: ResendActivityStats['by_day'] | null;
}

export function DailyTrendChart({ data }: DailyTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-6">
        <p className="text-sm font-medium text-text-tertiary mb-1">Daily volume</p>
        <div className="h-48 flex items-center justify-center text-sm text-text-tertiary">
          No activity in this window.
        </div>
      </div>
    );
  }

  const maxSent = Math.max(...data.map((d) => d.sent), 1);

  return (
    <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <p className="text-sm font-semibold text-text-primary">Daily volume</p>
          <p className="text-xs text-text-tertiary mt-0.5">Sends, delivers, opens, and clicks per day</p>
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <LegendDot color="bg-text-tertiary"     label="Sent" />
          <LegendDot color="bg-accent-500" label="Delivered" />
          <LegendDot color="bg-text-tertiary"    label="Opened" />
          <LegendDot color="bg-accent-500"  label="Clicked" />
        </div>
      </div>

      <div className="flex items-end gap-1.5 h-48">
        {data.map((d) => {
          const sentH    = (d.sent / maxSent)    * 100;
          const delivH   = (d.delivered / maxSent) * 100;
          const openH    = (d.opened / maxSent)  * 100;
          const clickH   = (d.clicked / maxSent) * 100;
          return (
            <div key={d.day} className="flex-1 flex flex-col justify-end h-full relative group">
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                <div className="whitespace-nowrap bg-nav-bg text-nav-text text-eyebrow font-medium px-2 py-1 rounded shadow-soft">
                  <div className="font-semibold mb-0.5">
                    {new Date(d.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div>Sent: {d.sent}</div>
                  <div>Delivered: {d.delivered}</div>
                  <div>Opened: {d.opened}</div>
                  <div>Clicked: {d.clicked}</div>
                  {d.bounced > 0 && <div className="text-fw-danger/70">Bounced: {d.bounced}</div>}
                </div>
              </div>
              <div className="flex flex-col justify-end items-stretch gap-px h-full">
                <div
                  className="bg-border-strong rounded-t-fw-sm transition-all"
                  style={{ height: `${sentH}%` }}
                />
                <div
                  className="bg-accent-500"
                  style={{ height: `${delivH}%`, marginTop: `-${delivH}%` }}
                />
                <div
                  className="bg-text-tertiary"
                  style={{ height: `${openH}%`, marginTop: `-${openH}%` }}
                />
                <div
                  className="bg-accent-500 rounded-b-fw-sm"
                  style={{ height: `${clickH}%`, marginTop: `-${clickH}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex justify-between text-eyebrow text-text-tertiary">
        <span>
          {new Date(data[0]!.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
        <span>
          {new Date(data[data.length - 1]!.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-text-tertiary">
      <span className={cn('w-2 h-2 rounded-fw-sm', color)} />
      {label}
    </span>
  );
}
