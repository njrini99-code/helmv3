/**
 * ============================================================================
 * Fairway · pages · team — barrel (Team Info / Team Settings redesign)
 * ----------------------------------------------------------------------------
 * The flag-gated "Fairway" rebuild of the legacy /golf/dashboard/team route.
 * PRESENTATION-ONLY: all data + mutations are reused verbatim from the legacy
 * loaders and `@/app/golf/actions/teams`.
 *
 *   FairwayTeam          — role router (coach → settings, player → info)
 *   FairwayTeamSettings  — COACH editable identity + invite code surface
 *   FairwayTeamInfo      — PLAYER read-only program view
 *
 * ADDITIVE + GATED — consumed only behind the isRedesignEnabled() fork in
 * `team/page.tsx`. Renders inside a `.fairway-ds` scope on a bg-canvas page.
 * ========================================================================== */

export { FairwayTeam } from './FairwayTeam';
export type { FairwayTeamProps } from './FairwayTeam';

export { FairwayTeamSettings } from './FairwayTeamSettings';
export type {
  FairwayTeamSettingsProps,
  FairwayTeamSettingsCoach,
  FairwayTeamSettingsTeam,
} from './FairwayTeamSettings';

export { FairwayTeamInfo } from './FairwayTeamInfo';
export type { FairwayTeamInfoProps } from './FairwayTeamInfo';
