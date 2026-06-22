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

/** Status families shared by StatusPill / Badge / FilterPill semantics. */
export type FwStatusTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';
