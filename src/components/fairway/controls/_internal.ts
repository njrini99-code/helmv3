/**
 * ============================================================================
 * Fairway · controls · internal helpers (LOCAL to the controls group)
 * ----------------------------------------------------------------------------
 * Tiny shared utilities used only by the Fairway "controls" family. Kept inside
 * this folder on purpose so the controls group is self-contained and never
 * collides with helpers other primitive agents might add at a shared top level.
 *
 * These rely ONLY on the locked Fairway tokens/utilities (tailwind.config.ts +
 * src/styles/design-tokens.css) and `cn()` from @/lib/utils. They render
 * correctly inside a `.fairway-ds` scope on a `bg-canvas` page.
 * ========================================================================== */

/**
 * The Fairway focus-visible ring. A green 2px ring with 2px offset — visible on
 * cream surfaces; the design system's base layer brightens it to `accent-400` +
 * a cream halo inside the `.on-dark` (sidebar) scope, which handles dark.
 *
 * P421: the ring color is `accent-600` (darker green), NOT the `border-focus`
 * token (= accent-500). Solid accent-500 vs the warm canvas is only ~3.1:1 and
 * the OKLCH-rendered green measures ~2.67:1 (FAILS WCAG 2.2 non-text 3:1).
 * accent-600 (≈4:1+ vs canvas) clears 3:1 with margin across canvas/surface/
 * sunken/elevated and the OKLCH render path. The brand green stays accent-500
 * for fills/markers; only the focus indicator is darkened here.
 *
 * Uses `ring-offset-canvas` so the offset gap matches the warm page beneath.
 */
export const fwFocusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-accent-600 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas';

/**
 * Disabled contract shared by every interactive control: 50% opacity, no
 * pointer, no hover. (Spec §7.1 interactive-state contract.)
 */
export const fwDisabled =
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none';

/**
 * Slow, cinematic color/transform transition (spec §7.1: `--dur-fast` 180ms,
 * `--ease-soft`). Never the cold instant <150ms tell.
 */
export const fwTransition =
  'transition-[color,background-color,border-color,box-shadow,transform,opacity] ' +
  '[transition-duration:180ms] [transition-timing-function:cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none';

/**
 * The Fairway press response — the ONE tactile language for "I felt that".
 *
 * Settle 0.5px down plus a hair of scale, spring-timed only on `:active` so the
 * soft overshoot reads as a physical key-press while hover keeps the calm base
 * curve. Collapsed under reduced motion.
 *
 * This lived inline in `button.tsx` alone, so every other control in the family
 * was silently exempt — `SelectablePill`, the primitive behind the shot-progress
 * strip and the club / result / break / slope selectors, acknowledged a tap with
 * nothing but a colour swap. On a phone held at arm's length in sunlight, with a
 * glove on, a colour swap is not confirmation: the player taps again. Extracted
 * here so the two cannot drift and so a press feels identical everywhere.
 */
export const fwPress =
  'active:translate-y-[0.5px] active:scale-[0.98] active:[transition-timing-function:var(--fw-ease-spring)] ' +
  'motion-reduce:active:translate-y-0 motion-reduce:active:scale-100';

/**
 * The press response for LARGE surfaces — a bento cell, a signal row, a
 * filmstrip column, a whole card.
 *
 * Deliberately NOT `fwPress`. That curve is tuned for a control you can span
 * with a thumb: 0.98 on a 44px pill travels ~0.9px and reads as a crisp key.
 * The same 0.98 across a 360px-wide card travels 4px per edge and reads as a
 * wobble — the surface appears to shrink away from the finger rather than take
 * its weight. So the scale is gentler and the shadow does the work instead:
 * the surface settles from its resting elevation onto the page, which is what
 * "pressed" looks like physically.
 *
 * Paired with `hoverOnlyWhenSupported` (tailwind.config.ts), touch devices see
 * only this and never a stuck hover lift.
 */
export const fwPressSurface =
  'active:scale-[0.994] active:shadow-flat active:brightness-[0.985] ' +
  'active:[transition-duration:110ms] active:[transition-timing-function:var(--fw-ease-spring)] ' +
  'motion-reduce:active:scale-100 motion-reduce:active:brightness-100';

/** Status families shared by StatusPill / Badge / FilterPill semantics. */
export type FwStatusTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';
