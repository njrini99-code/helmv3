'use client';

/**
 * FingerprintHero — top-of-page header for the coach scouting report.
 *
 * Renders:
 *   - Player name (Fraunces, large)
 *   - Team name (small)
 *   - Composite rating big number (Fraunces) + trend arrow
 *   - Action buttons: Print · Discuss in messages · Assign focus area
 *
 * Fraunces is applied surgically to the name + rating numeral only — the
 * rest of the page (and every body-copy slot) stays on the system/sans
 * stack per Rule 9 of the design contract.
 *
 * Also exports `SectionBand`, the shared chrome every other section renders
 * inside of. Co-located here because Wave 2's file-ownership contract locks
 * me to the 8 sections/*.tsx files — no room for a `_shared.tsx`.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import {
  IconMessage,
  IconTarget,
  IconTrendingUp,
} from '@/components/icons';
import {
  InsightCard,
  type InsightAction,
} from '@/components/golf/coachhelm/insight-card';
import type {
  FingerprintMetric,
  SectionData,
} from '@/app/golf/actions/player-fingerprint';
import type { PlayerFingerprint } from '@/app/golf/actions/player-fingerprint';
import { Button } from '@/components/ui/button';

export interface FingerprintHeroProps {
  player: PlayerFingerprint['player'];
  composite: PlayerFingerprint['composite'];
}

export function FingerprintHero({ player, composite }: FingerprintHeroProps) {
  const router = useRouter();
  const [printing, setPrinting] = useState(false);

  const fullName =
    `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'Player';

  const handlePrint = () => {
    setPrinting(true);
    router.push(`/golf/dashboard/players/${player.id}/game/print`);
  };

  const trendCopy =
    composite.trend === 'up'
      ? 'Trending better'
      : composite.trend === 'down'
        ? 'Trending worse'
        : 'Steady';
  const trendTone =
    composite.trend === 'up'
      ? 'text-primary-600'
      : composite.trend === 'down'
        ? 'text-red-500'
        : 'text-warm-500';

  return (
    <Card variant="overlay"
      padding="none"
      hover={false}
      className="relative overflow-hidden"
      data-testid="fingerprint-hero"
    >
      <div className="p-6 md:p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          {/* Identity */}
          <div className="flex-1 min-w-0">
            <p className="text-eyebrow uppercase tracking-[0.14em] text-warm-500 font-medium">
              Game Fingerprint
            </p>
            <h1
              data-testid="fingerprint-hero-name"
              className="text-3xl md:text-4xl font-medium text-warm-900 leading-tight mt-1"
            >
              {fullName}
            </h1>
            <p className="text-sm text-warm-500 mt-1.5">
              {player.team_name ?? 'No team assigned'}
              {composite.rounds_in_calculation > 0 && (
                <>
                  {' · '}
                  {composite.rounds_in_calculation} rd basis
                </>
              )}
            </p>
          </div>

          {/* Composite rating */}
          <div className="flex-shrink-0 flex items-end gap-4">
            <div className="text-right">
              <div
                data-testid="fingerprint-composite-rating"
                className={cn(
                  'leading-none tabular-nums font-medium',
                  'text-5xl md:text-6xl',
                  ratingColor(composite.rating),
                )}
              >
                {composite.rating != null ? composite.rating : '--'}
              </div>
              <div className="text-eyebrow uppercase tracking-[0.14em] text-warm-500 font-medium mt-1">
                Composite
              </div>
              <div
                className={cn(
                  'inline-flex items-center gap-1 text-xs font-medium mt-2',
                  trendTone,
                )}
                data-testid="fingerprint-composite-trend"
                data-trend={composite.trend}
              >
                <IconTrendingUp
                  size={12}
                  className={composite.trend === 'down' ? 'rotate-180' : ''}
                />
                {trendCopy}
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2 mt-6 non-print">
          <Button variant="primary"
            type="button"
            onClick={handlePrint}
            disabled={printing}
            data-testid="fingerprint-print-button"
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium',
              'bg-warm-900 text-white hover:bg-warm-800 active:scale-[0.98] transition-all',
              printing && 'opacity-60 pointer-events-none',
            )}
          >
            <PrinterIcon size={16} />
            {printing ? 'Opening...' : 'Print scouting report'}
          </Button>

          <Link
            href={`/golf/dashboard/messages?player=${player.id}`}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium',
              'bg-cream-50 border border-warm-200 text-warm-700 hover:bg-warm-50 hover:border-warm-300',
              'active:scale-[0.98] transition-all',
            )}
            data-testid="fingerprint-discuss-link"
          >
            <IconMessage size={16} />
            Discuss in messages
          </Link>

          <Link
            // Canonical destination directly, not the /development redirect
            // shim (React #310 legacy-link audit, 2026-07-22).
            href={`/golf/dashboard/intelligence?view=players&player=${player.id}`}
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium',
              'bg-cream-50 border border-warm-200 text-warm-700 hover:bg-warm-50 hover:border-warm-300',
              'active:scale-[0.98] transition-all',
            )}
            data-testid="fingerprint-focus-area-link"
          >
            <IconTarget size={16} />
            Assign focus area
          </Link>
        </div>
      </div>
    </Card>
  );
}

