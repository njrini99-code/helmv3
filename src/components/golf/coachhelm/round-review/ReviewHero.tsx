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
 * additionally opens a BIGGER "review"-size detail below the strip (header,
 * numbered shots, hover tooltips) — the strip stays a compact at-a-glance
 * row while the detail panel is where a reader actually inspects a hole.
 * That detail `<HoleShotPath>` is keyed on `openHole` so scrubbing to a new
 * hole remounts it — the fresh mount is what replays its shot-by-shot
 * draw-in animation each time, not just on the very first hole opened.
 *
 * DETAIL PANEL LAYOUT, 2026-07-22 redesign: the diagram (`size="review"`,
 * bigger than the old `reviewCard`, full ~1:2 corridor) is the star in its
 * own grid column; a slim companion column carries the putting-zoom panel
 * and the compact shot list below it. The list rows are deliberately NOT
 * `justify-between` — the transition text and its distance sit directly
 * next to each other (Nick: "the card is so long that the result vs
 * yardage is so far apart") instead of pinned to opposite row edges.
 * Diagram column bumped again same day per Nick: "the whole visual is not
 * big enough" (264/300 → 300/360; putting zoom 148px → 172px).
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Filmstrip, GradeDots } from '@/components/fairway/modules';
import { PressTarget, Skeleton } from '@/components/fairway';
import type { FilmstripHole } from '@/components/fairway/modules';
import type { Lie } from '@/components/golf/coachhelm/v3/HoleShotPath/types';
// `plotHole` is pure math (no framer-motion, no client-only APIs, SSR-safe —
// see geometry.ts's own doc comment) so it's safe to import statically here,
// unlike the two components below. Computed ONCE per open hole and shared by
// both the emptiness check (does this hole even have a putting zoom?) and
// the `PuttingZoom` panel itself, instead of each side re-deriving it.
import { plotHole } from '@/components/golf/coachhelm/v3/HoleShotPath/geometry';
import type { ReviewGrade } from './buildReviewViewModel';
import { formatHoleDetail, formatToPar } from './buildReviewViewModel';
import {
  fetchPlayerPuttMakePct,
  type ReviewShotInput,
  type PuttMakePctByBand,
} from './round-review-shots';
import { sumHoleStrokesGainedByCategory, type HoleStrokesGainedByCategory } from './shot-strokes-gained';

// Only renders once a reader explicitly taps "View shot path" — code-split so
// its framer-motion + SVG reconstruction never lands in the review page's
// first-load JS. Keep the inline detail compact: this is supporting evidence,
// not a second full-page hero nested inside the review hero.
const HoleShotPath = dynamic(
  () => import('@/components/golf/coachhelm/v3/HoleShotPath').then((mod) => mod.HoleShotPath),
  {
    ssr: false,
    // Matches the "review" size's fluid ~100:200 box (2026-07-22 "make it
    // bigger" redesign, bumped again same day — see HoleShotPath/index.tsx's
    // SIZES.review) at this panel's centered-then-left-aligned width (see
    // the render below).
    loading: () => (
      <Skeleton className="mx-auto aspect-[100/200] w-full max-w-[300px] rounded-fw-md lg:mx-0 lg:max-w-[360px]" />
    ),
  },
);

// The putting-green zoom — its own side panel now (2026-07-22 redesign),
// never a lens crammed inside the main track box. Same code-splitting
// rationale as `HoleShotPath` above.
const PuttingZoom = dynamic(
  () => import('@/components/golf/coachhelm/v3/HoleShotPath').then((mod) => mod.PuttingZoom),
  {
    ssr: false,
    loading: () => <Skeleton className="mx-auto aspect-square w-[172px] rounded-fw-md lg:mx-0" />,
  },
);

/** Prettified lie label for the compact shot list — deliberately NOT
 *  imported from `HoleShotPath/index.tsx` (its `LIE_LABEL`): that module is
 *  dynamically imported specifically to keep framer-motion out of this
 *  page's first-load JS, and a static import here for one label map would
 *  quietly defeat that split. */
const LIE_LABEL: Record<Lie | 'other', string> = {
  tee: 'Tee',
  fairway: 'Fairway',
  rough: 'Rough',
  heavy_rough: 'Rough',
  light_rough: 'Rough',
  sand: 'Bunker',
  bunker: 'Bunker',
  green: 'Green',
  fringe: 'Fringe',
  water: 'Water',
  penalty: 'Penalty',
  other: 'Start',
};

