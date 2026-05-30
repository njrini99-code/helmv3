'use client';

/**
 * ============================================================================
 * Fairway · command · GlassSurface (SELF-CONTAINED, restrained Liquid Glass)
 * ----------------------------------------------------------------------------
 * The ONE premium material, applied here to the command palette panel — an
 * allow-listed surface per DESIGN-SYSTEM.md §4.3 ("Command palette (⌘K) — the
 * summoned overlay panel, `--blur-strong`"). It is a floating chrome layer
 * ABOVE content, never a card texture.
 *
 * Why local: the task scopes this group to `src/components/fairway/command/`
 * with NO top-level shared files other agents might collide on. So we inline
 * the warm cream-tinted glass recipe here (matching the locked recipe in the
 * design system) and use only the Fairway design tokens (--fw-*).
 *
 * Recipe (warm cream tint over cream, never white-over-gray):
 *  - background: --fw-glass-bg-strong (~78% cream) for legibility,
 *  - backdrop-filter: blur(--fw-blur-strong) saturate(--fw-glass-saturate),
 *  - bright specular top rim + faint warm base edge (inset box-shadows),
 *  - shadow-raise so it floats off the page,
 *  - a ::before top sheen via an absolutely-positioned span (Safari/FF safe),
 *  - contain + isolation to scope repaint (perf),
 *  - mobile blur downshift (<=768px) via the `data-glass` hook + media query.
 *
 * A11y fallbacks (Apple's own lesson): under prefers-reduced-transparency or
 * forced-colors the glass collapses to an opaque warm surface with a soft
 * shadow — handled here with inline <style> using ONLY this component's scoped
 * `data-fw-glass` attribute so it can't leak to the rest of the app.
 * ============================================================================
 */

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface GlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * `strong` → command palette / modal (more opaque, heavier blur — legible).
   * `regular` → lighter chrome (top bars). Default `strong` for the palette.
   */
  intensity?: 'regular' | 'strong';
  /** Render the inner top specular sheen overlay. Default `true`. */
  sheen?: boolean;
}

/**
 * The scoped CSS for the glass material. Keyed entirely off `[data-fw-glass]`
 * so it is inert everywhere except on this component's own root element.
 */
const GLASS_CSS = `
[data-fw-glass]{
  position:relative;
  border-radius:var(--fw-radius-lg);
  isolation:isolate;
  contain:layout paint style;
  border:1px solid var(--fw-glass-border);
  -webkit-backdrop-filter:blur(var(--fw-blur-glass)) saturate(var(--fw-glass-saturate));
  backdrop-filter:blur(var(--fw-blur-glass)) saturate(var(--fw-glass-saturate));
  background:var(--fw-glass-bg);
  box-shadow:
    inset 0 1px 0 0 var(--fw-glass-highlight),
    inset 0 -1px 0 0 var(--fw-glass-border-bot),
    var(--fw-shadow-raise);
}
[data-fw-glass="strong"]{
  -webkit-backdrop-filter:blur(var(--fw-blur-strong)) saturate(var(--fw-glass-saturate));
  backdrop-filter:blur(var(--fw-blur-strong)) saturate(var(--fw-glass-saturate));
  background:var(--fw-glass-bg-strong);
  box-shadow:
    inset 0 1px 0 0 var(--fw-glass-highlight),
    inset 0 -1px 0 0 var(--fw-glass-border-bot),
    var(--fw-shadow-modal);
}
[data-fw-glass-sheen]{
  content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;z-index:0;
  background:linear-gradient(180deg,
    rgb(255 255 255 / 0.28) 0%,
    rgb(255 255 255 / 0.04) 22%,
    transparent 60%);
}
@media (max-width:768px){
  [data-fw-glass]{
    -webkit-backdrop-filter:blur(var(--fw-blur-mobile)) saturate(var(--fw-glass-saturate));
    backdrop-filter:blur(var(--fw-blur-mobile)) saturate(var(--fw-glass-saturate));
  }
}
@media (prefers-reduced-transparency:reduce){
  [data-fw-glass]{
    background:var(--fw-color-surface);
    -webkit-backdrop-filter:none;backdrop-filter:none;
    border-color:var(--fw-color-border-subtle);
    box-shadow:var(--fw-shadow-soft);
  }
  [data-fw-glass-sheen]{display:none;}
}
@media (forced-colors:active){
  [data-fw-glass]{
    background:Canvas;-webkit-backdrop-filter:none;backdrop-filter:none;
    border:1px solid CanvasText;box-shadow:none;
  }
  [data-fw-glass-sheen]{display:none;}
}
`;

/**
 * GlassSurface — the cream-tinted Liquid Glass panel used to float the command
 * palette above the page. Forwards its ref so overlay libraries / focus
 * managers can anchor to it.
 */
export const GlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(
  function GlassSurface(
    { intensity = 'strong', sheen = true, className, children, ...rest },
    ref,
  ) {
    return (
      <div
        ref={ref}
        data-fw-glass={intensity}
        data-slot="glass-surface"
        className={cn('text-text-primary', className)}
        {...rest}
      >
        {/* Scoped material CSS — inert outside [data-fw-glass]. */}
        <style>{GLASS_CSS}</style>
        {sheen ? <span data-fw-glass-sheen aria-hidden="true" /> : null}
        {/* Content sits above the sheen layer. */}
        <div className="relative z-[1] flex min-h-0 flex-col">{children}</div>
      </div>
    );
  },
);
