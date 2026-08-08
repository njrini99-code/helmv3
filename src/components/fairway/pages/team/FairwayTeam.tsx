'use client';

/**
 * ============================================================================
 * Fairway · Team · FairwayTeam  (ROLE ROUTER · ADDITIVE · FLAG-GATED)
 * ----------------------------------------------------------------------------
 * The single entry point the flag-on /golf/dashboard/team page renders. It
 * forwards to the right role surface based on the data the server page already
 * fetched — exactly mirroring the legacy page's coach-vs-player fork:
 *
 *   • COACH  → FairwayTeamSettings  (editable identity + invite code; the legacy
 *              TeamSettingsClient surface — uses createTeam / updateTeam /
 *              regenerateJoinCode VERBATIM)
 *   • PLAYER → FairwayTeamInfo      (read-only program view — coach, announcements,
 *              tasks, roster, team info; the legacy TeamInfoPlayer surface)
 *
 * PRESENTATION-ONLY. No data is fetched or reshaped here; the page passes the
 * same props the legacy components received. Renders inside a `.fairway-ds`
 * scope on a `bg-canvas` page (the page supplies the scope wrapper).
 * ========================================================================== */

import {
  FairwayTeamSettings,
  type FairwayTeamSettingsCoach,
  type FairwayTeamSettingsTeam,
  type FairwayProgramTeam,
} from './FairwayTeamSettings';
import { FairwayTeamInfo, type FairwayTeamInfoProps } from './FairwayTeamInfo';

export type FairwayTeamProps =
  | {
      role: 'coach';
      coach: FairwayTeamSettingsCoach;
      team: FairwayTeamSettingsTeam | null;
      /** Every team this coach staffs, when the program runs more than one. */
      programTeams?: FairwayProgramTeam[];
    }
  | ({ role: 'player' } & FairwayTeamInfoProps);

export function FairwayTeam(props: FairwayTeamProps) {
  if (props.role === 'coach') {
    return <FairwayTeamSettings coach={props.coach} team={props.team} programTeams={props.programTeams} />;
  }

  const { role: _role, ...playerProps } = props;
  return <FairwayTeamInfo {...playerProps} />;
}