function ratingColor(rating: number | null): string {
  if (rating == null) return 'text-warm-400';
  // Deeper primary tint than the 60-79 tier (not a second green hue) — keeps
  // the top tier visually distinct while staying in the primary family.
  if (rating >= 80) return 'text-primary-800';
  if (rating >= 60) return 'text-primary-600';
  if (rating >= 40) return 'text-amber-600';
  return 'text-red-500';
}

// ---------------------------------------------------------------------------
// Shared section chrome — used by every non-hero section.
// ---------------------------------------------------------------------------

export interface SectionBandProps {
  section: SectionData;
  /** Numeral-ish overline (e.g. "01 · From the tee"). Most sections don't
   *  bother; a few highlight the band with a supplementary overline. */
  overline?: string;
  /** The chart slot on the left side of the band (or full-width on mobile).
   *  Sections pass their own compact visualization here. */
  chart?: ReactNode;
  /** Called when an InsightCard fires an action. */
  onAction?: (action: InsightAction, insightId: string) => void;
}

/**
 * Render a single horizontal band for one category. Chart-left, insights-
 * right on desktop; stacked on mobile. Empty sections render the
 * "Not enough data" fallback in-slot so the layout never shifts.
 */
export function SectionBand({
  section,
  overline,
  chart,
  onAction,
}: SectionBandProps) {
  const [topInsight, ...restInsights] = section.insights;

  return (
    <Card variant="overlay"
      padding="none"
      hover={false}
      className="relative overflow-hidden"
      data-testid={`section-band-${section.key}`}
      data-sparse={section.sparse ? 'true' : 'false'}
    >
      <div className="p-6 md:p-7 space-y-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            {overline && (
              <p className="text-eyebrow uppercase tracking-[0.14em] text-warm-500 font-medium">
                {overline}
              </p>
            )}
            <h2
              data-testid={`section-heading-${section.key}`}
              className="text-xl md:text-2xl font-medium text-warm-900 mt-0.5"
            >
              {section.category}
            </h2>
          </div>
        </div>

        {section.sparse ? (
          <EmptySection />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: chart / metrics rail */}
            <div className="lg:col-span-5 space-y-4">
              {section.metrics.length > 0 && (
                <div
                  className="flex flex-wrap gap-2"
                  data-testid={`section-metrics-${section.key}`}
                >
                  {section.metrics.map((m) => (
                    <MetricPill key={m.label} metric={m} />
                  ))}
                </div>
              )}
              {chart && <div>{chart}</div>}
            </div>

            {/* Right: insights */}
            <div className="lg:col-span-7 space-y-3">
              {section.insights.length === 0 ? (
                <p className="text-sm text-warm-400 italic">
                  No insights yet for this area.
                </p>
              ) : (
                <>
                  {topInsight && (
                    <InsightCard
                      insight={topInsight}
                      density="default"
                      audience="coach"
                      showActions
                      onAction={onAction}
                    />
                  )}
                  {restInsights.length > 0 && (
                    <div className="space-y-2">
                      {restInsights.slice(0, 4).map((insight) => (
                        <InsightCard
                          key={insight.id}
                          insight={insight}
                          density="compact"
                          audience="coach"
                          onAction={onAction}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export function MetricPill({ metric }: { metric: FingerprintMetric }) {
  return (
    <div
      className={cn(
        'inline-flex flex-col gap-0.5 px-3 py-2 rounded-xl border',
        'bg-cream-100/82',
        metric.tone === 'good' && 'border-primary-200',
        metric.tone === 'bad' && 'border-red-200',
        metric.tone === 'neutral' && 'border-warm-200',
      )}
      data-tone={metric.tone}
    >
      <span className="text-eyebrow uppercase tracking-wide text-warm-500 font-medium">
        {metric.label}
      </span>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            'text-base font-medium tabular-nums',
            metric.tone === 'good'
              ? 'text-primary-700'
              : metric.tone === 'bad'
                ? 'text-red-600'
                : 'text-warm-900',
          )}
        >
          {metric.value}
        </span>
        {metric.comparison && (
          <span className="text-eyebrow text-warm-500">{metric.comparison}</span>
        )}
      </div>
    </div>
  );
}

export function EmptySection() {
  return (
    <div
      className="flex items-center justify-center py-10 px-4 rounded-xl bg-warm-50/50 border border-warm-100"
      data-testid="section-empty"
    >
      <p className="text-sm text-warm-500">
        Not enough data yet · needs 5+ rounds
      </p>
    </div>
  );
}

// Inline printer icon so we don't have to touch @/components/icons. Matches
// the stroke weight of the IconX family.
function PrinterIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}
