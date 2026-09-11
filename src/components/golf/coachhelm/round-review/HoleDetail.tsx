'use client';

/**
 * ============================================================================
 * HoleDetail — one hole's shot reconstruction, opened from the stage
 * ----------------------------------------------------------------------------
 * Lifted verbatim out of the retired `ReviewHero` when Round review moved to
 * the field-sheet composition (round-review.v3.md). Nothing about the detail
 * itself changed: the `HoleShotPath` diagram is the star in its own column, a
 * slim companion column carries the putting zoom and the compact shot list,
 * and the header states the hole's Strokes Gained in one honest sentence.
 *
 * Both entry points on the page — a column of the `HoleField` stage and a
 * row of the hole-by-hole table — open THIS panel for the same hole, so the
 * selection lives above them in the composition root, not in here.
 *
 * The two heavy children stay dynamically imported so framer-motion and the
 * SVG reconstruction never land in the review's first-load JS.
 * ========================================================================== */

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/client';
import { PressTarget, Skeleton } from '@/components/fairway';
import type { Lie } from '@/components/golf/coachhelm/v3/HoleShotPath/types';
// `plotHole` is pure math (no framer-motion, no client-only APIs, SSR-safe —
// see geometry.ts's own doc comment) so it is safe to import statically,
// unlike the two components below. Computed ONCE per open hole and shared by
// both the emptiness check (does this hole even have a putting zoom?) and
// the `PuttingZoom` panel itself, instead of each side re-deriving it.
import { plotHole } from '@/components/golf/coachhelm/v3/HoleShotPath/geometry';
import {
  fetchPlayerPuttMakePct,
  type ReviewShotInput,
  type PuttMakePctByBand,
} from './round-review-shots';
import { sumHoleStrokesGainedByCategory, type HoleStrokesGainedByCategory } from './shot-strokes-gained';

const HoleShotPath = dynamic(
  () => import('@/components/golf/coachhelm/v3/HoleShotPath').then((mod) => mod.HoleShotPath),
  {
    ssr: false,
    loading: () => (
      <Skeleton className="mx-auto aspect-[100/200] w-full max-w-[300px] rounded-fw-md lg:mx-0 lg:max-w-[360px]" />
    ),
  },
);

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
  const transition = isPutt ? 'putt' : `${LIE_LABEL[lieBefore]} to ${LIE_LABEL[lieAfter]}`;

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
  return { text: `${headline}: ${breakdown}.`, tone };
}

export interface HoleDetailProps {
  hole: number;
  par: number | null;
  yardage: number | null;
  score: number | null;
  shots: ReviewShotInput[];
  /** The reviewed player's id — used ONLY to fetch their SEASON putt make%
   *  by distance band for `PuttingZoom`'s tooltip context line. Optional and
   *  null-safe: without one the fetch never fires and the line is omitted. */
  playerId?: string | null;
  onClose: () => void;
}

export function HoleDetail({ hole, par, yardage, score, shots, playerId, onClose }: HoleDetailProps) {
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

  const safePar = par === 3 || par === 4 || par === 5 ? par : undefined;

  // Computed once per open hole, shared by the putting-zoom panel AND the
  // "does this hole even have one" check below — see the import comment.
  const plot = useMemo(() => {
    if (shots.length === 0) return null;
    return plotHole({ shots, par: safePar, yardage });
  }, [shots, safePar, yardage]);
  const hasPuttingZoom = (plot?.greenInset.shots.length ?? 0) > 0;

  const holeSg = useMemo(
    () => (shots.length === 0 ? null : sumHoleStrokesGainedByCategory(shots, safePar ?? null)),
    [shots, safePar],
  );
  const narrative = formatHoleSgNarrative(holeSg);
  // SG magnitude uses the app's Strokes-Gained color language (green gain /
  // warm-amber loss) — NOT the comparative red, which is reserved for
  // "below team / vs-field" indicators.
  const narrativeColorClass =
    narrative?.tone === 'gain'
      ? 'text-fw-success-ink'
      : narrative?.tone === 'loss'
        ? 'text-fw-warning-ink'
        : 'text-text-secondary';

  if (shots.length === 0) return null;

  return (
    <div data-slot="hole-detail" className="min-w-0 border-t border-border-subtle bg-surface-tint p-4 sm:p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-fw-display text-body-lg font-semibold text-text-primary">Hole {hole} shot path</p>
          <p className="mt-1 font-fw-sans text-caption text-text-tertiary">
            Hover or focus a numbered shot to inspect it.
          </p>
          {narrative ? (
            <p className={`mt-1 font-fw-mono text-caption font-medium tabular-nums ${narrativeColorClass}`}>
              {narrative.text}
            </p>
          ) : null}
        </div>
        <PressTarget
          onClick={onClose}
          className="shrink-0 rounded-full px-3 py-2 font-fw-sans text-caption font-semibold text-accent-700 hover:bg-accent-50"
        >
          Close
        </PressTarget>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:items-start">
        <HoleShotPath
          // Remounts on every hole change — the fresh mount is what makes the
          // shot-by-shot draw-in replay each time a different hole opens.
          key={hole}
          hole_number={hole}
          par={safePar}
          yardage={yardage}
          score={score}
          shots={shots}
          size="review"
          className="mx-auto w-full max-w-[300px] lg:mx-0 lg:max-w-[360px]"
        />

        <div className="flex min-w-0 flex-col gap-4">
          {hasPuttingZoom && plot ? (
            <div className="mx-auto flex flex-col items-center gap-1.5 lg:mx-0 lg:items-start">
              <PuttingZoom key={hole} plot={plot} puttMakePct={puttMakePct} className="aspect-square w-[172px] shrink-0" />
              <span className="font-fw-mono text-eyebrow uppercase tracking-[0.1em] text-text-tertiary">
                On the green
              </span>
            </div>
          ) : null}

          {/* Compact shot list — the transition text and its distance sit
              directly next to each other rather than pinned to opposite row
              edges. Only the transition text shrinks; every other cell is a
              fixed-width `shrink-0` label. */}
          <ol className="max-h-[360px] w-full min-w-0 divide-y divide-border-subtle overflow-y-auto rounded-fw-sm border border-border-subtle bg-surface">
            {shots.map((shot, index) => {
              const row = describeShotRow(shots, index);
              return (
                <li key={`${shot.shot_number}-${index}`} className="flex items-center gap-2 px-3 py-1.5">
                  <span className="shrink-0 font-fw-mono text-caption tabular-nums text-text-tertiary">{index + 1}</span>
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
  );
}
