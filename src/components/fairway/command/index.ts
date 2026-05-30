/**
 * ============================================================================
 * Fairway · command — global find-and-act primitive group (ADDITIVE)
 * ----------------------------------------------------------------------------
 * SearchField  → warm matte keyboard-first search input (inline entry point).
 * CommandMenu  → the summoned ⌘K palette (cmdk engine inside warm Liquid Glass):
 *                grouped results, recent items, zero-state suggestions, fully
 *                keyboardable.
 * GlassSurface → the local restrained Liquid-Glass panel the palette floats in.
 *
 * Self-contained: no cross-folder imports beyond `@/lib/utils` (cn) and the
 * Fairway tokens/utilities. Styled to render correctly inside a `.fairway-ds`
 * scope on a `bg-canvas` page.
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

export { GlassSurface } from './glass-surface';
export type { GlassSurfaceProps } from './glass-surface';
