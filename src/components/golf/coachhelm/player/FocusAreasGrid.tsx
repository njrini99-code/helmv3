'use client';

import { m, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  IconTarget,
  IconTrendingUp,
  IconTrendingDown,
  IconChevronRight,
  IconActivity,
} from '@/components/icons';

// P2-18: focus-area ratings must not mix incompatible units. `strokesGained`
// stays as the ordering magnitude, but only `unit: 'strokes/round'` rows are
// LABELLED strokes/round. `value`+`unit` carry each row's native quantity so a
// distance error (yards) or a causal effect-size (opportunity) is never shown as
// strokes/round. `unit` is optional so legacy callers default to strokes/round.
export type FocusAreaUnit = 'strokes/round' | 'yd from target' | 'opportunity';

export interface FocusArea {
  area: string;
  strokesGained: number;
  value?: number;
  unit?: FocusAreaUnit;
  trend: 'improving' | 'stable' | 'declining';
  recommendation: string;
}

// Area strings come from the DB in varied casings/snake_case — normalize for display.
// Keep hyphens within tokens so labels like "Mid-Long (160-190)" survive intact;
// only snake_case underscores collapse to spaces.
export function formatAreaName(area: string): string {
  if (!area) return '';
  // If the label already contains spaces or hyphens with proper casing, treat
  // it as a human-formatted label and leave it alone (e.g. "Mid-Long (160-190) Shots").
  if (/[A-Z]/.test(area) && /\s/.test(area)) return area;
  return area
    .replace(/_+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

interface FocusAreasGridProps {
  focusAreas: FocusArea[];
  onAreaClick?: (area: FocusArea) => void;
}

// Format strokes gained/lost for display
function formatStrokesGained(value: number | string | undefined | null): string {
  if (value == null) return '--';
  const num = Number(value);
  if (isNaN(num)) return '--';
  if (num === 0) return '0.0';
  return num > 0 ? `+${num.toFixed(1)}` : num.toFixed(1);
}

// Get trend icon and color
function getTrendConfig(trend: FocusArea['trend']) {
  switch (trend) {
    case 'improving':
      return {
        icon: IconTrendingUp,
        color: 'text-primary-500',
        bgColor: 'bg-primary-50',
        label: 'Improving',
      };
    case 'declining':
      return {
        icon: IconTrendingDown,
        color: 'text-red-500',
        bgColor: 'bg-red-50',
        label: 'Needs Work',
      };
    default:
      return {
        icon: IconActivity,
        color: 'text-warm-400',
        bgColor: 'bg-warm-50',
        label: 'Stable',
      };
  }
}

// Get strokes color based on value
function getStrokesColor(value: number | string) {
  const num = Number(value ?? 0);
  if (num > 0.2) return 'text-primary-600';
  if (num < -0.5) return 'text-red-600';
  if (num < -0.2) return 'text-amber-600';
  return 'text-warm-600';
}

// P2-18: render each focus area in its NATIVE unit. Only stroke-impact rows are
// labelled strokes/round; distance-error rows show yards; causal effect-size
// rows show a qualitative opportunity tier (never a fabricated stroke value).
export interface FocusAreaDisplay {
  text: string;
  unitLabel: string;
  color: string;
  /** Only the strokes/round unit gets the bipolar strokes bar. */
  showStrokesBar: boolean;
}

export function resolveDisplay(focusArea: FocusArea): FocusAreaDisplay {
  const unit: FocusAreaUnit = focusArea.unit ?? 'strokes/round';

  if (unit === 'yd from target') {
    const yards = Number(focusArea.value ?? Math.abs(focusArea.strokesGained * 10));
    // #974 — a flagged focus area with a genuine "0 yd from target" headline
    // is a contradiction (0 error would mean this band isn't a problem at
    // all), so it's a data/rounding artifact, not a real reading. Say less
    // rather than assert a nonsensical number.
    const isPlausible = Number.isFinite(yards) && yards > 0;
    return {
      text: isPlausible ? Math.round(yards).toString() : '--',
      unitLabel: 'yd from target',
      color: 'text-amber-600',
      showStrokesBar: false,
    };
  }

  if (unit === 'opportunity') {
    const strength = Number(focusArea.value ?? Math.abs(focusArea.strokesGained));
    const tier = !Number.isFinite(strength)
      ? '--'
      : strength >= 0.75
        ? 'High'
        : strength >= 0.5
          ? 'Medium'
          : 'Low';
    return {
      text: tier,
      unitLabel: 'opportunity',
      color: 'text-primary-600',
      showStrokesBar: false,
    };
  }

  // strokes/round — the only unit traceable to a per-round stroke impact.
  return {
    text: formatStrokesGained(focusArea.strokesGained),
    unitLabel: 'strokes/round',
    color: getStrokesColor(focusArea.strokesGained),
    showStrokesBar: true,
  };
}

// #974 — two different bands (e.g. "Short 50-100" and "Long 190-220") were
// rendering the IDENTICAL generic recommendation sentence from the upstream
// generator. Detect a recommendation that's a verbatim repeat of an earlier
// card in the same grid and fall back to a band-specific line built from the
// area's own name, rather than let a second card silently parrot the first.
function dedupedRecommendation(
  focusArea: FocusArea,
  seenRecommendations: Set<string>,
): string {
  const raw = (focusArea.recommendation ?? '').trim();
  if (!raw || seenRecommendations.has(raw)) {
    return `Prioritize dedicated practice reps for your ${formatAreaName(focusArea.area).toLowerCase()} shots, this band is dragging strokes independent of any general tip above.`;
  }
  seenRecommendations.add(raw);
  return raw;
}

function FocusAreaCardContent({
  focusArea,
  index,
  interactive,
  recommendation,
}: {
  focusArea: FocusArea;
  index: number;
  interactive: boolean;
  recommendation: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const trendConfig = getTrendConfig(focusArea.trend);
  const TrendIcon = trendConfig.icon;
  const display = resolveDisplay(focusArea);
  const isPositive = Number(focusArea.strokesGained ?? 0) > 0;

  return (
    <>
      {/* Priority indicator */}
      <div className={cn(
        'absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-eyebrow font-medium',
        index === 0 ? 'bg-primary-100 text-primary-700' :
        index === 1 ? 'bg-primary-50 text-primary-600' :
        'bg-warm-100 text-warm-500'
      )}>
        {index + 1}
      </div>

      {/* Area name and trend */}
      <div className="flex items-center gap-2 mb-3 pr-8">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center',
          trendConfig.bgColor
        )}>
          <TrendIcon size={16} className={trendConfig.color} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className={cn(
            'font-medium text-warm-900 text-sm leading-tight line-clamp-2 transition-colors',
            interactive && 'group-hover:text-primary-600'
          )}>
            {formatAreaName(focusArea.area)}
          </h4>
          <span className={cn('text-xs font-medium', trendConfig.color)}>
            {trendConfig.label}
          </span>
        </div>
      </div>

      {/* Rating display — rendered in the row's NATIVE unit (P2-18). Only the
          strokes/round unit traces to a real per-round stroke impact. */}
      <div className="flex items-baseline gap-1 mb-3 flex-wrap">
        <span className={cn('text-h1 font-light tabular-nums tracking-[-0.025em]', display.color)}>
          {display.text}
        </span>
        <span className="text-xs text-warm-500 whitespace-nowrap">{display.unitLabel}</span>
      </div>

      {/* Visual bar — ONLY for the bipolar strokes/round unit. Distance-error and
          opportunity rows have no strokes axis, so no (misleading) strokes bar. */}
      {display.showStrokesBar && (
        <div className="relative h-2 bg-warm-100 rounded-full overflow-clip mb-3">
          <m.div
            initial={{ width: 0 }}
            animate={{
              width: `${Math.min(Math.abs(Number(focusArea.strokesGained ?? 0)) * 20, 100)}%`,
            }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.4, delay: 0.05 + index * 0.03, ease: [0.25, 0.1, 0.25, 1] })}
            className={cn(
              'absolute h-full rounded-full',
              isPositive ? 'bg-primary-400' : 'bg-red-400'
            )}
            style={{
              [isPositive ? 'left' : 'right']: '50%',
              transformOrigin: isPositive ? 'right' : 'left',
            }}
          />
          {/* Center marker */}
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-warm-300 -translate-x-1/2" />
        </div>
      )}

      {/* Recommendation snippet */}
      <p className="text-xs text-warm-500 line-clamp-2 mb-2">
        {recommendation}
      </p>

      {/* View details hint (only when interactive) */}
      {interactive && (
        <div className="flex items-center text-xs font-medium text-primary-600 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          View details
          <IconChevronRight size={14} className="ml-1" />
        </div>
      )}
    </>
  );
}

