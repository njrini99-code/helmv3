/**
 * ============================================================================
 * Fairway · command — global find-and-act primitive group (ADDITIVE)
 * ----------------------------------------------------------------------------
 * SearchField  → warm matte keyboard-first search input (inline entry point).
 * CommandMenu  → the summoned ⌘K palette (cmdk engine inside warm Liquid Glass):
 *                grouped results, recent items, zero-state suggestions, fully
 *                keyboardable.
 * GlassSurface → thin `command`-scoped wrapper (internally `CommandGlassSurface`,
 *                re-exported here as `GlassSurface` for backward compat) over
 *                the canonical `surfaces` GlassSurface (`surface="command"`)
 *                that floats the palette.
 *
 * Mostly self-contained: `command-menu.tsx` and `search-field.tsx` only reach
 * for `@/lib/utils` (cn) and the Fairway tokens/utilities; `glass-surface.tsx`
 * is the one intentional exception, delegating to `../surfaces/glass-surface`
 * (the canonical Liquid-Glass primitive) rather than keeping a second,
 * drifting glass recipe local to this folder. Styled to render correctly
 * inside a `.fairway-ds` scope on a `bg-canvas` page.
 * ============================================================================
 */

export { SearchField } from './search-field';
export type { SearchFieldProps } from './search-field';

export { CommandMenu } from './command-menu';
export type {
  CommandMenuProps,
  CommandItem,
  CommandGroup,
} from './command-menu';

export { CommandGlassSurface as GlassSurface } from './glass-surface';
export type { GlassSurfaceProps } from './glass-surface';
