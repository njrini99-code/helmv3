/**
 * MarketingAnimGate — removes the flash of settled content on the marketing pages.
 *
 * THE BUG. The entrance choreography on `/` and `/products` is applied by JS
 * AFTER hydration. The server HTML ships every entrance target in its FINAL
 * state — no opacity, no transform, nothing hidden — so the browser paints the
 * finished page and the animation code then hides it and replays the entrance.
 * Measured on a production build at 1440x900:
 *
 *     /          painted settled 154ms -> blanked 330ms   (176ms visible, then gone)
 *     /          at 4x CPU:      280ms -> 693ms           (413ms)
 *     /products  painted settled  89ms -> blanked 201ms   (112ms)
 *     /products  at 4x CPU:      262ms -> 644ms           (382ms)
 *
 * On /products all 20 `[data-reveal]` blocks blank at once; on / the hero
 * headline tears back to clipped glyphs mid-word. That "here, then gone, then
 * here again" is the fidgety-on-load report, and it is NOT dev-only.
 *
 * THE FIX. Make the hidden state part of the FIRST PAINT rather than a
 * post-hydration correction. This blocking inline script — same idiom as
 * ThemeScript, and in the root <head> for the same reason: a raw script in a
 * nested layout is re-rendered on soft navigation, where it does not execute —
 * stamps `marketing-anim-gate` on <html> before the body is painted. The
 * matching CSS (globals.css, "MARKETING ENTRANCE GATE") hides the entrance
 * targets. Each animation system then writes its own inline hidden state during
 * hydration and MarketingShell drops the class, so nothing is ever visible in
 * between.
 *
 * TWO DELIBERATE ESCAPES, because a gate that can stick is worse than a flash:
 *
 *   1. No JS -> no script -> no class -> the markup stays fully visible. That
 *      is exactly the progressive-enhancement contract `useProductsEffects`
 *      already documents ("markup renders fully visible; JS hides then
 *      reveals"); this file only fixes WHEN the hide happens, never whether the
 *      no-JS reader gets the content.
 *   2. If hydration never lands (bad bundle, an error mid-hydration) the class
 *      would otherwise stick forever and the page would stay blank, so the
 *      script also drops it on a timer. 5s sits well beyond real hydration even
 *      on a slow phone — firing it early would re-create the exact flash this
 *      file exists to remove, so the timer is a backstop, not a schedule.
 *
 * The CSS is scoped to `[data-reveal]` / `[data-fw-reveal]` / `[data-hero]`,
 * which exist only on the marketing surfaces, so the class sitting on <html>
 * for a dashboard route matches nothing at all.
 *
 * Server component (no 'use client'): it only emits markup.
 */

// Minified IIFE, wrapped in try/catch so nothing here can ever block paint.
const GATE = `(function(){try{var r=document.documentElement;r.classList.add('marketing-anim-gate');setTimeout(function(){r.classList.remove('marketing-anim-gate')},5000);}catch(e){}})();`;

export function MarketingAnimGate() {
  return <script dangerouslySetInnerHTML={{ __html: GATE }} suppressHydrationWarning />;
}
