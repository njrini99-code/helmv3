// =============================================================================
// src/lib/types/baseball-team-season-settings.ts
//
// Wave 4 / packet: qa-screens (Settings routes coverage)
//
// HAND-WRITTEN TypeScript types for the team-join-policy columns + season table
// added by:
//   supabase/migrations/20260624000095_baseball_team_and_season_settings.sql
//
// Owned by THIS packet (not the generated Database barrel) because the migration
// is WRITTEN, NOT APPLIED — generated types can't be regen'd against an unapplied
// schema. This file is the source of truth for the team/season settings surface
// until the migration lands.
//
// Distinct from baseball-settings.ts (program_type-grain settings document):
// these are the TEAM-grain join policy + the per-season records.
// =============================================================================

// -----------------------------------------------------------------------------
// Team join policy (columns added to baseball_teams)
// -----------------------------------------------------------------------------

/**
 * How new members join the team (v4 §Team Settings).
 *   invite_only    — code shares but each join needs a coach to approve (safest).
 *   code_self_join — a valid join code self-joins immediately.
 *   closed         — roster is locked; no new joins.
 */
export type BaseballInvitePolicy = 'invite_only' | 'code_self_join' | 'closed';

export const BASEBALL_INVITE_POLICIES: readonly BaseballInvitePolicy[] = [
  'invite_only',
  'code_self_join',
  'closed',
] as const;

/** The team-grain join-policy fields (additive on baseball_teams). */
export interface BaseballTeamJoinPolicy {
  invite_policy: BaseballInvitePolicy;
  allow_player_self_join: boolean;
  require_coach_approval: boolean;
}

/** The team-settings surface payload (identity + join policy + join code). */
export interface BaseballTeamSettings extends BaseballTeamJoinPolicy {
  teamId: string;
  teamName: string;
  /** Current join/invite code (null until generated). */
  joinCode: string | null;
}

/** The subset of team-settings a coach may patch via updateTeamJoinSettings. */
export type BaseballTeamJoinPolicyUpdate = Partial<BaseballTeamJoinPolicy>;

// -----------------------------------------------------------------------------
// Season records (baseball_seasons)
// -----------------------------------------------------------------------------

/** Season phase (v4 §Season settings). */
export type BaseballSeasonPhase =
  | 'fall'
  | 'winter'
  | 'preseason'
  | 'in_season'
  | 'postseason'
  | 'summer_showcase';

export const BASEBALL_SEASON_PHASES: readonly BaseballSeasonPhase[] = [
  'fall',
  'winter',
  'preseason',
  'in_season',
  'postseason',
  'summer_showcase',
] as const;

/** Human labels for the season phases (UI). */
export const BASEBALL_SEASON_PHASE_LABELS: Record<BaseballSeasonPhase, string> = {
  fall: 'Fall',
  winter: 'Winter',
  preseason: 'Preseason',
  in_season: 'In Season',
  postseason: 'Postseason',
  summer_showcase: 'Summer / Showcase',
};

export type BaseballSeasonStatus = 'active' | 'archived' | 'upcoming';

export const BASEBALL_SEASON_STATUSES: readonly BaseballSeasonStatus[] = [
  'active',
  'archived',
  'upcoming',
] as const;

export interface BaseballSeason {
  id: string;
  team_id: string;

  // Identity
  label: string;
  phase: BaseballSeasonPhase;
  starts_on: string | null;
  ends_on: string | null;

  // Lifecycle
  status: BaseballSeasonStatus;
  is_current: boolean;

  // Season-specific module toggles (v4 §Season-specific)
  roster_enabled: boolean;
  schedule_enabled: boolean;
  stats_enabled: boolean;
  practice_templates_enabled: boolean;
  lift_groups_enabled: boolean;
  performance_baselines_enabled: boolean;
  player_status_tracking_enabled: boolean;

  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** The season-specific module toggle keys (drives the toggle list UI). */
export type BaseballSeasonModuleKey =
  | 'roster_enabled'
  | 'schedule_enabled'
  | 'stats_enabled'
  | 'practice_templates_enabled'
  | 'lift_groups_enabled'
  | 'performance_baselines_enabled'
  | 'player_status_tracking_enabled';

export const BASEBALL_SEASON_MODULE_TOGGLES: readonly {
  key: BaseballSeasonModuleKey;
  label: string;
  description: string;
}[] = [
  { key: 'roster_enabled', label: 'Roster', description: 'Manage the season roster.' },
  { key: 'schedule_enabled', label: 'Schedule', description: 'Games and calendar for this season.' },
  { key: 'stats_enabled', label: 'Stats', description: 'Track and review performance stats.' },
  {
    key: 'practice_templates_enabled',
    label: 'Practice templates',
    description: 'Build and run practice plans this season.',
  },
  {
    key: 'lift_groups_enabled',
    label: 'Lift groups',
    description: 'Strength groups and lift assignments.',
  },
  {
    key: 'performance_baselines_enabled',
    label: 'Performance baselines',
    description: 'Hold season baselines for performance comparison.',
  },
  {
    key: 'player_status_tracking_enabled',
    label: 'Player status',
    description: 'Track player availability and status this season.',
  },
] as const;

/** Fields accepted when creating a season. */
export interface BaseballSeasonInsert {
  label: string;
  phase?: BaseballSeasonPhase;
  starts_on?: string | null;
  ends_on?: string | null;
  status?: BaseballSeasonStatus;
  is_current?: boolean;
}

/** Fields a coach may patch on an existing season. */
export type BaseballSeasonUpdate = Partial<
  Pick<
    BaseballSeason,
    | 'label'
    | 'phase'
    | 'starts_on'
    | 'ends_on'
    | 'status'
    | 'is_current'
    | 'roster_enabled'
    | 'schedule_enabled'
    | 'stats_enabled'
    | 'practice_templates_enabled'
    | 'lift_groups_enabled'
    | 'performance_baselines_enabled'
    | 'player_status_tracking_enabled'
  >
>;
