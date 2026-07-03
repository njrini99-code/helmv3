'use client';

// =============================================================================
// src/components/lifting/athletes/AthleteProfileCard.tsx
//
// Per-athlete glass card used in the roster grid (small) and on the athlete
// detail page header (large variant). Displays:
//  - Avatar initials + name + position + sport badge
//  - Readiness band indicator (if a recent check-in is supplied)
//  - Last-session status hint
//
// Rendered as a <Link> when a athleteId is available (roster grid) or as a
// static header card on the detail page (size="large").
// =============================================================================

import Link from 'next/link';
import { IconHeart, IconDumbbell } from '@/components/icons';
import type { HelmLiftingAthleteRow, HelmLiftingReadinessCheckinRow, HelmLiftingReadinessBand } from '@/lib/types';

// ---------------------------------------------------------------------------
// Readiness band config
// ---------------------------------------------------------------------------

interface BandConfig {
  label: string;
  dotClass: string;
  textClass: string;
}

const BAND_CONFIG: Record<HelmLiftingReadinessBand, BandConfig> = {
  green: { label: 'Ready', dotClass: 'bg-primary-500', textClass: 'text-primary-700' },
  yellow: { label: 'Caution', dotClass: 'bg-amber-400', textClass: 'text-amber-700' },
  orange_lower: { label: 'Reduced', dotClass: 'bg-orange-400', textClass: 'text-orange-700' },
  orange_upper: { label: 'Reduced', dotClass: 'bg-orange-400', textClass: 'text-orange-700' },
  red: { label: 'Hold', dotClass: 'bg-red-500', textClass: 'text-red-700' },
  blue: { label: 'Modified', dotClass: 'bg-blue-400', textClass: 'text-blue-700' },
};

const SPORT_LABELS: Record<string, string> = {
  baseball: 'Baseball',
  golf: 'Golf',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  athlete: HelmLiftingAthleteRow;
  /** Latest readiness check-in for the band indicator. null = not checked in today. */
  latestCheckin: Pick<
    HelmLiftingReadinessCheckinRow,
    'id' | 'checkin_date' | 'sleep_quality' | 'energy_level' | 'soreness_overall' | 'readiness_score' | 'readiness_band'
  > | null;
  /** Size variant: 'card' (roster grid default) or 'large' (detail page header). */
  size?: 'card' | 'large';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AthleteProfileCard({ athlete, latestCheckin, size = 'card' }: Props) {
  const initials =
    [athlete.first_name?.charAt(0), athlete.last_name?.charAt(0)]
      .filter(Boolean)
      .join('')
      .toUpperCase() || '?';

  const displayName =
    [athlete.first_name, athlete.last_name].filter(Boolean).join(' ') || 'Unknown';

  const today = new Date().toISOString().slice(0, 10);
  const checkinIsToday = latestCheckin?.checkin_date === today;
  const band = checkinIsToday && latestCheckin?.readiness_band
    ? (latestCheckin.readiness_band as HelmLiftingReadinessBand)
    : null;
  const bandCfg = band ? BAND_CONFIG[band] : null;

  const inner = (
    <div
      className={`glass-standard rounded-2xl shadow-glass transition-all duration-200 ${
        size === 'card' ? 'p-4 hover:bg-cream-100 hover:shadow-card-hover' : 'p-6'
      }`}
    >
      <div className={`flex ${size === 'large' ? 'items-start gap-5' : 'items-center gap-3'}`}>
        {/* Avatar */}
        <div
          className={`flex shrink-0 items-center justify-center rounded-2xl bg-primary-100 font-semibold text-primary-700 ${
            size === 'large' ? 'h-14 w-14 text-xl' : 'h-10 w-10 text-base'
          }`}
          aria-hidden
        >
          {initials}
        </div>

        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p
              className={`font-semibold text-warm-900 ${
                size === 'large' ? 'text-xl' : 'text-sm'
              }`}
            >
              {displayName}
            </p>
            <span className="rounded-full bg-warm-100 px-2 py-0.5 text-micro font-medium text-warm-500">
              {SPORT_LABELS[athlete.sport] ?? athlete.sport}
            </span>
          </div>
          {athlete.position && (
            <p className={`mt-0.5 text-warm-500 ${size === 'large' ? 'text-sm' : 'text-xs'}`}>
              {athlete.position}
            </p>
          )}

          {/* Readiness + last session indicators */}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {bandCfg ? (
              <span className={`flex items-center gap-1 text-xs font-medium ${bandCfg.textClass}`}>
                <span className={`h-2 w-2 rounded-full ${bandCfg.dotClass}`} aria-hidden />
                <IconHeart size={12} className={bandCfg.textClass} />
                {bandCfg.label}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-warm-400">
                <IconHeart size={12} />
                No check-in today
              </span>
            )}
          </div>
        </div>

        {/* Readiness score (large only) */}
        {size === 'large' && latestCheckin?.readiness_score != null && checkinIsToday && (
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold tabular-nums text-warm-900">
              {Math.round(latestCheckin.readiness_score)}
            </p>
            <p className="text-xs text-warm-400">Readiness</p>
          </div>
        )}
      </div>

      {/* Detail metrics row (large only) */}
      {size === 'large' && latestCheckin && checkinIsToday && (
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-warm-100 pt-4">
          <Metric label="Sleep" value={latestCheckin.sleep_quality} unit="/5" />
          <Metric label="Energy" value={latestCheckin.energy_level} unit="/5" />
          <Metric label="Soreness" value={latestCheckin.soreness_overall} unit="/5" />
        </div>
      )}

      {/* Empty readiness notice (large only) */}
      {size === 'large' && !checkinIsToday && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-warm-50 px-3 py-2 text-sm text-warm-500">
          <IconDumbbell size={14} className="shrink-0" />
          No readiness check-in today.
        </div>
      )}
    </div>
  );

  if (size === 'card') {
    return (
      <Link
        href={`/lifting/dashboard/athletes/${athlete.id}`}
        className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 rounded-2xl"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: number | null | undefined;
  unit: string;
}) {
  return (
    <div className="text-center">
      <p className="text-lg font-semibold tabular-nums text-warm-900">
        {value != null ? value : '—'}
        {value != null ? <span className="text-xs font-normal text-warm-400">{unit}</span> : null}
      </p>
      <p className="text-xs text-warm-400">{label}</p>
    </div>
  );
}
