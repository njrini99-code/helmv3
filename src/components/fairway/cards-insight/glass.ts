/**
 * ============================================================================
 * Fairway · cards-insight · local glass recipe (RESTRAINED Liquid Glass)
 * ----------------------------------------------------------------------------
 * Inline implementation of the §4.3 warm Liquid Glass recipe, scoped to THIS
 * primitive folder so cards-insight is self-contained (the task forbids
 * creating a shared top-level glass file that other agents might also create).
 *
 * Glass is the ONE premium accent material. In this group it appears on EXACTLY
 * the `hero` InsightCard — "the one Liquid-Glass card per view" (§4.3 item 3).
 * `default` and `compact` cards stay matte `bg-surface`.
 *
 * The recipe is cream-tinted over cream (never white-over-gray), floats off the
 * page with `--fw-shadow-raise`, carries a specular top rim + a faint green
 * accent ring (the hero "breath"), and collapses to an opaque matte surface
 * under `prefers-reduced-transparency` / `forced-colors` (Apple's own a11y
 * lesson). `contain` + `isolation` scope its repaint for perf.
 *
 * It is delivered as an inline `style` object (typed `CSSProperties`) + a small
 * className so it needs no global stylesheet edits and never touches the live
 * app's CSS. All values resolve to the `--fw-*` tokens already in
 * src/styles/design-tokens.css.
 * ============================================================================
 */

import type { CSSProperties } from 'react';

/** Inline style implementing the warm Regular-glass material (hero only). */
export const heroGlassStyle: CSSProperties = {
  background: 'var(--fw-glass-bg)',
  WebkitBackdropFilter:
    'blur(var(--fw-blur-glass)) saturate(var(--fw-glass-saturate))',
  backdropFilter: 'blur(var(--fw-blur-glass)) saturate(var(--fw-glass-saturate))',
  // bright specular top rim + the faint green accent ring (the hero breath)
  borderColor: 'var(--fw-glass-accent-ring)',
  boxShadow: [
    'inset 0 1px 0 0 var(--fw-glass-highlight)', // specular top line ("light source")
    'inset 0 -1px 0 0 var(--fw-glass-border-bot)', // faint warm base edge
    'var(--fw-shadow-raise)', // floats off the page
    '0 0 0 1px var(--fw-glass-accent-ring)', // green breath ring
  ].join(', '),
  isolation: 'isolate',
  // scope repaint for perf; `style` is the most reliable cross-browser path
  contain: 'layout paint style',
};

/**
 * Stable marker class the fallback stylesheet targets. Kept as a constant so
 * the class string and the injected CSS can never drift apart.
 */
export const HERO_GLASS_CLASS = 'fw-hero-glass';

/**
 * Classes that pair with `heroGlassStyle`:
 *  - the marker class (for the reduced-transparency / forced-colors fallback)
 *  - the cheap universal top sheen via a `::before` pseudo (Safari/FF too,
 *    no backdrop-filter dependency), expressed as arbitrary Tailwind variants
 *    so the everyday case needs NO global CSS.
 */
export const heroGlassClassName = [
  HERO_GLASS_CLASS,
  'relative isolate overflow-hidden',
  'border', // border-color comes from heroGlassStyle (accent ring)
  // cheap universal top sheen (works in Safari/FF too — no backdrop-filter dep)
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:content-['']",
  'before:bg-[linear-gradient(180deg,rgb(255_255_255/0.28)_0%,rgb(255_255_255/0.04)_22%,transparent_60%)]',
].join(' ');

/**
 * Required §4.3 a11y fallback CSS for the hero glass — Apple's own lesson.
 * Under `prefers-reduced-transparency: reduce` (incl. iOS "Reduce Transparency"
 * in Capacitor WebView) and `forced-colors: active`, glass collapses to an
 * opaque matte surface with depth carried by `--fw-shadow-soft`, and the sheen
 * is dropped. Injected once via a scoped <style> from the component so this
 * primitive stays fully self-contained (no global stylesheet edits).
 */
export const HERO_GLASS_FALLBACK_CSS = `
.${HERO_GLASS_CLASS}{will-change:transform}
@media (prefers-reduced-transparency: reduce){
  .${HERO_GLASS_CLASS}{
    background:var(--fw-color-surface)!important;
    -webkit-backdrop-filter:none!important;backdrop-filter:none!important;
    border-color:var(--fw-color-border-subtle)!important;
    box-shadow:var(--fw-shadow-soft)!important;
  }
  .${HERO_GLASS_CLASS}::before{display:none!important}
}
@media (forced-colors: active){
  .${HERO_GLASS_CLASS}{background:Canvas!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
  .${HERO_GLASS_CLASS}::before{display:none!important}
}`;