function normalizeLieLoose(raw: string | null | undefined): Lie | 'other' {
  const s = (raw ?? '').toLowerCase().trim();
  if (s === 'tee') return 'tee';
  if (s === 'fairway') return 'fairway';
  if (s === 'rough' || s === 'heavy_rough' || s === 'light_rough') return 'rough';
  if (s === 'sand' || s === 'bunker') return 'sand';
  if (s === 'green') return 'green';
  if (s === 'fringe') return 'fringe';
  if (s === 'water' || s === 'penalty' || s === 'hazard') return 'water';
  return 'other';
}

/** One compact row's worth of text for the shot list — "tee→green" /
 *  "putt" (green→green shots are always labeled as putts, per spec) plus an
 *  honest distance string using the SAME lie-is-primary-signal unit rule
 *  `geometry.ts` documents (feet on the green, yards off it). */
function describeShotRow(
  shots: ReviewShotInput[],
  index: number,
): { isPutt: boolean; transition: string; distance: string; isPenalty: boolean } {
  const shot = shots[index]!;
  const lieBeforeRaw = index === 0 ? shot.lie_before : shots[index - 1]?.lie_after;
  const lieBefore = normalizeLieLoose(lieBeforeRaw ?? (index === 0 ? 'tee' : null));
  const lieAfter = normalizeLieLoose(shot.lie_after);
  const isPutt = lieBefore === 'green' && lieAfter === 'green';
  const transition = isPutt ? 'putt' : `${LIE_LABEL[lieBefore]} → ${LIE_LABEL[lieAfter]}`;

  let distance: string;
  if (typeof shot.distance_to_hole_after !== 'number') {
    distance = '—';
  } else if (shot.distance_to_hole_after === 0) {
    distance = 'holed';
  } else {
    const unit = lieAfter === 'green' ? 'ft' : 'yds';
    distance = `${Math.round(shot.distance_to_hole_after)} ${unit}`;
  }

  return { isPutt, transition, distance, isPenalty: !!shot.is_penalty };
}

// -----------------------------------------------------------------------------
// PER-HOLE "EXPECTED VS ACTUAL" NARRATIVE (Wave D, 2026-07-23) — one concise,
// honest Strokes-Gained sentence for the open hole's detail header, e.g.
// "Lost 2.1 strokes here — 1.1 off the tee, 1.0 putting" / "Gained 0.4
// strokes here." Built entirely from the SAME per-shot `sg` already flowing
// into the diagram/badges (`sumHoleStrokesGainedByCategory`,
// `shot-strokes-gained.ts`) — never a second, re-derived number.
// -----------------------------------------------------------------------------

const SG_NARRATIVE_NEAR_ZERO = 0.05; // matches the diagram's own "E"(ven) threshold

const SG_CATEGORY_LABEL: Record<'tee' | 'approach' | 'around_green' | 'putting', string> = {
  tee: 'off the tee',
  approach: 'approach',
  around_green: 'around the green',
  putting: 'putting',
};

export interface HoleSgNarrative {
  text: string;
  tone: 'gain' | 'loss' | 'even';
}

/**
 * Builds the per-hole narrative from `sumHoleStrokesGainedByCategory`'s
 * output. Null-safe: no computable SG on this hole (`sg` itself null, or
 * `sg.total` null — zero shots scored) -> `null`, never a fabricated line;
 * the caller simply omits the row. The breakdown clause names the top TWO
 * non-trivial (`|value| >= 0.05`, the diagram's own near-zero threshold)
 * contributing categories, largest magnitude first — a hole where only ONE
 * category contributed anything computable (e.g. a single clean 1-putt, tee
 * shot unscoreable) skips the redundant breakdown and states just the total,
 * matching this function's own "Gained 0.4 strokes here." short form.
 */
