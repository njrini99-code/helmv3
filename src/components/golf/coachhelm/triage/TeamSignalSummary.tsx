'use client';

/**
 * ============================================================================
 * TeamSignalSummary — the "Game pressure map"
 * ----------------------------------------------------------------------------
 * The whole open-signal queue at a glance, by area of the game: a radar of
 * where signals concentrate, the areas ranked (high-priority count, then
 * volume, then estimated strokes), and three roster counts. Full width on
 * Home; every ranked area opens The Lab filtered to that area.
 *
 * What it does NOT claim: recency. `signal.ageDays` comes from the insert
 * batch (`created_at`, frozen by upsert-by-signature), so a signal recomputed
 * today into an old row reads as old. No age bucket, no "fresh", no
 * "weighted by recency" (the old subtitle said so; nothing ever was).
 *
 * Roster roll-ups (`team_synthesis`) are excluded from every aggregate: they
 * are sums of the per-player signals in the same list, so counting them again
 * would double the strokes and inflate the count.
 * ========================================================================== */

import { useId } from 'react';
import Link from 'next/link';
import { ChevronRight, ShieldAlert, Target, Users, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { formatCategoryLabel } from './buildTriageViewModel';

export interface TeamSignalSummaryProps {
  groups: readonly SignalGroup[];
  /** Where a ranked area links: The Lab, filtered to that category. */
  categoryHref: (category: string) => string;
  /** Plain primary click on a ranked area: switch views in place. */
  onOpenCategory: (category: string) => void;
}

interface CategoryPressure {
  category: string;
  count: number;
  highPriority: number;
  impact: number;
}

const ONE_DECIMAL = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function buildCategoryPressure(signals: readonly GroupedSignal[]): CategoryPressure[] {
  const byCategory = new Map<string, CategoryPressure>();
  for (const signal of signals) {
    const current = byCategory.get(signal.category) ?? {
      category: signal.category,
      count: 0,
      highPriority: 0,
      impact: 0,
    };
    current.count += 1;
    if (signal.severity === 'urgent' || signal.severity === 'high') current.highPriority += 1;
    current.impact += Math.abs(signal.strokeImpact ?? 0);
    byCategory.set(signal.category, current);
  }
  return [...byCategory.values()].sort(
    (a, b) => b.highPriority - a.highPriority || b.count - a.count || b.impact - a.impact,
  );
}

export function TeamSignalSummary({ groups, categoryHref, onOpenCategory }: TeamSignalSummaryProps) {
  const signals = groups
    .flatMap((group) => group.signals)
    .filter((signal) => signal.kind !== 'team_synthesis');
  if (signals.length === 0) return null;

  const allPressure = buildCategoryPressure(signals);
  const categoryPressure = allPressure.slice(0, 6);
  const hiddenAreas = allPressure.length - categoryPressure.length;
  const highPriority = signals.filter((s) => s.severity === 'urgent' || s.severity === 'high').length;
  const playersFlagged = groups.filter((group) => group.playerId !== null && group.signals.length > 0).length;
  const materialSignals = signals.filter((signal) => signal.strokeImpact != null);
  const estimatedImpact = materialSignals.reduce((sum, signal) => sum + Math.abs(signal.strokeImpact ?? 0), 0);
  const maxCount = Math.max(1, ...categoryPressure.map((entry) => entry.count));

  return (
    <section
      aria-labelledby="pressure-map-heading"
      className="flex flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft [container-type:inline-size]"
    >
      <div className="fw-plinth-green flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
        <h2 id="pressure-map-heading" className="font-fw-sans text-h3 font-semibold text-text-primary">
          Game pressure map
        </h2>
        <div className="flex items-center gap-2 font-fw-sans text-caption tabular-nums text-text-secondary">
          <span className="rounded-full border border-border-subtle px-2.5 py-1">{signals.length} live</span>
          {materialSignals.length > 0 ? (
            <span className="rounded-full border border-border-subtle px-2.5 py-1">
              {ONE_DECIMAL.format(estimatedImpact)} est. strokes
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 [@container(min-width:760px)]:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] [@container(min-width:760px)]:divide-x [@container(min-width:760px)]:divide-border-subtle">
        <div className="flex flex-col gap-2 border-b border-border-subtle p-4 sm:p-5 [@container(min-width:760px)]:border-b-0">
          <p className="font-fw-sans text-body-sm text-text-secondary">
            Open signals by area of the game. Amber points carry high-priority signals.
          </p>
          <div className="relative mx-auto aspect-[280/250] w-full max-w-[22rem]">
            <PressureRadar categories={categoryPressure} total={signals.length} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-2 p-4 sm:p-5">
          <p className="font-fw-sans text-body-sm text-text-secondary">
            Ranked by high-priority signals, then volume. Open an area to work its queue in The Lab.
          </p>
          <ol className="grid grid-cols-1 gap-x-6 [@container(min-width:1080px)]:grid-cols-2">
            {categoryPressure.map((entry, index) => (
              <li key={entry.category} className="border-b border-border-subtle last:border-b-0 [@container(min-width:1080px)]:[&:nth-last-child(2):nth-child(odd)]:border-b-0">
                <Link
                  href={categoryHref(entry.category)}
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
                    ) {
                      return;
                    }
                    event.preventDefault();
                    onOpenCategory(entry.category);
                  }}
                  className={cn(
                    'group -mx-2 flex min-h-[56px] items-center gap-3 rounded-fw-md px-2 py-3 outline-none',
                    'transition-[background-color] [transition-duration:var(--fw-dur-fast)] hover:bg-surface-sunken',
                    'focus-visible:ring-2 focus-visible:ring-border-focus',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-sunken font-fw-sans text-caption font-semibold tabular-nums text-text-secondary"
                  >
                    {index + 1}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-fw-sans text-body-sm font-semibold text-text-primary">
                        {formatCategoryLabel(entry.category)}
                      </span>
                      <span className="shrink-0 font-fw-sans text-body-sm tabular-nums text-text-secondary">
                        <span className="font-semibold text-text-primary">{entry.count}</span>
                        {' '}
                        {entry.count === 1 ? 'signal' : 'signals'}
                      </span>
                    </span>
                    <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                      <span
                        className={cn(
                          'block h-full rounded-full',
                          entry.highPriority > 0 ? 'bg-fw-warning' : 'bg-border-strong',
                        )}
                        style={{ width: `${Math.max(8, (entry.count / maxCount) * 100)}%` }}
                      />
                    </span>
                    <span className="flex flex-wrap gap-x-3 font-fw-sans text-caption tabular-nums text-text-tertiary">
                      {entry.highPriority > 0 ? (
                        <span className="font-medium text-fw-warning-ink">{entry.highPriority} high priority</span>
                      ) : (
                        <span>No high priority</span>
                      )}
                      {entry.impact > 0 ? <span>&asymp;{ONE_DECIMAL.format(entry.impact)} strokes</span> : null}
                    </span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-text-tertiary transition-transform [transition-duration:var(--fw-dur-fast)] group-hover:translate-x-0.5 motion-reduce:transition-none"
                  />
                </Link>
              </li>
            ))}
          </ol>
          {hiddenAreas > 0 ? (
            <p className="font-fw-sans text-caption tabular-nums text-text-tertiary">
              +{hiddenAreas} more {hiddenAreas === 1 ? 'area' : 'areas'} in The Lab
            </p>
          ) : null}
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-border-subtle border-t border-border-subtle">
        <SummaryMetric icon={ShieldAlert} label="High priority" value={highPriority} />
        <SummaryMetric icon={Users} label="Players flagged" value={playersFlagged} />
        <SummaryMetric icon={Target} label="Game categories" value={allPressure.length} />
      </dl>
    </section>
  );
}

function PressureRadar({ categories, total }: { categories: readonly CategoryPressure[]; total: number }) {
  // Unique per instance: two radars on one page shared one pattern id (QA-R7).
  const gridId = useId();
  const chartCategories =
    categories.length >= 3
      ? categories
      : [
          ...categories,
          ...Array.from({ length: 3 - categories.length }, (_, index) => ({
            category: `awaiting_${index}`,
            count: 0,
            highPriority: 0,
            impact: 0,
          })),
        ];
  const centerX = 140;
  const centerY = 122;
  const radius = 76;
  const maxCount = Math.max(1, ...chartCategories.map((entry) => entry.count));
  const ringPoints = (scale: number) =>
    chartCategories
      .map((_, index) => polarPoint(index, chartCategories.length, centerX, centerY, radius * scale))
      .map((point) => `${point.x},${point.y}`)
      .join(' ');
  const dataPoints = chartCategories.map((entry, index) =>
    polarPoint(
      index,
      chartCategories.length,
      centerX,
      centerY,
      radius * (entry.count === 0 ? 0.08 : 0.28 + (entry.count / maxCount) * 0.72),
    ),
  );

  return (
    <svg
      viewBox="0 0 280 250"
      role="img"
      aria-label={`Radar of ${total} open signals across ${categories.length} ${categories.length === 1 ? 'area' : 'areas'}`}
      className="absolute inset-0 h-full w-full overflow-visible"
    >
      <defs>
        <pattern id={gridId} width="18" height="18" patternUnits="userSpaceOnUse">
          <path d="M 18 0 L 0 0 0 18" fill="none" className="stroke-border-subtle" strokeWidth="0.45" opacity="0.5" />
        </pattern>
      </defs>
      <rect width="280" height="250" fill={`url(#${gridId})`} />
      {[1, 0.72, 0.44].map((scale) => (
        <polygon key={scale} points={ringPoints(scale)} fill="none" className="stroke-border-subtle" strokeWidth="1" />
      ))}
      {chartCategories.map((_, index) => {
        const end = polarPoint(index, chartCategories.length, centerX, centerY, radius);
        return (
          <line key={index} x1={centerX} y1={centerY} x2={end.x} y2={end.y} className="stroke-border-subtle" strokeWidth="1" />
        );
      })}
      <polygon
        points={dataPoints.map((point) => `${point.x},${point.y}`).join(' ')}
        className="fill-text-primary stroke-text-primary"
        fillOpacity="0.07"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      {dataPoints.map((point, index) => {
        const entry = chartCategories[index];
        return (
          <circle
            key={entry?.category ?? index}
            cx={point.x}
            cy={point.y}
            r={entry?.count ? 4.5 : 2}
            className={cn('stroke-surface', entry?.highPriority ? 'fill-fw-warning' : 'fill-text-secondary')}
            strokeWidth="2"
          />
        );
      })}
      <circle cx={centerX} cy={centerY} r="27" className="fill-surface stroke-border-subtle" strokeWidth="1" />
      <text
        x={centerX}
        y={centerY - 1}
        textAnchor="middle"
        className="fill-text-primary font-fw-sans"
        style={{ fontVariantNumeric: 'tabular-nums' }}
        fontSize="18"
        fontWeight="700"
      >
        {total}
      </text>
      <text x={centerX} y={centerY + 13} textAnchor="middle" className="fill-text-tertiary font-fw-sans" fontSize="8" letterSpacing="1.1">
        OPEN
      </text>
      {categories.map((entry, index) => {
        const label = polarPoint(index, chartCategories.length, centerX, centerY, radius + 24);
        const anchor = label.x < centerX - 8 ? 'end' : label.x > centerX + 8 ? 'start' : 'middle';
        return (
          <text
            key={entry.category}
            x={label.x}
            y={label.y}
            textAnchor={anchor}
            dominantBaseline="middle"
            className="fill-text-secondary font-fw-sans"
            fontSize="9"
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
    x: Math.round((centerX + Math.cos(angle) * radius) * 100) / 100,
    y: Math.round((centerY + Math.sin(angle) * radius) * 100) / 100,
  };
}

function shortCategoryLabel(category: string) {
  if (category === 'course_management') return 'Course Mgmt';
  const label = formatCategoryLabel(category);
  return label.length > 15 ? `${label.slice(0, 13)}…` : label;
}

function SummaryMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-3 py-4 sm:px-5">
      <dt className="flex items-center gap-1.5 font-fw-sans text-caption text-text-tertiary">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="font-fw-display text-h2 font-semibold tabular-nums tracking-[-0.02em] text-text-primary">{value}</dd>
    </div>
  );
}
