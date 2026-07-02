/**
 * pressable.ts — press + hover physics as Tailwind class strings.
 *
 * The CSS-only half of the interaction layer. Where {@link Reveal} and
 * {@link HoverReveal} need framer-motion, most tappable Living Annual
 * surfaces (a `PlayerRowPlate` row, a `RecruitCard`, a paper tile) only need
 * a press-down and a lane-ink hover tint — no JS, no `'use client'`, works
 * straight out of a server component. `cn()` composes and dedupes classes
 * the same way every other atom in the kit does (twMerge under the hood).
 *
 * NOT for `<Button>` — Button already owns its own haptic + `active:scale`
 * system (`src/components/ui/button.tsx`). Reach for `pressableClass` only
 * on bespoke Living Annual surfaces that aren't a `<Button>`: rows, cards,
 * chips, paper tiles.
 *
 * Depth stays letterpress, not drop-shadow (spec §4.3) — `pressableClass`
 * never adds elevation shadow; `lift` is a 1px translate only, and only for
 * standalone tappable tiles (most rows/cards should pass `lift: false`, the
 * default, and rely on the tint + press-down alone).
 *
 * ```tsx
 * <div className={pressableClass({ ink: 'pursuit' })}>…</div>
 * <button className={pressableClass({ ink: 'team', lift: true })}>…</button>
 * ```
 */
import { cn } from '@/lib/utils';

export type PressableInk = 'team' | 'pursuit';

// Full utility names (Tailwind JIT-safe) — mirrors HairlineRule's RULE_BG /
// PlayerRowPlate's INK_TEXT/FOCUS maps so the same ink resolves to the same
// literal classes everywhere in the kit.
const HOVER_TINT: Record<PressableInk, string> = {
  team: 'hover:bg-grade-plus/[0.05]',
  pursuit: 'hover:bg-pursuit/[0.05]',
};

const FOCUS_RING: Record<PressableInk, string> = {
  team: 'focus-visible:ring-grade-plus',
  pursuit: 'focus-visible:ring-pursuit',
};

export interface PressableOptions {
  /** Lane ink for the hover tint + focus ring (default `'team'`). */
  ink?: PressableInk;
  /** Faint lane-ink hover wash (default `true`). */
  tint?: boolean;
  /**
   * A restrained -1px hover lift for standalone tappable tiles (KPI cards,
   * `GradeStamp` rails). Most rows in a wall should leave this `false` — a
   * whole column of lifting rows reads busy; the tint alone is enough.
   * Hover-only (`(hover: hover)`) so touch never gets a stuck-lifted tile.
   */
  lift?: boolean;
  className?: string;
}

/**
 * Press-down + hover-tint classes for a tappable Living Annual surface.
 * `active:scale-[0.98]` on {@link EASE_PRESS}'s duration (120ms down / 75ms
 * release, matching `<Button>`'s release timing so a page never mixes two
 * different "letting go" speeds).
 */
export function pressableClass({ ink = 'team', tint = true, lift = false, className }: PressableOptions = {}): string {
  return cn(
    'cursor-pointer outline-none',
    'transition-[transform,background-color,border-color] duration-[120ms] ease-[cubic-bezier(0.4,0,0.2,1)]', // EASE_PRESS
    'active:scale-[0.98] active:duration-75',
    tint && HOVER_TINT[ink],
    lift && '[@media(hover:hover)]:hover:-translate-y-px',
    'focus-visible:ring-2',
    FOCUS_RING[ink],
    className,
  );
}
