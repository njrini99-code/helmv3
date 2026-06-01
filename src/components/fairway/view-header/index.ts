/* ============================================================================
 * Fairway — ViewHeader primitive (public surface)
 * ----------------------------------------------------------------------------
 * The per-page header primitive: optional eyebrow/kicker + Fraunces h1 title +
 * context/metadata line + primary/secondary action slots + an optional compact
 * quiet segmented tab row. Sizes: `default` | `compact`. See ./view-header.tsx
 * for full anatomy. ADDITIVE — nothing existing imports this.
 * ========================================================================== */

export { ViewHeader } from "./view-header";
export type { ViewHeaderProps, ViewHeaderSize } from "./view-header";

export { ViewHeaderSegments } from "./view-header-segments";
export type {
  ViewHeaderSegment,
  ViewHeaderSegmentsProps,
} from "./view-header-segments";
