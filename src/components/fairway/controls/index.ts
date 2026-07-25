/**
 * ============================================================================
 * Fairway · controls — public barrel
 * ----------------------------------------------------------------------------
 * The "controls" primitive family for the Fairway warm-premium design system.
 * Small, consistent, tactile interactive primitives. ADDITIVE — opted into only
 * by redesigned (`.fairway-ds`) subtrees; the live app is untouched.
 *
 *   Button / IconButton  — primary | secondary | ghost | danger, sizes, busy
 *   Segmented            — quiet compact single-select segment control
 *   Tabs (+List/Trigger/Content) — underline section-nav tabs
 *   StatusPill           — tinted status indicator with optional live dot
 *   FilterPill           — toggleable filter pill (aria-pressed)
 *   Badge / Chip         — count/tag token; Chip is removable
 *   Avatar / AvatarGroup — image + initials fallback + presence + stack
 *   Toolbar              — the one quiet search+filters+actions row (matte at
 *                          rest, restrained glass when stuck; bulk-action slot)
 * ========================================================================== */

export { Button, IconButton } from './button';
export { PressTarget, type PressTargetProps } from './press-target';
export type {
  ButtonProps,
  IconButtonProps,
  FwButtonVariant,
  FwButtonSize,
  FwIconButtonVariant,
  FwIconButtonSize,
} from './button';

export {
  Segmented,
  SegmentedPill,
  segmentedTrackClassName,
  segmentedItemClassName,
  TRACK_SUNKEN_SHADOW as SEGMENTED_TRACK_SUNKEN_SHADOW,
} from './segmented';
export type { SegmentedProps, SegmentedOption, SegmentedPillProps } from './segmented';

export { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';
export type { TabsProps, TabsTriggerProps } from './tabs';

export { StatusPill } from './status-pill';
export type { StatusPillProps } from './status-pill';

export { FilterPill } from './filter-pill';
export type { FilterPillProps } from './filter-pill';

export { SelectablePill } from './selectable-pill';
export type { SelectablePillProps } from './selectable-pill';

export { Badge, Chip } from './badge';
export type { BadgeProps, ChipProps } from './badge';

export { Avatar, AvatarGroup } from './avatar';
export type { AvatarProps, AvatarGroupProps, AvatarSize, AvatarStatus } from './avatar';

export { PlayerIdentity } from './PlayerIdentity';
export type { PlayerIdentityProps, PlayerIdentitySize } from './PlayerIdentity';

export { Toolbar, ToolbarIconButton } from './Toolbar';
export type {
  ToolbarProps,
  ToolbarViewToggleProps,
  ToolbarFilterMenuProps,
  ToolbarFilterOption,
} from './Toolbar';

export type { FwStatusTone } from './_internal';
