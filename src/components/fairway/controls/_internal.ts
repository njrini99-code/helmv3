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
 * The Fairway focus-visible ring. A green (`accent-500`) 2px ring with 2px
 * offset — visible on cream surfaces; the design system's base layer brightens
 * it to `accent-400` + a cream halo inside the `.on-dark` (sidebar) scope, so
 * we use the `border-focus` token (= accent-500) and let the scope handle dark.
 *
 * Uses `ring-offset-canvas` so the offset gap matches the warm page beneath.
 */
export const fwFocusRing =
  'outline-none focus-visible:ring-2 focus-visible:ring-border-focus ' +
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
  'duration-[180ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none';

/** Status families shared by StatusPill / Badge / FilterPill semantics. */
export type FwStatusTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';
