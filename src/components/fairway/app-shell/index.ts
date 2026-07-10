/**
 * ============================================================================
 * Fairway · app-shell — public barrel (Wave 1, ADDITIVE)
 * ----------------------------------------------------------------------------
 * The structural backbone primitive group. Compose with `<AppShell>`, or use the
 * sub-parts directly when a page needs finer control.
 * ========================================================================== */

export { AppShell, type AppShellProps } from './AppShell';
export { FairwaySidebar, type FairwaySidebarProps, SidebarCollapseContext, useSidebarCollapsed } from './FairwaySidebar';
export { FairwayTopBar, type FairwayTopBarProps } from './FairwayTopBar';
export { FairwayBottomNav, type FairwayBottomNavProps } from './FairwayBottomNav';
export { FairwayHubSubNav, type FairwayHubSubNavProps } from './FairwayHubSubNav';
export {
  FairwayLargeTitleProvider,
  FairwayHeaderSentinel,
  FairwayContentAnchor,
  LargeTitleContext,
  useLargeTitle,
  type FairwayLargeTitleProviderProps,
  type FairwayHeaderSentinelProps,
  type FairwayContentAnchorProps,
  type LargeTitleContextValue,
} from './LargeTitleContext';
export { FairwayLargeTitle, type FairwayLargeTitleProps } from './FairwayLargeTitle';
export { MoreNavSheet, type MoreNavSheetProps } from './MoreNavSheet';
export { MoreSheetFooter, type MoreSheetFooterProps } from './MoreSheetFooter';
export { selectOverflow, summarizeMoreTab, type MoreTabSummary } from './more-nav';
export { RouteTransition, type RouteTransitionProps } from './RouteTransition';
export type {
  NavItem,
  NavSection,
  Breadcrumb,
  ShellUser,
  FairwayIcon,
  ShellLinkComponent,
} from './types';
