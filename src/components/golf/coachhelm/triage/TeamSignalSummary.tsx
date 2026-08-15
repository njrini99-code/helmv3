'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  Clock3,
  ShieldAlert,
  Target,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { Badge, Eyebrow, Surface } from '@/components/fairway';
import { cn } from '@/lib/utils';
import type { GroupedSignal, SignalGroup, SignalSeverity } from '@/lib/coachhelm/signal-grouping';
import { formatCategoryLabel } from './buildTriageViewModel';

export interface TeamSignalSummaryProps {
  groups: readonly SignalGroup[];
  playerHref: (playerId: string) => string;
  onOpenPlayer: (playerId: string) => void;
}

interface CategoryPressure {
  category: string;
  count: number;
  highPriority: number;
  fresh: number;
  impact: number;
}

const SEVERITY_ORDER: readonly SignalSeverity[] = ['urgent', 'high', 'medium', 'low'];
const SEVERITY_LABELS: Record<SignalSeverity, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Watch',
};
const SEVERITY_BAR_CLASS: Record<SignalSeverity, string> = {
  urgent: 'bg-[var(--fw-color-danger)]',
  high: 'bg-[var(--fw-color-warning)]',
  medium: 'bg-accent-500',
  low: 'bg-accent-200',
};

export function TeamSignalSummary({ groups, playerHref, onOpenPlayer }: TeamSignalSummaryProps) {
  const signals = groups.flatMap((group) => group.signals);
  if (signals.length === 0) return null;

  const categoryPressure = buildCategoryPressure(signals).slice(0, 6);
  const priorityPlayers = groups.filter((group) => group.playerId !== null).slice(0, 4);
  const severityCounts = Object.fromEntries(
    SEVERITY_ORDER.map((severity) => [
      severity,
      signals.filter((signal) => signal.severity === severity).length,
    ]),
  ) as Record<SignalSeverity, number>;
  const ageBands = [
    { label: '0–7d', count: signals.filter((signal) => signal.ageDays <= 7).length },
    { label: '8–14d', count: signals.filter((signal) => signal.ageDays > 7 && signal.ageDays <= 14).length },
    { label: '15–30d', count: signals.filter((signal) => signal.ageDays > 14 && signal.ageDays <= 30).length },
    { label: '30d+', count: signals.filter((signal) => signal.ageDays > 30).length },
  ];
  const maxAgeBand = Math.max(1, ...ageBands.map((band) => band.count));
  const materialSignals = signals.filter((signal) => signal.strokeImpact != null);
  const estimatedImpact = materialSignals.reduce((sum, signal) => sum + Math.abs(signal.strokeImpact ?? 0), 0);

  return (
    <section aria-label="Team intelligence summary" className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
      <Surface elevation="shadow" padding="none" className="overflow-clip">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
          <div>
            <Eyebrow as="h2" tone="accent">Game pressure map</Eyebrow>
            <p className="mt-1 max-w-xl text-body-sm text-text-secondary">
              Where repeatable evidence is concentrating across the team — weighted by volume, severity, and recency.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="accent" size="sm" numeric>{signals.length} live</Badge>
            {materialSignals.length > 0 ? (
              <Badge tone="neutral" size="sm" numeric>{estimatedImpact.toFixed(1)} est. strokes</Badge>
            ) : null}
          </div>
        </div>

        <div className="grid items-stretch lg:grid-cols-[minmax(270px,0.9fr)_minmax(300px,1.1fr)]">
          <div className="relative min-h-[280px] overflow-hidden border-b border-border-subtle bg-surface-sunken/45 lg:border-b-0 lg:border-r">
            <PressureRadar categories={categoryPressure} total={signals.length} />
          </div>

          <div className="grid content-center gap-3 p-4 sm:p-5">
            {categoryPressure.map((entry, index) => {
              const maxCount = Math.max(1, ...categoryPressure.map((candidate) => candidate.count));
              return (
                <div
                  key={entry.category}
                  className="group rounded-fw-md border border-border-subtle bg-surface-raised px-3 py-3 transition-[border-color,box-shadow] hover:border-accent-200 hover:[box-shadow:var(--fw-shadow-soft)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-fw-mono text-eyebrow tabular-nums text-text-tertiary">{String(index + 1).padStart(2, '0')}</span>
                        <p className="truncate text-body-sm font-semibold text-text-primary">{formatCategoryLabel(entry.category)}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-tertiary">
                        <span>{entry.fresh} fresh</span>
                        <span>{entry.highPriority} high priority</span>
                        {entry.impact > 0 ? <span>{entry.impact.toFixed(1)} strokes</span> : null}
                      </div>
                    </div>
                    <span className="font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">{entry.count}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-clip rounded-full bg-surface-sunken">
                    <span
                      className={cn(
                        'block h-full rounded-full transition-[width] [transition-duration:var(--fw-dur-medium)]',
                        entry.highPriority > 0 ? 'bg-[var(--fw-color-warning)]' : 'bg-accent-500',
                      )}
                      style={{ width: `${Math.max(8, (entry.count / maxCount) * 100)}%`, opacity: 1 - index * 0.07 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-border-subtle border-t border-border-subtle sm:grid-cols-4 sm:divide-y-0">
          <SummaryMetric icon={ShieldAlert} label="High priority" value={String(severityCounts.urgent + severityCounts.high)} />
          <SummaryMetric icon={Users} label="Players flagged" value={String(groups.filter((group) => group.playerId !== null).length)} />
          <SummaryMetric icon={Target} label="Game categories" value={String(categoryPressure.length)} />
          <SummaryMetric icon={Activity} label="New this week" value={String(ageBands[0]?.count ?? 0)} />
        </div>
      </Surface>

      <div className="grid gap-4">
        <Surface elevation="border" padding="md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Eyebrow as="h2">Priority roster</Eyebrow>
              <p className="mt-1 text-caption text-text-tertiary">Open a player to turn evidence into a tracked focus.</p>
            </div>
            <Users className="h-4 w-4 text-accent-700" aria-hidden />
          </div>
          <div className="mt-4 grid gap-2.5">
            {priorityPlayers.map((group, index) => {
              const playerId = group.playerId;
              if (!playerId) return null;
              return (
                <Link
                  key={playerId}
                  href={playerHref(playerId)}
                  replace
                  scroll={false}
                  onClick={(event) => {
                    if (
                      event.defaultPrevented ||
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    ) return;
                    event.preventDefault();
                    onOpenPlayer(playerId);
                  }}
                  className="group flex min-h-14 items-center gap-3 rounded-fw-md border border-border-subtle bg-surface-raised px-3 py-3 outline-none transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-accent-200 hover:[box-shadow:var(--fw-shadow-soft)] focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-50 font-fw-mono text-caption font-semibold text-fw-success-ink">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-semibold text-text-primary">{group.playerName}</p>
                    <p className="truncate text-caption text-text-tertiary">
                      {group.signals.length} signal{group.signals.length === 1 ? '' : 's'} · {formatCategoryLabel(group.signals[0]?.category ?? 'general')}
                    </p>
                  </div>
                  <span className="font-fw-mono text-caption tabular-nums text-text-secondary">{group.attentionScore}</span>
                  <ArrowRight className="h-4 w-4 text-text-tertiary transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              );
            })}
          </div>
        </Surface>

        <Surface elevation="shadow" padding="md">
          <div className="flex items-center justify-between gap-3">
            <div>
              <Eyebrow as="h2">Signal velocity</Eyebrow>
              <p className="mt-1 text-caption text-text-tertiary">Age of the evidence still in the queue.</p>
            </div>
            <Clock3 className="h-4 w-4 text-accent-700" aria-hidden />
          </div>
          <div className="mt-5 flex h-24 items-end gap-3 border-b border-border-subtle px-1">
            {ageBands.map((band, index) => (
              <div key={band.label} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2 self-stretch">
                <span className="font-fw-mono text-caption font-semibold tabular-nums text-text-primary">{band.count}</span>
                <span
                  className={cn('w-full max-w-12 rounded-t-fw-sm', index === 0 ? 'bg-accent-500' : 'bg-accent-200')}
                  style={{ height: `${Math.max(5, (band.count / maxAgeBand) * 58)}px`, opacity: 1 - index * 0.13 }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-4 gap-3 text-center font-fw-mono text-eyebrow text-text-tertiary">
            {ageBands.map((band) => <span key={band.label}>{band.label}</span>)}
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-caption font-medium text-text-primary">Severity mix</span>
              <span className="font-fw-mono text-eyebrow tabular-nums text-text-tertiary">{signals.length} total</span>
            </div>
            <div className="flex h-2.5 overflow-clip rounded-full bg-surface-sunken" aria-label="Severity distribution">
              {SEVERITY_ORDER.map((severity) => severityCounts[severity] > 0 ? (
                <span
                  key={severity}
                  className={SEVERITY_BAR_CLASS[severity]}
                  style={{ width: `${(severityCounts[severity] / signals.length) * 100}%` }}
                  title={`${SEVERITY_LABELS[severity]}: ${severityCounts[severity]}`}
                />
              ) : null)}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
              {SEVERITY_ORDER.map((severity) => (
                <span key={severity} className="inline-flex items-center gap-1.5 text-caption text-text-tertiary">
                  <span className={cn('h-2 w-2 rounded-full', SEVERITY_BAR_CLASS[severity])} />
                  {SEVERITY_LABELS[severity]} <span className="font-fw-mono tabular-nums text-text-primary">{severityCounts[severity]}</span>
                </span>
              ))}
            </div>
          </div>
        </Surface>
      </div>
    </section>
  );
}

function buildCategoryPressure(signals: readonly GroupedSignal[]): CategoryPressure[] {
  const byCategory = new Map<string, CategoryPressure>();
  for (const signal of signals) {
    const current = byCategory.get(signal.category) ?? {
      category: signal.category,
      count: 0,
      highPriority: 0,
      fresh: 0,
      impact: 0,
    };
    current.count += 1;
    if (signal.severity === 'urgent' || signal.severity === 'high') current.highPriority += 1;
    if (signal.ageDays <= 7) current.fresh += 1;
    current.impact += Math.abs(signal.strokeImpact ?? 0);
    byCategory.set(signal.category, current);
  }
  return [...byCategory.values()].sort(
    (a, b) => b.highPriority - a.highPriority || b.count - a.count || b.impact - a.impact,
  );
}

function PressureRadar({ categories, total }: { categories: readonly CategoryPressure[]; total: number }) {
  const chartCategories = categories.length >= 3 ? categories : [
    ...categories,
    ...Array.from({ length: 3 - categories.length }, (_, index) => ({
      category: `awaiting_${index}`,
      count: 0,
      highPriority: 0,
      fresh: 0,
      impact: 0,
    })),
  ];
  const centerX = 140;
  const centerY = 118;
  const radius = 72;
  const maxCount = Math.max(1, ...chartCategories.map((entry) => entry.count));
  const ringPoints = (scale: number) => chartCategories
    .map((_, index) => polarPoint(index, chartCategories.length, centerX, centerY, radius * scale))
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
  const dataPoints = chartCategories
    .map((entry, index) => polarPoint(
      index,
      chartCategories.length,
      centerX,
      centerY,
      radius * (entry.count === 0 ? 0.08 : 0.28 + (entry.count / maxCount) * 0.72),
    ));

  return (
    <svg
      viewBox="0 0 280 260"
      role="img"
      aria-label={`Game pressure map showing ${total} open signals across ${categories.length} categories`}
      className="absolute inset-0 h-full w-full"
    >
      <defs>
        <pattern id="coachhelm-pressure-grid" width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M 18 0 L 0 0 0 18" fill="none" className="stroke-border-subtle" strokeWidth="0.45" opacity="0.55" />
        </pattern>
      </defs>
      <rect width="280" height="260" fill="url(#coachhelm-pressure-grid)" />
      {[1, 0.72, 0.44].map((scale) => (
        <polygon key={scale} points={ringPoints(scale)} fill="none" className="stroke-border-subtle" strokeWidth="1" />
      ))}
      {chartCategories.map((_, index) => {
        const end = polarPoint(index, chartCategories.length, centerX, centerY, radius);
        return <line key={index} x1={centerX} y1={centerY} x2={end.x} y2={end.y} className="stroke-border-subtle" strokeWidth="1" />;
      })}
      <polygon
        points={dataPoints.map((point) => `${point.x},${point.y}`).join(' ')}
        style={{
          fill: 'color-mix(in oklch, var(--fw-color-accent-500) 18%, transparent)',
          stroke: 'var(--fw-color-accent-600)',
        }}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {dataPoints.map((point, index) => (
        <circle
          key={chartCategories[index]?.category ?? index}
          cx={point.x}
          cy={point.y}
          r={chartCategories[index]?.count ? 4.5 : 2}
          className={chartCategories[index]?.highPriority ? 'fill-[var(--fw-color-warning)] stroke-surface' : 'fill-accent-600 stroke-surface'}
          strokeWidth="2"
        />
      ))}
      <circle cx={centerX} cy={centerY} r="27" className="fill-surface stroke-border-subtle" strokeWidth="1" />
      <text x={centerX} y={centerY - 1} textAnchor="middle" className="fill-text-primary font-fw-mono" fontSize="18" fontWeight="700">{total}</text>
      <text x={centerX} y={centerY + 13} textAnchor="middle" className="fill-text-tertiary font-fw-sans" fontSize="8" letterSpacing="1.1">OPEN</text>
      {categories.map((entry, index) => {
        const label = polarPoint(index, chartCategories.length, centerX, centerY, radius + 27);
        const anchor = label.x < centerX - 8 ? 'end' : label.x > centerX + 8 ? 'start' : 'middle';
        return (
          <text
            key={entry.category}
            x={label.x}
            y={label.y}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="fill-text-secondary font-fw-sans"
            fontSize="8.5"
            fontWeight="600"
          >
            {shortCategoryLabel(entry.category)}
          </text>
        );
      })}
    </svg>
  );
}

function polarPoint(index: number, total: number, centerX: number, centerY: number, radius: number) {
  const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
  return {
    x: Number((centerX + Math.cos(angle) * radius).toFixed(2)),
    y: Number((centerY + Math.sin(angle) * radius).toFixed(2)),
  };
}

function shortCategoryLabel(category: string) {
  if (category === 'course_management') return 'Course Mgmt';
  const label = formatCategoryLabel(category);
  return label.length > 15 ? `${label.slice(0, 13)}…` : label;
}

function SummaryMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-4">
      <Icon className="mb-2 h-3.5 w-3.5 text-accent-700" aria-hidden />
      <p className="font-fw-mono text-h3 font-semibold tabular-nums text-text-primary">{value}</p>
      <p className="mt-1 truncate text-eyebrow uppercase tracking-wide text-text-tertiary">{label}</p>
    </div>
  );
}
