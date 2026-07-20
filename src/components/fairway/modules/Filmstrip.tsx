'use client';

/**
 * ============================================================================
 * Fairway · modules · Filmstrip — the 18-hole scrub strip (mockup `.strip`)
 * ----------------------------------------------------------------------------
 * One column per hole, bar geometry + tone from the shared `holeBar()`
 * helper (`logic.ts`) so the round-review page and any future consumer read
 * damage identically. Hover, focus, and click all scrub — the same "point at
 * a hole, see the story" interaction the mockup wires via three listeners
 * on each `.fcol` button.
 * ========================================================================== */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { holeBar } from './logic';
import type { FilmstripHole, FilmstripProps } from './types';

type HoleTone = ReturnType<typeof holeBar>['tone'];

/** Bar tone → fill color. `double` maps to the app's canonical `danger`
 *  (#FF3B30) rather than the mockup's raw oklch red — the banned-color rule
 *  reserves #DC2626-family reds for `danger`/`destructive` only. */
const BAR_TONE: Record<HoleTone, string> = {
  par: 'bg-warm-300',
  birdie: 'bg-accent-500',
  bogey: 'bg-fw-warning',
  double: 'bg-danger',
};

/**
 * The hole-by-hole scrub strip. Presentational only — the caller owns the
 * detail panel/story that reacts to `onScrub`.
 */
export function Filmstrip({ holes, activeHole, onScrub }: FilmstripProps) {
  const [internalActive, setInternalActive] = useState<number | null>(activeHole ?? null);
  const active = activeHole ?? internalActive;

  function scrub(hole: FilmstripHole) {
    setInternalActive(hole.n);
    onScrub?.(hole);
  }

  return (
    <div
      role="group"
      aria-label="Hole by hole"
      data-slot="filmstrip"
      className="grid h-[6.75rem] items-end gap-1"
      style={{ gridTemplateColumns: `repeat(${holes.length}, minmax(0, 1fr))` }}
    >
      {holes.map((hole) => {
        const { heightPx, tone } = holeBar(hole);
        const isActive = active === hole.n;
        return (
          <button
            key={hole.n}
            type="button"
            aria-label={`Hole ${hole.n}, par ${hole.par}, score ${hole.score}`}
            aria-pressed={isActive}
            onMouseEnter={() => scrub(hole)}
            onFocus={() => scrub(hole)}
            onClick={() => scrub(hole)}
            className={cn(
              'flex h-full flex-col items-center justify-end gap-1 rounded-fw-sm px-0 pb-1 transition-colors duration-150',
              'hover:bg-surface-tint motion-reduce:transition-none',
              'outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
              isActive && 'bg-surface-tint',
            )}
          >
            <span
              aria-hidden="true"
              style={{ height: `${heightPx}px` }}
              className={cn('min-h-[4px] w-[70%] rounded-sm', BAR_TONE[tone])}
            />
            <span className="font-fw-mono text-eyebrow font-normal text-text-tertiary tabular-nums">
              {hole.n}
            </span>
          </button>
        );
      })}
    </div>
  );
}
