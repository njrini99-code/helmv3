'use client';

/**
 * ============================================================================
 * ReviewHero — the round-review "film" unit (mockup §04 `.film`)
 * ----------------------------------------------------------------------------
 * The green left panel (score + to-par mono, course/date, `GradeDots`, mix
 * line) beside the 18-hole `Filmstrip` + its scrub detail line, as ONE
 * bordered hero unit — never two separate cards. Hover/focus/click on any
 * filmstrip column updates the detail line inline (cheap, non-navigating,
 * per spec §3.4's "hover/tap/focus scrubs a detail line"). A deliberate
 * The same hover/focus/tap scrub also previews that hole's existing
 * `HoleShotPath` reconstruction in place below the strip. A direct `?hole=`
 * link still opens the same state for sharing.
 *
 * The `Filmstrip` itself now renders the premium `HoleShotPath` visual (size
 * "strip") for all 18 holes by default — the SVG shot-path reconstruction IS
 * the first thing a reader sees, not a plain bar chart. Scrubbing a hole
 * additionally opens a BIGGER "reviewCard" detail below the strip (header,
 * numbered shots, hover tooltips) — the strip stays a compact at-a-glance
 * row while the detail panel is where a reader actually inspects a hole.
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filmstrip, GradeDots } from '@/components/fairway/modules';
import { PressTarget, Skeleton } from '@/components/fairway';
import type { FilmstripHole } from '@/components/fairway/modules';
import type { ShotInput } from '@/components/golf/coachhelm/v3/HoleShotPath/types';
import type { ReviewGrade } from './buildReviewViewModel';
import { formatHoleDetail, formatToPar } from './buildReviewViewModel';

// Only renders once a reader explicitly taps "View shot path" — code-split so
// its framer-motion + SVG reconstruction never lands in the review page's
// first-load JS. Keep the inline detail compact: this is supporting evidence,
// not a second full-page hero nested inside the review hero.
const HoleShotPath = dynamic(
  () => import('@/components/golf/coachhelm/v3/HoleShotPath').then((mod) => mod.HoleShotPath),
  {
    ssr: false,
    // Matches the "reviewCard" variant's fluid box at this panel's grid
    // column width (140px / 160px at md), aspect-locked 140:320.
    loading: () => (
      <Skeleton className="h-[320px] w-[140px] rounded-fw-md md:h-[366px] md:w-[160px]" />
    ),
  },
);

export interface ReviewHoleMeta {
  par: number | null;
  yardage: number | null;
  score: number | null;
}

export interface ReviewHeroProps {
  totalScore: number;
  scoreToPar: number;
  courseDateLine: string;
  grade: ReviewGrade;
  mixLine: string;
  filmstripHoles: FilmstripHole[];
  holeMeta: Map<number, ReviewHoleMeta>;
  /** `null` while the shot ledger is still loading. */
  shotsByHole: Map<number, ShotInput[]> | null;
}

