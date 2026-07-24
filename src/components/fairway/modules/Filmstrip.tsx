'use client';

/**
 * ============================================================================
 * Fairway · modules · Filmstrip — the 18-hole scrub strip (mockup `.strip`)
 * ----------------------------------------------------------------------------
 * One column per hole. Each column IS a `HoleShotPath` (size="strip") — the
 * premium per-hole SVG reconstruction (ball-flight arcs, lie-colored dots,
 * hazards planted at the player's logged endpoints) — not a plain bar chart.
 * A hole with no logged shots still renders its turf/pin visual (a real,
 * pretty empty state) rather than a placeholder bar. Score-vs-par tone
 * (birdie/bogey/double, from the shared `holeBar()` helper so the round-
 * review page and any future consumer read damage identically) survives as
 * a colored ring around each strip cell, layered UNDER the lie-based shot
 * coloring rather than replacing it.
 *
 * Hover, focus, and click all scrub — the same "point at a hole, see the
 * story" interaction the mockup wires via three listeners on each `.fcol`
 * button. `PressTarget` (not `HoleShotPath`'s own `onClick`) owns the
 * interactive semantics here so each column is exactly ONE button — never a
 * button nested inside a button.
 *
 * Each cell also forwards its own hover/focus `isActive` state into
 * `HoleShotPath` as the controlled `active` prop — a `false → true` edge
 * there triggers that cell's own shot-by-shot draw-in replay at strip scale
 * (segments only, no tooltip — too small to read one). Cheap by design:
 * across all 18 simultaneous instances, only the ONE currently-active cell
 * ever mounts an animated path; every other cell renders a plain static one.
 *
 * Entrance: columns grow in on mount, staggered left→right. 18 siblings at
 * the canonical 70ms stagger step would blow the "<600ms total" motion
 * budget (17 × 70ms + duration alone is >1s), so this uses a compressed,
 * capped step tuned for a wide row instead — see `FILM_STAGGER_STEP` below.
 * `HoleShotPath` is dynamically imported with `ssr: false`: `geometry.ts`'s
 * straight-drift jitter uses `Math.random()`, which would otherwise diverge
 * between server and client render and trip a hydration mismatch — the same
 * reason `ReviewHero` already lazy-loads it for the tap-to-open detail.
 * ========================================================================== */

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { LazyMotion, m } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';
import { useReducedMotionGuard, EASE_CINEMATIC, DURATION } from '@/lib/coachhelm/v3/motion';
import { cn } from '@/lib/utils';
import { PressTarget } from '../controls';
import { Skeleton } from '../feedback/Skeleton';
import { holeBar } from './logic';
import type { FilmstripHole, FilmstripProps } from './types';
import type { ShotInput } from '@/components/golf/coachhelm/v3/HoleShotPath/types';

const HoleShotPath = dynamic(
  () => import('@/components/golf/coachhelm/v3/HoleShotPath').then((mod) => mod.HoleShotPath),
  {
    ssr: false,
    loading: () => <Skeleton className="h-28 w-7 rounded-2xl md:h-32 md:w-8" />,
  },
);

type HoleTone = ReturnType<typeof holeBar>['tone'];

/** Score-vs-par tone → ring color around the strip cell. `double` maps to
 *  the app's canonical `danger` (#FF3B30) rather than a raw red — the
 *  banned-color rule reserves #DC2626-family reds for `danger`/`destructive`
 *  only. */
const RING_TONE: Record<HoleTone, string> = {
  par: 'ring-1 ring-warm-300/70',
  birdie: 'ring-2 ring-accent-500',
  bogey: 'ring-2 ring-fw-warning',
  double: 'ring-2 ring-danger',
};

// 18 columns at the canonical 70ms sibling stagger would take the reveal
// well past the "<600ms total" motion budget on its own. A tighter, capped
// step keeps the same left→right wave feel while the whole row settles in
// well under it (cap × step + entrance duration ≈ 12×20ms + 280ms = 520ms).
const FILM_STAGGER_STEP = 0.02;
const FILM_STAGGER_CAP = 12;
function filmStagger(i: number): number {
  return Math.min(i, FILM_STAGGER_CAP) * FILM_STAGGER_STEP;
}

export interface FilmstripComponentProps extends FilmstripProps {
  /** Per-hole logged shots, keyed by hole number. A hole absent from the map
   *  (or with an empty array) renders `HoleShotPath`'s honest turf/pin empty
   *  state — never a fabricated visual. `undefined`/`null` while the ledger
   *  is still loading is equivalent to "no shots yet" at this scale. */
  shotsByHole?: Map<number, ShotInput[]> | null;
}

/**
 * The hole-by-hole scrub strip. Presentational only — the caller owns the
 * detail panel/story that reacts to `onScrub`.
 */
export function Filmstrip({ holes, activeHole, onScrub, shotsByHole }: FilmstripComponentProps) {
  const prefersReducedMotion = useReducedMotionGuard();
  const [internalActive, setInternalActive] = useState<number | null>(activeHole ?? null);
  const active = activeHole ?? internalActive;

  function scrub(hole: FilmstripHole) {
    setInternalActive(hole.n);
    onScrub?.(hole);
  }

  return (
    // `overflow-x-auto` + a per-column `minmax(1.875rem, …)` floor (30px,
    // inside the ~28-32px tap-target band) so 18 holes scroll horizontally
    // on narrow viewports instead of being crushed unreadable. On desktop
    // the available width already exceeds 18 × 30px, so the `1fr` half of
    // each track wins and columns render full-width and equal, unchanged.
    <div className="overflow-x-auto" data-slot="filmstrip-scroll">
      <LazyMotion features={loadFeatures}>
        <div
          role="group"
          aria-label="Hole by hole"
          data-slot="filmstrip"
          className="grid items-end gap-2"
          style={{ gridTemplateColumns: `repeat(${holes.length}, minmax(1.875rem, 1fr))` }}
        >
          {holes.map((hole, i) => {
            const { tone } = holeBar(hole);
            const isActive = active === hole.n;
            const shots = shotsByHole?.get(hole.n) ?? [];
            return (
              <PressTarget
                key={hole.n}
                aria-label={`Hole ${hole.n}, par ${hole.par}, score ${hole.score}`}
                aria-pressed={isActive}
                onMouseEnter={() => scrub(hole)}
                onFocus={() => scrub(hole)}
                onClick={() => scrub(hole)}
                className={cn(
                  'flex min-w-[1.875rem] flex-col items-center gap-2 rounded-fw-sm px-0 pb-1 transition-colors duration-150',
                  'hover:bg-surface-tint',
                  isActive && 'bg-surface-tint',
                )}
              >
                <m.div
                  initial={prefersReducedMotion ? false : { opacity: 0, scaleY: 0.6, y: 6 }}
                  animate={{ opacity: 1, scaleY: 1, y: 0 }}
                  transition={{ duration: DURATION.short, delay: filmStagger(i), ease: EASE_CINEMATIC }}
                  style={{ transformOrigin: 'bottom' }}
                >
                  <HoleShotPath
                    hole_number={hole.n}
                    par={hole.par === 3 || hole.par === 4 || hole.par === 5 ? hole.par : undefined}
                    score={hole.score}
                    shots={shots}
                    size="strip"
                    ringClassName={RING_TONE[tone]}
                    active={isActive}
                  />
                </m.div>
                <span className="font-fw-mono text-eyebrow font-normal text-text-tertiary tabular-nums">
                  {hole.n}
                </span>
              </PressTarget>
            );
          })}
        </div>
      </LazyMotion>
    </div>
  );
}