export function formatHoleSgNarrative(sg: HoleStrokesGainedByCategory | null): HoleSgNarrative | null {
  if (!sg || sg.total === null) return null;
  const { total } = sg;

  if (Math.abs(total) < SG_NARRATIVE_NEAR_ZERO) {
    return { text: 'Even strokes gained here.', tone: 'even' };
  }

  const tone: 'gain' | 'loss' = total > 0 ? 'gain' : 'loss';
  const verb = tone === 'gain' ? 'Gained' : 'Lost';
  const headline = `${verb} ${Math.abs(total).toFixed(1)} strokes here`;

  const contributions = (['tee', 'approach', 'around_green', 'putting'] as const)
    .map((category) => ({ category, value: sg[category] }))
    .filter(
      (c): c is { category: 'tee' | 'approach' | 'around_green' | 'putting'; value: number } =>
        typeof c.value === 'number' && Math.abs(c.value) >= SG_NARRATIVE_NEAR_ZERO,
    )
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));

  if (contributions.length < 2) {
    return { text: `${headline}.`, tone };
  }

  const breakdown = contributions
    .slice(0, 2)
    .map((c) => `${Math.abs(c.value).toFixed(1)} ${SG_CATEGORY_LABEL[c.category]}`)
    .join(', ');
  return { text: `${headline} — ${breakdown}.`, tone };
}

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
  shotsByHole: Map<number, ReviewShotInput[]> | null;
  /** The reviewed player's id — used ONLY to fetch their SEASON putt make%
   *  by distance band (`round-review-shots.ts`'s `fetchPlayerPuttMakePct`)
   *  for `PuttingZoom`'s tooltip context line (Wave D, see that module's
   *  doc). Optional/null-safe: omitted entirely, the fetch simply never
   *  fires and the tooltip line is never shown — no crash, no fabricated
   *  data. (`FilmstripReview.tsx` already receives `playerId` as its own
   *  prop; wiring `playerId={playerId}` through to this component is the
   *  one remaining step to activate this end-to-end.) */
  playerId?: string | null;
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
  playerId,
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

  // Season putt make% by distance band (Wave D) — fetched once per player,
  // independent of which hole is open, and threaded into `PuttingZoom`'s
  // tooltip context line below. `playerId` is optional (see the prop's own
  // doc) — the effect simply never fires without one, and the tooltip line
  // stays honestly omitted rather than erroring. `null` while
  // loading/unavailable, matching every other null-safe state in this file.
  const [puttMakePct, setPuttMakePct] = useState<PuttMakePctByBand | null>(null);
  useEffect(() => {
    if (!playerId) {
      setPuttMakePct(null);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    fetchPlayerPuttMakePct(supabase, playerId).then((result) => {
      if (!cancelled) setPuttMakePct(result);
    });
    return () => {
      cancelled = true;
    };
  }, [playerId]);

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

  // Computed once per open hole, shared by the putting-zoom panel AND the
  // "does this hole even have one" check below — see the import comment.
  const openPlot = useMemo(() => {
    if (!openHoleShots || openHoleShots.length === 0) return null;
    return plotHole({ shots: openHoleShots, par: openPar, yardage: openMeta?.yardage ?? null });
  }, [openHoleShots, openPar, openMeta]);
  const hasPuttingZoom = (openPlot?.greenInset.shots.length ?? 0) > 0;

  // Per-hole "expected vs actual" narrative (Wave D) — the open hole's SG
  // sum + category attribution, computed from the SAME per-shot `sg` the
  // diagram/badges already show (never re-derived). `openPar ?? null`
  // matches `sumHoleStrokesGainedByCategory`'s own "no par known" contract.
  const openHoleSg = useMemo(() => {
    if (!openHoleShots || openHoleShots.length === 0) return null;
    return sumHoleStrokesGainedByCategory(openHoleShots, openPar ?? null);
  }, [openHoleShots, openPar]);
  const holeNarrative = formatHoleSgNarrative(openHoleSg);
  // SG magnitude uses the app's Strokes-Gained color language (green gain /
  // warm-amber loss), matching RoundSGSummary.TONE_CLASS + StrokesGainedTornado
  // exactly — NOT the comparative red (`fw-danger`), which is reserved for
  // "below team / vs-field" indicators, so the per-hole line reads as the same
  // metric as the summary total above it.
  const holeNarrativeColorClass =
    holeNarrative?.tone === 'gain'
      ? 'text-fw-success-ink'
      : holeNarrative?.tone === 'loss'
        ? 'text-fw-warning-ink'
        : 'text-text-secondary';

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
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-fw-display text-body-lg font-semibold text-text-primary">Hole {openHole} shot path</p>
              <p className="mt-1 font-fw-sans text-caption text-text-tertiary">Hover or focus a numbered shot to inspect it.</p>
              {/* Per-hole "expected vs actual" narrative (Wave D) — one
                  honest Strokes-Gained sentence, e.g. "Lost 2.1 strokes
                  here — 1.1 off the tee, 1.0 putting." Omitted entirely
                  when SG isn't computable for this hole (never a fabricated
                  line) — see `formatHoleSgNarrative`'s own doc. */}
              {holeNarrative ? (
                <p
                  className={`mt-1 font-fw-mono text-caption font-medium tabular-nums ${holeNarrativeColorClass}`}
                >
                  {holeNarrative.text}
                </p>
              ) : null}
            </div>
            <PressTarget onClick={toggleShotPath} className="shrink-0 rounded-full px-3 py-2 font-fw-sans text-caption font-semibold text-accent-700 hover:bg-accent-50">
              Close
            </PressTarget>
          </div>

          {/* The STAR diagram (col 1) + a slim companion column (col 2:
              putting-zoom, then the compact shot list) — 2026-07-22
              redesign per Nick's verbatim feedback ("markers hard to see",
              "result vs yardage so far apart", "make it bigger, put the
              hole aesthetically there"). A real grid (not a flex row) so
              the diagram gets a genuinely bigger, capped column instead of
              stretching/shrinking with its neighbors; collapses to one
              column below `lg` — diagram, then putting zoom, then the list,
              each centered until `lg` re-introduces the side-by-side row
              and left-aligns col 1. */}
          <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
            <HoleShotPath
              // Remounts on every scrubbed hole change — the fresh mount is
              // what makes the shot-by-shot draw-in (segments → traveling
              // ball → landing dot) replay each time hover/scrub in the
              // filmstrip above opens a different hole here, instead of only
              // playing once for whichever hole happened to open first.
              key={openHole}
              hole_number={openHole}
              par={openPar}
              yardage={openMeta?.yardage ?? null}
              score={openMeta?.score ?? null}
              shots={openHoleShots}
              size="review"
              className="mx-auto w-full max-w-[300px] lg:mx-0 lg:max-w-[360px]"
            />

            <div className="flex min-w-0 flex-col gap-4">
              {hasPuttingZoom && openPlot ? (
                <div className="mx-auto flex flex-col items-center gap-1.5 lg:mx-0 lg:items-start">
                  <PuttingZoom
                    key={openHole}
                    plot={openPlot}
                    puttMakePct={puttMakePct}
                    className="aspect-square w-[172px] shrink-0"
                  />
                  <span className="font-fw-mono text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
                    On the green
                  </span>
                </div>
              ) : null}

              {/* Compact shot list — the core "result vs yardage so far
                  apart" fix: no `justify-between`, no `flex-1` on the
                  transition text, so the distance sits immediately after
                  it instead of pinned to the row's far edge. Only the
                  transition text shrinks/truncates (min-w-0); every other
                  cell is a fixed-width `shrink-0` label. Capped height only
                  kicks in for genuinely long (blow-up) holes — a normal
                  hole's rows render fully with no scroll, no dead space. */}
              <ol className="max-h-[360px] w-full min-w-0 divide-y divide-border-subtle overflow-y-auto rounded-fw-sm border border-border-subtle bg-surface">
                {openHoleShots.map((shot, index) => {
                  const row = describeShotRow(openHoleShots, index);
                  return (
                    <li
                      key={`${shot.shot_number}-${index}`}
                      className="flex items-center gap-2 px-3 py-1.5"
                    >
                      <span className="shrink-0 font-fw-mono text-caption tabular-nums text-text-tertiary">
                        {index + 1}
                      </span>
                      <span className="shrink-0 text-caption text-text-tertiary">·</span>
                      <span
                        className={`min-w-0 truncate font-fw-sans text-caption ${row.isPutt ? 'font-medium text-accent-700' : 'text-text-primary'}`}
                      >
                        {row.transition}
                      </span>
                      <span className="shrink-0 font-fw-mono text-caption tabular-nums text-text-secondary">
                        {row.distance}
                      </span>
                      {row.isPenalty ? (
                        <span className="shrink-0 rounded-full bg-danger/10 px-1.5 py-0.5 text-eyebrow font-semibold uppercase tracking-[0.06em] text-danger">
                          Penalty
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
