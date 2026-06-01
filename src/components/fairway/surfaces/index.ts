/**
 * ============================================================================
 * Fairway · surfaces — public barrel
 * ----------------------------------------------------------------------------
 * The warm matte card system (DESIGN-SYSTEM.md §4) that replaces the 30-file
 * `bg-white/70 backdrop-blur-xl` inline-glass anti-pattern:
 *
 *   Surface       — THE matte card (Header / Body / Footer slots; interactive)
 *   Inset         — sunken nested well (rows / evidence inside a card)
 *   Elevated      — opaque floating panel (menus / popovers, no glass)
 *   GlassSurface  — the RESTRAINED cream-tinted Liquid Glass, allow-list only
 *
 * ADDITIVE ONLY — import from '@/components/fairway/surfaces'.
 * ========================================================================== */

export {
  Surface,
  SurfaceHeader,
  SurfaceBody,
  SurfaceFooter,
  Inset,
  Elevated,
} from './surface';
export type {
  SurfaceProps,
  SurfaceHeaderProps,
  SurfaceElevation,
  SurfacePadding,
  InsetProps,
  ElevatedProps,
} from './surface';

export { GlassSurface } from './glass-surface';
export type { GlassSurfaceProps, GlassSurfaceKind } from './glass-surface';
