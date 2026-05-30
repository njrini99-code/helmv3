/**
 * ============================================================================
 * Fairway · app-shell — public barrel (Wave 1, ADDITIVE)
 * ----------------------------------------------------------------------------
 * The structural backbone primitive group. Compose with `<AppShell>`, or use the
 * sub-parts directly when a page needs finer control.
 * ========================================================================== */

export { AppShell, type AppShellProps } from './AppShell';
export { FairwaySidebar, type FairwaySidebarProps } from './FairwaySidebar';
export { FairwayTopBar, type FairwayTopBarProps } from './FairwayTopBar';
export { RouteTransition, type RouteTransitionProps } from './RouteTransition';
export type {
  NavItem,
  NavSection,
  Breadcrumb,
  ShellUser,
  FairwayIcon,
  ShellLinkComponent,
} from './types';