export function ReviewHero({
  totalScore,
  scoreToPar,
  courseDateLine,
  grade,
  mixLine,
  filmstripHoles,
  holeMeta,
  shotsByHole,
}: ReviewHeroProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialHole = useMemo(() => {
    const raw = searchParams.get('hole');
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const [activeHole, setActiveHole] = useState<number | null>(initialHole);
  const [openHole, setOpenHole] = useState<number | null>(initialHole);

  // If the round changes under us (navigating between reviews without a full
  // remount), drop any stale open-hole state from the previous round.
  useEffect(() => {
    setActiveHole(initialHole);
    setOpenHole(initialHole);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filmstripHoles]);

  const activeFilmstripHole = filmstripHoles.find((h) => h.n === activeHole) ?? null;
  const detail = activeFilmstripHole ? formatHoleDetail(activeFilmstripHole) : null;

  const openHoleShots = openHole != null ? shotsByHole?.get(openHole) ?? null : null;
  const canOpenShotPath = activeHole != null && (shotsByHole?.get(activeHole)?.length ?? 0) > 0;

  function setHoleParam(hole: number | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (hole == null) next.delete('hole');
    else next.set('hole', String(hole));
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }

  // Scrubbing is the visual interaction: hover/focus on desktop and tap on
  // touch devices both update the narrative and available shot path.
  function handleScrub(hole: FilmstripHole) {
    setActiveHole(hole.n);
    // Desktop hover/focus and mobile tap share the same scrub callback. When
    // shot data exists, preview it immediately so the filmstrip behaves like
    // film: moving across holes updates the path without a second click.
    if ((shotsByHole?.get(hole.n)?.length ?? 0) > 0) setOpenHole(hole.n);
    else if (openHole != null) setOpenHole(null);
  }

  function toggleShotPath() {
    if (activeHole == null) return;
    if (openHole === activeHole) {
      setOpenHole(null);
      setHoleParam(null);
    } else {
      setOpenHole(activeHole);
      setHoleParam(activeHole);
    }
  }

  const openMeta = openHole != null ? holeMeta.get(openHole) : undefined;
  const openPar = openMeta?.par === 3 || openMeta?.par === 4 || openMeta?.par === 5 ? openMeta.par : undefined;

  return (
    <div
      data-slot="review-hero"
      className="grid min-w-0 grid-cols-1 overflow-clip rounded-fw-lg border border-accent-700 bg-border-subtle shadow-raise sm:grid-cols-[240px_minmax(0,1fr)]"
    >
      {/* Green left panel */}
      <div className="bg-gradient-to-b from-accent-900 via-accent-800 to-accent-800 p-5 text-text-on-accent sm:p-6">
        <p className="font-fw-display text-eyebrow uppercase tracking-[0.13em] text-accent-300">
          Round score
        </p>
        <p className="mt-2 flex items-baseline gap-1.5">
          <span className="font-fw-mono text-stat-lg font-semibold leading-none tracking-[-0.03em] tabular-nums">
            {totalScore}
          </span>
          <span className="font-fw-mono text-body-lg tabular-nums text-accent-300">
            {formatToPar(scoreToPar)}
          </span>
        </p>
        {courseDateLine ? (
          <p className="mt-1.5 font-fw-sans text-body-sm text-accent-100">{courseDateLine}</p>
        ) : null}
        <GradeDots score={grade.score} label={grade.label} onGreen />
        {mixLine ? (
          <p className="mt-4 font-fw-sans text-caption text-accent-100">
            Mix: <span className="font-fw-mono font-normal text-text-on-accent">{mixLine}</span>
          </p>
        ) : null}
      </div>

      {/* Filmstrip + scrub detail */}
      <div className="min-w-0 bg-surface p-4 sm:p-5">
        <Filmstrip
          holes={filmstripHoles}
          activeHole={activeHole ?? undefined}
          onScrub={handleScrub}
          shotsByHole={shotsByHole}
        />
        <div className="mt-3 min-h-[40px] border-t border-border-subtle pt-3">
          {detail ? (
            <>
              <p className="font-fw-mono text-caption font-normal text-text-primary">{detail.header}</p>
              <p className="mt-0.5 font-fw-sans text-body-sm text-text-secondary">{detail.body}</p>
              {canOpenShotPath ? (
                <PressTarget
                  onClick={toggleShotPath}
                  aria-expanded={openHole === activeHole}
                  className="mt-2 font-fw-sans text-caption font-semibold text-accent-700 transition-colors duration-150 hover:text-accent-800"
                >
                  {openHole === activeHole ? 'Hide shot path' : 'Show shot path'}
                </PressTarget>
              ) : null}
            </>
          ) : (
            <p className="font-fw-sans text-body-sm text-text-tertiary">
              Hover or tap a hole to see what happened.
            </p>
          )}
        </div>

      </div>

      {openHole != null && openHoleShots && openHoleShots.length > 0 ? (
        <div className="min-w-0 border-t border-border-subtle bg-surface-tint p-4 sm:col-span-2 sm:p-5">
          <div className="grid min-w-0 grid-cols-[140px_minmax(0,1fr)] items-start gap-4 md:grid-cols-[160px_minmax(0,1fr)] md:gap-6">
            <HoleShotPath
              hole_number={openHole}
              par={openPar}
              yardage={openMeta?.yardage ?? null}
              score={openMeta?.score ?? null}
              shots={openHoleShots}
              size="reviewCard"
            />
            <div className="min-w-0 pt-1">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-fw-display text-body-lg font-semibold text-text-primary">Hole {openHole} shot path</p>
                  <p className="mt-1 font-fw-sans text-caption text-text-tertiary">Hover or focus a numbered shot to inspect it.</p>
                </div>
                <PressTarget onClick={toggleShotPath} className="shrink-0 rounded-full px-3 py-2 font-fw-sans text-caption font-semibold text-accent-700 hover:bg-accent-50">
                  Close
                </PressTarget>
              </div>
              <ol className="mt-4 space-y-2">
                {openHoleShots.slice(0, 6).map((shot, index) => (
                  <li key={`${shot.shot_number}-${index}`} className="min-w-0 rounded-fw-sm border border-border-subtle bg-surface px-3 py-2">
                    <p className="truncate font-fw-sans text-caption font-medium text-text-primary">
                      Shot {index + 1}: {shot.lie_before || 'start'} → {shot.lie_after || 'result'}
                    </p>
                    <p className="mt-0.5 truncate font-fw-mono text-eyebrow font-normal tabular-nums text-text-tertiary">
                      {typeof shot.distance_to_hole_after === 'number' ? `${Math.round(shot.distance_to_hole_after)} yds left` : 'Distance not logged'}
                      {shot.miss_direction ? ` · ${shot.miss_direction}` : ''}
                      {shot.is_penalty ? ` · penalty${shot.penalty_type ? `: ${shot.penalty_type}` : ''}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
