'use client';

/**
 * ============================================================================
 * Fairway · command · CommandGlassSurface (thin wrapper, delegates to the
 * canonical `surfaces` GlassSurface)
 * ----------------------------------------------------------------------------
 * The ⌘K command palette's glass panel used to inline its own bespoke warm
 * cream-tinted Liquid Glass recipe here (scoped CSS-in-JS keyed off
 * `[data-fw-glass]`). That recipe has since been superseded by the shared
 * `.fw-frost` material in `surfaces/glass-surface.tsx` (DESIGN-SYSTEM.md
 * §4.3 allow-list, which already names `'command'` as one of the approved
 * surfaces). This file is now a thin wrapper over that canonical primitive
 * with `surface="command"`, so the palette gets the same material everything
 * else on the allow-list gets, instead of a second, drifting implementation.
 *
 * Naming: both this module and `surfaces/glass-surface.tsx` used to declare
 * a component literally named `GlassSurface` (a real symbol collision, not
 * just a filename one — see the disambiguation note in the top-level
 * `fairway/index.ts` barrel). The component itself is now named and exported
 * as `CommandGlassSurface` to resolve that. `./index.ts` still re-exports it
 * under the historical name `GlassSurface` (`export { CommandGlassSurface as
 * GlassSurface } ...`), so no import path or call site — including the
 * top-level barrel's `GlassSurface as CommandGlassSurface` re-export — needs
 * to change.
 *
 * Prop mapping onto the canonical primitive:
 *  - `intensity="strong"` (default) → `tier="modal"`   (same weight the old
 *    `[data-fw-glass="strong"]` variant used for the summoned panel).
 *  - `intensity="regular"`          → `tier="floating"`.
 *  - `sheen` (default `true`)       → `edgeHighlight` (the lit top rim).
 *  - `animateIn={false}` always: `command-menu.tsx` already owns the
 *    palette's own materialize animation on its outer `motion.div`s, so the
 *    inner surface must not animate a second time.
 *  - `padding={null}`: the palette lays out its own header/list/footer
 *    padding; the old local component never added any.
 *
 * The prop type is deliberately narrow (not `HTMLAttributes<HTMLDivElement>`)
 * — the sole caller (`./command-menu.tsx`) only ever passes `intensity`,
 * `className`, and `children`, and the canonical primitive is a
 * `motion.div`, whose event-handler prop types (e.g. `onDrag`) are not
 * structurally compatible with plain DOM `HTMLAttributes`.
 * ============================================================================
 */

import { forwardRef, type ReactNode } from 'react';
import { GlassSurface as FairwayGlassSurface } from '@/components/fairway/surfaces/glass-surface';

export interface GlassSurfaceProps {
  /**
   * `strong` → command palette / modal (more opaque, heavier blur — legible).
   * `regular` → lighter chrome (top bars). Default `strong` for the palette.
   */
  intensity?: 'regular' | 'strong';
  /** Render the inner top specular sheen overlay. Default `true`. */
  sheen?: boolean;
  className?: string;
  children?: ReactNode;
}

/**
 * CommandGlassSurface — the cream-tinted Liquid Glass panel used to float the
 * command palette above the page. Forwards its ref so overlay libraries /
 * focus managers can anchor to it.
 */
export const CommandGlassSurface = forwardRef<HTMLDivElement, GlassSurfaceProps>(
  function CommandGlassSurface(
    { intensity = 'strong', sheen = true, className, children },
    ref,
  ) {
    return (
      <FairwayGlassSurface
        ref={ref}
        surface="command"
        tier={intensity === 'strong' ? 'modal' : 'floating'}
        edgeHighlight={sheen}
        animateIn={false}
        padding={null}
        className={className}
      >
        {children}
      </FairwayGlassSurface>
    );
  },
);
