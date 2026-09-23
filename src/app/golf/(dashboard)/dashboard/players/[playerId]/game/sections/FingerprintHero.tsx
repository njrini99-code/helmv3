'use client';

/**
 * ============================================================================
 * MOSTLY DEAD CODE. Only `MetricPill` is rendered anywhere.
 * ----------------------------------------------------------------------------
 * Verified 2026-08-16 by grepping the whole tree: there is no `<FingerprintHero`
 * and no `<SectionBand` in `src/**`, and the live `/game` route
 * (`game/page.tsx`) imports nothing from this `sections/` directory — it renders
 * `PlayerDeepDiveTabs` -> `FairwayPlayerGameFingerprint` instead. The single
 * live consumer of this file is `game/print/page.tsx`, which imports
 * `MetricPill` and nothing else.
 *
 * That matters for anyone sent here to "fix the fingerprint UI". This file is
 * the only genome/fingerprint file left carrying the pre-Fairway visual
 * language — legacy `Card`/`Button` from `@/components/ui/*`, and ~24 banned
 * `warm-*`/`cream-*`/`red-*`/`amber-*` classes. Every LIVE surface in this area
 * measures ZERO banned tokens: `FairwayPlayerGameFingerprint` (894 lines),
 * `FairwayPlayerInsight`, `GenomeDetailView`, `GenomeCompareView`,
 * `PlayerDeepDiveTabs`, `game/page.tsx`, `players/[playerId]/genome/page.tsx`.
 * So restyling THIS file changes nothing a coach can see — check what actually
 * mounts before spending effort here.
 *
 * The header used to describe "Player name (Fraunces, large)" and "Composite
 * rating big number (Fraunces)". Fraunces was deliberately removed from the
 * type stack; display/sans now resolve to the system stack. The code never
 * applied a display class anyway, so the note documented an intention that was
 * never true and is now impossible.
 *
 * `SectionBand` was the shared chrome the other section files rendered inside
 * of; it is unreferenced along with them.
 * ========================================================================== */
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
import type {
  FingerprintMetric,
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
// `SectionBand` (the shared chrome the other, already-dead section files
// rendered inside of — see header) was removed 2026-09-22: zero importers
// anywhere in src/** per the header's own note. `EmptySection` below was
// its only internal caller and is left in place (unexported-but-idle, same
// as the rest of this file per the header) since nothing in this pass asked
// for it.
// ---------------------------------------------------------------------------

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