function FocusAreaCard({
  focusArea,
  index,
  recommendation,
  onClick,
}: {
  focusArea: FocusArea;
  index: number;
  recommendation: string;
  onClick?: () => void;
}) {
  const interactive = !!onClick;

  // `block` + `text-left` are load-bearing: this card stacks its children
  // vertically (badge, name, rating, bar, recommendation). It must NEVER be an
  // inline-flex/centered box, or the whole stack collapses into overlapping row
  // content (the IconButton regression: size-md forced `inline-flex
  // items-center justify-center w-11 h-11`, crushing the card into a 44px icon
  // box). Both the button and the Link fallback share this block layout.
  const sharedClassName = cn(
    'relative block w-full p-4 rounded-xl border text-left transition-all duration-200',
    'surface-matte',
    interactive && 'hover:bg-cream-50/92 hover:shadow-lg hover:-translate-y-0.5 group cursor-pointer'
  );

  if (interactive) {
    // <Button>/<IconButton> both force `inline-flex items-center justify-center`
    // on a fixed-size box; this is a stacked block CARD, and that centering is
    // exactly what collapsed it into overlapping columns in prod. A raw block
    // <button> is the correct primitive here.
    return (
      // eslint-disable-next-line helm/no-raw-button -- stacked card, see note above
      <button
        type="button"
        aria-label={`Focus area: ${formatAreaName(focusArea.area)}`}
        onClick={onClick}
        className={sharedClassName}
      >
        <FocusAreaCardContent focusArea={focusArea} index={index} interactive recommendation={recommendation} />
      </button>
    );
  }

  // Task C14: link to the focus areas anchor on the same CoachHelm page,
  // not /my-development (which only shows coach-assigned focus areas and
  // would not contain these AI-derived ones). This fallback only fires when
  // no onAreaClick is wired by the caller (currently: never — the sole
  // caller, FairwayPlayerCoachHelm, always wires a real detail-sheet
  // onAreaClick — see conn-golf-player Finding 1). `interactive` is passed
  // through honestly (was hardcoded `true` via JSX shorthand, so the "View
  // details" hint rendered even on this non-interactive fallback card).
  return (
    <Link href="/golf/dashboard/coachhelm#focus-areas" className={sharedClassName}>
      <FocusAreaCardContent focusArea={focusArea} index={index} interactive={interactive} recommendation={recommendation} />
    </Link>
  );
}

