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
 * "View shot path" action — separate from the hover scrub — opens that
 * hole's existing `HoleShotPath` reconstruction IN PLACE below the strip
 * (spec §5.5), synced to a shareable `?hole=` search param.
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
// first-load JS. Fallback mirrors the `hero` size variant it replaces.
const HoleShotPath = dynamic(
  () => import('@/components/golf/coachhelm/v3/HoleShotPath').then((m) => m.HoleShotPath),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="w-full max-w-[280px] h-[560px] md:max-w-[320px] md:h-[640px] rounded-fw-md" />
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

  // Scrubbing to a different hole while a shot-path panel is open leaves a
  // stale panel (open hole's shots keep rendering under a detail line that
  // has moved on). Closing the panel on scrub — rather than repointing it —
  // keeps "View shot path" an explicit, deliberate action per hole instead
  // of shot data silently swapping under the reader as they scrub.
  function handleScrub(hole: FilmstripHole) {
    setActiveHole(hole.n);
    if (openHole != null && openHole !== hole.n) {
      setOpenHole(null);
      setHoleParam(null);
    }
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
      className="grid grid-cols-1 overflow-hidden rounded-fw-lg border border-accent-700 bg-border-subtle shadow-raise sm:grid-cols-[264px_1fr]"
    >
      {/* Green left panel */}
      <div className="bg-gradient-to-b from-accent-900 via-accent-800 to-accent-800 p-6 text-text-on-accent">
        <p className="font-fw-display text-eyebrow uppercase tracking-[0.13em] text-accent-300">
          Round Review
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
      <div className="bg-surface p-5 sm:p-6">
        <Filmstrip
          holes={filmstripHoles}
          activeHole={activeHole ?? undefined}
          onScrub={handleScrub}
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
                  {openHole === activeHole ? 'Hide shot path' : 'View shot path →'}
                </PressTarget>
              ) : null}
            </>
          ) : (
            <p className="font-fw-sans text-body-sm text-text-tertiary">
              Hover or tap a hole to see what happened.
            </p>
          )}
        </div>

        {openHole != null && openHoleShots && openHoleShots.length > 0 ? (
          <div className="mt-5 flex justify-center border-t border-border-subtle pt-5">
            <HoleShotPath
              hole_number={openHole}
              par={openPar}
              yardage={openMeta?.yardage ?? null}
              score={openMeta?.score ?? null}
              shots={openHoleShots}
              size="hero"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
