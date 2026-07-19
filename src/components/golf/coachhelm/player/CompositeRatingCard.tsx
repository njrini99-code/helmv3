'use client';

/**
 * ============================================================================
 * CompositeRatingCard — GAME STRENGTH (Fairway rebuild, #969/#970/#973)
 * ----------------------------------------------------------------------------
 * #969 — this card used to be the last piece of legacy chrome (`Card
 * variant="overlay"`, a bespoke inline SVG ring, ad-hoc bar divs) sitting right
 * next to the Fairway-rebuilt FairwayTrendBrain in the same "Performance
 * overview" grid row. Rebuilt in the Fairway kit — InstrumentPanel bezel, the
 * `Dial` mini-gauge primitive, TrendChip — so the row reads as one cockpit
 * instead of a redesigned card beside an unchanged one.
 *
 * #970 — the old ring drew its TRACK with `stroke-warm-100`, which is
 * near-invisible against the cream surface, so a partial fill read as a
 * floating broken arc rather than a gauge. `Dial` always renders a visible
 * faint track (`opacity-16` on `text-tertiary`) regardless of value — the fix
 * is structural (the primitive itself), not a color tweak.
 *
 * #973 — `getPlayerProfile` (coachhelm-data.ts) falls back to
 * `computeCategoryRatings({})` when there isn't enough team data to normalize
 * z-scores, which hard-codes EVERY category to exactly 50 (z-score.ts). That
 * midpoint default is a legitimate honest fallback upstream, but plotting five
 * bars that all land on 50 LOOKS like a real, differentiated breakdown when
 * it's actually "we don't know yet." Detect that exact signature client-side
 * and swap the bars for an honest InsufficientData panel instead.
 * ========================================================================== */

import { memo } from 'react';
import { cn } from '@/lib/utils';
import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
import { Dial } from '@/components/fairway/charts/Dial';
import { TrendChip, type TrendDirection } from '@/components/fairway/charts/TrendChip';
import { InsufficientData } from '@/components/fairway/feedback/InsufficientData';

interface CompositeRatingCardProps {
  // Typed props (used when data is pre-parsed)
  composite?: number;
  categories?: {
    teeGame: number;
    approach: number;
    shortGame: number;
    putting: number;
    scoring: number;
  };
  percentiles?: Record<string, { team: number }>;
  trend?: { direction: 'improving' | 'stable' | 'declining'; delta: number };
  // Raw data prop (from server action — parsed internally)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profileData?: Record<string, any>;
  playerState?: string;
  playerName?: string;
  className?: string;
}

const categoryLabels: Record<string, string> = {
  teeGame: 'Tee Game',
  approach: 'Approach',
  shortGame: 'Short Game',
  putting: 'Putting',
  scoring: 'Scoring',
};

// #973 — the exact signature of computeCategoryRatings({})'s all-50 default
// (z-score.ts). A tiny epsilon guards against float noise while still being
// tight enough that a genuinely-computed spread (which would essentially
// never land every category within a few tenths of 50) never false-positives.
const MIDPOINT_DEFAULT = 50;
const MIDPOINT_EPSILON = 0.5;

function isMidpointDefault(categories: Record<string, number>): boolean {
  const values = Object.values(categories);
  if (values.length === 0) return false;
  return values.every((v) => Math.abs(v - MIDPOINT_DEFAULT) < MIDPOINT_EPSILON);
}

function categoryBarColor(value: number): string {
  if (value >= 60) return 'bg-accent-500';
  if (value >= 40) return 'bg-fw-warning';
  return 'bg-fw-danger';
}

function categoryValueColor(value: number): string {
  if (value >= 60) return 'text-fw-success';
  if (value >= 40) return 'text-fw-warning';
  return 'text-fw-danger';
}

// The old card's 3-way 'stable' → maps onto the shared TrendChip vocabulary's
// 'flat'; 'improving'/'declining' pass through unchanged.
function toTrendDirection(direction: 'improving' | 'stable' | 'declining'): TrendDirection {
  return direction === 'stable' ? 'flat' : direction;
}

function CompositeRatingCardImpl({
  composite,
  categories,
  percentiles,
  trend,
  profileData,
  playerState: _playerState,
  playerName: _playerName,
  className,
}: CompositeRatingCardProps) {
  // Resolve props: prefer typed props, fall back to parsing from profileData
  const resolvedComposite = composite ?? (profileData?.composite as number | undefined);
  const resolvedCategories = categories ?? (profileData?.categories as typeof categories | undefined);
  const resolvedPercentiles = percentiles ?? (profileData?.percentiles as typeof percentiles | undefined);
  const resolvedTrend = trend ?? (profileData?.trend as typeof trend | undefined);

  // Show empty state when no real data exists (avoids contradictory 0 composite / 50 categories)
  const hasData = resolvedComposite != null || resolvedCategories != null;

  if (!hasData) {
    return (
      <InstrumentPanel depth="base" className={className} eyebrow="Game Strength">
        <InsufficientData
          title="Game strength warming up"
          description="Complete more rounds to unlock your composite rating."
          unit="rounds"
        />
      </InstrumentPanel>
    );
  }

  const displayComposite = Math.max(0, Math.min(100, Number(resolvedComposite ?? 0)));
  const displayCategories = resolvedCategories ?? { teeGame: 50, approach: 50, shortGame: 50, putting: 50, scoring: 50 };
  const categoriesAreMidpointDefault = isMidpointDefault(displayCategories);

  return (
    <InstrumentPanel
      depth="base"
      className={className}
      eyebrow="Game Strength"
      readout={
        resolvedTrend ? (
          <TrendChip
            direction={toTrendDirection(resolvedTrend.direction)}
            label={
              <>
                {Number(resolvedTrend.delta ?? 0) > 0 ? '+' : ''}
                {Number(resolvedTrend.delta ?? 0).toFixed(1)} / 30d
              </>
            }
            numeric
          />
        ) : undefined
      }
    >
      <div className="flex flex-col items-center gap-6">
        <Dial
          label="Composite"
          value={displayComposite / 100}
          benchmark={0.6}
          goodDirection="up"
          valueFormatter={(v) => Math.round(v * 100).toString()}
          size={176}
        />

        {categoriesAreMidpointDefault ? (
          <InsufficientData
            compact
            title="Category breakdown warming up"
            description="Not enough team data to differentiate these yet. The composite above is still real."
            unit="teammates"
          />
        ) : (
          <div className="w-full space-y-3">
            {(Object.entries(displayCategories) as [keyof typeof displayCategories, number][])
              .filter(([key]) => key in categoryLabels)
              .map(([key, value]) => (
                <div key={key} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-body-sm text-text-secondary">
                    {categoryLabels[key]}
                  </span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-sunken">
                    <div
                      className={cn('h-full rounded-full', categoryBarColor(value))}
                      style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      'w-8 shrink-0 text-right font-fw-mono text-body-sm tabular-nums',
                      categoryValueColor(value),
                    )}
                  >
                    {Math.round(value)}
                  </span>
                  {resolvedPercentiles?.[key] ? (
                    <span className="w-16 shrink-0 text-right font-fw-mono text-caption tabular-nums text-text-tertiary">
                      {resolvedPercentiles[key].team}th %ile
                    </span>
                  ) : null}
                </div>
              ))}
          </div>
        )}
      </div>
    </InstrumentPanel>
  );
}

// Memoized export — prevents unnecessary re-animation of the dial when
// the parent dashboard re-renders but the rating data is unchanged.
export const CompositeRatingCard = memo(CompositeRatingCardImpl);