export function FocusAreasGrid({ focusAreas, onAreaClick }: FocusAreasGridProps) {
  const prefersReducedMotion = useReducedMotion();
  // Empty state
  if (focusAreas.length === 0) {
    return (
      <Card variant="overlay" padding="md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <IconTarget size={20} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-medium text-warm-900">Focus Areas</h3>
            <p className="text-xs text-warm-500">Areas to prioritize in practice</p>
          </div>
        </div>

        <EmptyState
          variant="minimal"
          icon={<IconTarget size={20} />}
          description="No focus areas identified yet — complete more rounds to unlock personalized focus areas."
        />
      </Card>
    );
  }

  return (
    <Card variant="overlay" padding="md">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
          <IconTarget size={20} className="text-primary-600" />
        </div>
        <div>
          <h3 className="font-medium text-warm-900">Focus Areas</h3>
          <p className="text-xs text-warm-500">
            Prioritize these areas in your practice
          </p>
        </div>
      </div>

      {/* Grid of focus areas — 2-up at most so cards don't crush inside narrow columns.
          #974 — `seenRecommendations` is built ONCE per render, in array order, so
          the FIRST card to use a given sentence keeps it verbatim and any LATER
          card repeating it verbatim gets a band-specific fallback instead. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {(() => {
          const seenRecommendations = new Set<string>();
          return focusAreas.map((area, index) => (
            // #974 (folds in [22]) — `area.area` alone collided when the
            // upstream generator emitted two rows for the same band name;
            // duplicate React keys make reconciliation reuse the wrong DOM
            // node across re-renders, which is exactly how a priority badge
            // (derived from `index` at render time) can visibly repeat a
            // number and skip another after the list changes. Index-qualify
            // the key so every row is always unique.
            <FocusAreaCard
              key={`${area.area}-${index}`}
              focusArea={area}
              index={index}
              recommendation={dedupedRecommendation(area, seenRecommendations)}
              onClick={onAreaClick ? () => onAreaClick(area) : undefined}
            />
          ));
        })()}
      </div>

      {/* Legend */}
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.5 })}
        className="flex items-center justify-center gap-6 mt-5 pt-4 border-t border-white/20"
      >
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary-400" />
          <span className="text-xs text-warm-500">Gaining strokes</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <span className="text-xs text-warm-500">Losing strokes</span>
        </div>
      </m.div>
    </Card>
  );
}
