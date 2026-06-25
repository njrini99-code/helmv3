// =============================================================================
// src/lib/baseball/program-type-variants.ts
//
// Wave 4 / packet: settings-os
//
// THE PROGRAM-TYPE VARIANT ENGINE.
//
// v4 thesis: "BaseballHelm cannot be one generic baseball app with a different
// logo for each market." College / high_school / showcase / juco / academy /
// club share ONE platform and ONE design system, but differ in:
//   - default navigation + surface priority
//   - terminology pack
//   - permission / feature-toggle bundles (distinct DEFAULTS)
//   - public-profile / guardian / recruiting-exposure prominence
//
// This module is the single source of truth for those DIFFERENCES. It is the
// shared architecture with distinct defaults — NOT a shallow text swap and NOT
// a hard-coded fork (the runtime always reads the team's program_type setting,
// then the team's saved baseball_program_settings overrides these defaults).
//
// PURE + ISOMORPHIC: no React, no Supabase, no cookies, no 'use server' /
// 'use client'. Safe to import from server actions, server components, and
// client components alike (mirrors nav-registry.ts).
//
// NO GOLF VOCABULARY anywhere. Terminology is baseball-native.
// =============================================================================

import type {
  BaseballProgramType,
  BaseballProgramSettingsUpdate,
  BaseballPerformanceDepth,
  BaseballDefaultVisibility,
} from '@/lib/types/baseball-settings';

// -----------------------------------------------------------------------------
// Terminology pack — mode-aware labels (v4 §differences: terminology)
// -----------------------------------------------------------------------------

export interface BaseballTerminologyPack {
  /** What the coach landing surface is called for this mode. */
  coachHome: string;
  /** What the player landing surface is called. */
  playerHome: string;
  /** Group of athletes (roster vs event roster). */
  rosterNoun: string;
  /** Calendar entries (games/series vs events). */
  eventNoun: string;
  /** What "exposure" features are called in this mode. */
  exposureNoun: string;
  /** Label for the buyer/program. */
  programNoun: string;
}

// -----------------------------------------------------------------------------
// The variant descriptor — everything that changes per program_type.
// -----------------------------------------------------------------------------

export interface BaseballProgramVariant {
  programType: BaseballProgramType;
  /** Human label for the mode in settings. */
  label: string;
  /** One-line description shown in the program-type picker. */
  description: string;

  /** Coach default landing route id (must exist in nav-registry BaseballNavId). */
  coachDefaultLandingId: string;
  /** Player default landing route id. */
  playerDefaultLandingId: string;

  /**
   * Ordered nav-id priority for this mode's COACH primary nav. The nav-registry
   * stays the master list; this re-orders + emphasizes per mode. Ids not in this
   * list fall to the end in registry order.
   */
  coachNavPriority: string[];
  /** Ordered nav-id priority for this mode's PLAYER primary nav. */
  playerNavPriority: string[];

  /** Mode-aware terminology. */
  terminology: BaseballTerminologyPack;

  /**
   * The DISTINCT default program settings for this mode. Applied once, at first
   * creation of baseball_program_settings, then a coach can override anything.
   * Only the fields that DIFFER from the neutral DB defaults are listed — but we
   * spell out the meaningful ones per mode for auditability.
   */
  defaultSettings: BaseballProgramSettingsUpdate;

  /** Roles that make sense for this mode (v4 §Shared Role Differences). */
  roleTemplates: string[];
}

// -----------------------------------------------------------------------------
// Shared baselines (reduce repetition; each mode overrides what differs).
// -----------------------------------------------------------------------------

const STAFF_ONLY: BaseballDefaultVisibility = 'staff_only';
const PLAYER_VISIBLE: BaseballDefaultVisibility = 'player_visible';
const DEPTH_FULL: BaseballPerformanceDepth = 'full';
const DEPTH_STD: BaseballPerformanceDepth = 'standard';
const DEPTH_LITE: BaseballPerformanceDepth = 'lite';

// =============================================================================
// THE VARIANTS
// =============================================================================

const COLLEGE: BaseballProgramVariant = {
  programType: 'college',
  label: 'College',
  description: 'Team operations: development, prep, academics, travel, staff coordination.',
  coachDefaultLandingId: 'command-center',
  playerDefaultLandingId: 'player-today',
  // v4 College coach primary nav: Command, Signals, Roster, Calendar, Practice,
  // Performance, Stats, Meetings, Imports, Team Ops.
  coachNavPriority: [
    'command-center',
    'staff-decision-room',
    'roster',
    'calendar',
    'practice-planner',
    'performance',
    'stats-center',
    'import-center',
  ],
  // v4 College player: Today, Schedule, Tasks, Practice, Performance, Stats,
  // Profile, then Timeline (the development story sits with the player's own
  // surfaces, right after Profile). Other program modes omit it from their
  // explicit priority, so orderByPriority appends it after the listed entries in
  // stable registry order — no per-mode fork needed.
  playerNavPriority: [
    'player-today',
    'calendar',
    'player-tasks',
    'practice-planner',
    'performance',
    'stats-center',
    'player-profile',
    'player-timeline',
  ],
  terminology: {
    coachHome: 'Command Center',
    playerHome: 'Today',
    rosterNoun: 'Roster',
    eventNoun: 'Game',
    exposureNoun: 'Recruiting',
    programNoun: 'Program',
  },
  defaultSettings: {
    // Strict staff-controlled profile; player Today + lift/check-in enabled.
    players_require_invite: true,
    players_can_self_join: false,
    players_can_edit_profile: false,
    players_can_edit_public_profile: false,
    players_can_view_team_stats: true,
    players_can_self_log_lift: true,
    players_can_self_report_availability: true,
    players_can_upload_video: false,
    players_can_see_ai_summaries: false,
    academics_module_enabled: true,
    travel_module_enabled: true,
    performance_module_depth: DEPTH_FULL,
    recruiting_exposure_enabled: false, // College players never activate exposure.
    public_profiles_enabled: false,
    guardian_access_enabled: false,
    scout_access_enabled: false,
    default_visibility: STAFF_ONLY,
    ai_player_visible_enabled: false,
    ai_require_staff_approval: true,
  },
  roleTemplates: [
    'head_coach',
    'assistant_coach',
    'pitching_coach',
    'hitting_coach',
    'strength_coach',
    'director_of_ops',
    'academic_viewer',
    'player',
    'manager',
    'admin',
  ],
};

const HIGH_SCHOOL: BaseballProgramVariant = {
  programType: 'high_school',
  label: 'High School',
  description: 'Team plus exposure: development, communications, guardians, college interest.',
  coachDefaultLandingId: 'command-center',
  playerDefaultLandingId: 'player-today',
  // v4 HS coach primary: Today, Roster, Schedule, Practice, Stats, Player Profiles,
  // Development, Communications, Showcase, Imports.
  coachNavPriority: [
    'command-center',
    'roster',
    'calendar',
    'practice-planner',
    'stats-center',
    'import-center',
    'performance',
  ],
  // v4 HS player: Today, Schedule, Assignments, Stats, Profile, Showcase.
  playerNavPriority: [
    'player-today',
    'calendar',
    'player-tasks',
    'stats-center',
    'player-profile',
  ],
  terminology: {
    coachHome: 'Team Command',
    playerHome: 'Today',
    rosterNoun: 'Roster',
    eventNoun: 'Game',
    exposureNoun: 'College Interest',
    programNoun: 'Team',
  },
  defaultSettings: {
    // Player profile editing more likely; guardian policies available; exposure on.
    players_require_invite: true,
    players_can_self_join: false,
    players_can_edit_profile: true,
    players_can_edit_public_profile: true,
    players_can_view_team_stats: true,
    players_can_self_log_lift: true,
    players_can_self_report_availability: true,
    players_can_upload_video: true,
    players_can_see_ai_summaries: false,
    academics_module_enabled: false, // simpler academics in HS mode
    travel_module_enabled: false,
    performance_module_depth: DEPTH_LITE, // HS strength is simpler (v4)
    recruiting_exposure_enabled: true, // more prominent than college
    public_profiles_enabled: true,
    guardian_access_enabled: false, // available but a flag, not required (v4)
    guardian_can_view_schedule: true,
    guardian_can_view_announcements: true,
    guardian_can_view_travel: true,
    scout_access_enabled: false,
    default_visibility: STAFF_ONLY,
    ai_player_visible_enabled: false,
    ai_require_staff_approval: true,
  },
  roleTemplates: [
    'head_coach',
    'assistant_coach',
    'player',
    'guardian',
    'team_manager',
    'strength_coach',
    'admin',
  ],
};

const SHOWCASE: BaseballProgramVariant = {
  programType: 'showcase',
  label: 'Showcase Organization',
  description: 'Event + player-profile operations: measurables, video, scout packets.',
  coachDefaultLandingId: 'command-center',
  playerDefaultLandingId: 'player-today',
  // v4 Showcase staff primary: Events, Rosters, Player Profiles, Measurables,
  // Video/Documents, Scout Packets, Imports, Communications, Reports.
  coachNavPriority: [
    'command-center',
    'calendar',
    'roster',
    'stats-center',
    'import-center',
  ],
  // v4 Showcase player: Schedule, Profile, Measurables, Video, Tasks, Interest.
  playerNavPriority: [
    'player-today',
    'calendar',
    'player-tasks',
    'player-profile',
    'stats-center',
  ],
  terminology: {
    coachHome: 'Event Command',
    playerHome: 'Event Today',
    rosterNoun: 'Event Roster',
    eventNoun: 'Showcase',
    exposureNoun: 'Exposure',
    programNoun: 'Organization',
  },
  defaultSettings: {
    // Profile completion + video/measurable upload; public visibility prominent.
    players_require_invite: false, // event registration flows
    players_can_self_join: true,
    players_can_edit_profile: true,
    players_can_edit_public_profile: true,
    players_can_view_team_stats: false, // showcase is individual exposure, not team
    players_can_self_log_lift: false,
    players_can_self_report_availability: true,
    players_can_upload_video: true,
    players_can_see_ai_summaries: false,
    academics_module_enabled: false,
    travel_module_enabled: false,
    performance_module_depth: DEPTH_LITE,
    recruiting_exposure_enabled: true,
    public_profiles_enabled: true,
    guardian_access_enabled: false,
    scout_access_enabled: true, // scout packets are the product
    scout_packet_visibility: 'event_only',
    scout_can_export: false,
    scout_show_unverified_metrics: false, // verified-vs-unverified is core to trust
    default_visibility: PLAYER_VISIBLE, // exposure-oriented
    ai_player_visible_enabled: false,
    ai_require_staff_approval: true,
  },
  roleTemplates: [
    'org_admin',
    'event_director',
    'coach',
    'player',
    'scout_viewer',
    'data_entry_staff',
    'media_staff',
  ],
};

const JUCO: BaseballProgramVariant = {
  programType: 'juco',
  label: 'JUCO',
  description: 'Bridges college operations and transfer exposure.',
  coachDefaultLandingId: 'command-center',
  playerDefaultLandingId: 'player-today',
  // v4 JUCO staff primary: Command, Roster, Calendar, Practice, Performance, Stats,
  // Player Profiles, Transfer Exposure, Imports, Meetings.
  coachNavPriority: [
    'command-center',
    'roster',
    'calendar',
    'practice-planner',
    'performance',
    'stats-center',
    'import-center',
    'staff-decision-room',
  ],
  playerNavPriority: [
    'player-today',
    'calendar',
    'player-tasks',
    'practice-planner',
    'performance',
    'stats-center',
    'player-profile',
  ],
  terminology: {
    coachHome: 'Command Center',
    playerHome: 'Today',
    rosterNoun: 'Roster',
    eventNoun: 'Game',
    exposureNoun: 'Transfer Exposure',
    programNoun: 'Program',
  },
  defaultSettings: {
    // College operations + stronger exposure/recruiting capability (v4).
    players_require_invite: true,
    players_can_self_join: false,
    players_can_edit_profile: true,
    players_can_edit_public_profile: true,
    players_can_view_team_stats: true,
    players_can_self_log_lift: true,
    players_can_self_report_availability: true,
    players_can_upload_video: true,
    players_can_see_ai_summaries: false,
    academics_module_enabled: true,
    travel_module_enabled: true,
    performance_module_depth: DEPTH_FULL,
    recruiting_exposure_enabled: true, // transfer exposure is central
    public_profiles_enabled: true,
    guardian_access_enabled: false,
    scout_access_enabled: false,
    default_visibility: STAFF_ONLY,
    ai_player_visible_enabled: false,
    ai_require_staff_approval: true,
  },
  roleTemplates: [
    'head_coach',
    'assistant_coach',
    'pitching_coach',
    'hitting_coach',
    'strength_coach',
    'director_of_ops',
    'player',
    'manager',
    'admin',
  ],
};

// Academy / Club share the HS-style "development + light exposure" shape but
// without the school academics module. They are real modes, not aliases.
const ACADEMY: BaseballProgramVariant = {
  programType: 'academy',
  label: 'Academy',
  description: 'Development-first training programs with optional exposure.',
  coachDefaultLandingId: 'command-center',
  playerDefaultLandingId: 'player-today',
  coachNavPriority: [
    'command-center',
    'roster',
    'calendar',
    'practice-planner',
    'performance',
    'stats-center',
    'import-center',
  ],
  playerNavPriority: [
    'player-today',
    'calendar',
    'player-tasks',
    'performance',
    'stats-center',
    'player-profile',
  ],
  terminology: {
    coachHome: 'Command Center',
    playerHome: 'Today',
    rosterNoun: 'Athletes',
    eventNoun: 'Session',
    exposureNoun: 'Exposure',
    programNoun: 'Academy',
  },
  defaultSettings: {
    players_require_invite: true,
    players_can_self_join: false,
    players_can_edit_profile: true,
    players_can_edit_public_profile: false,
    players_can_view_team_stats: false,
    players_can_self_log_lift: true,
    players_can_self_report_availability: true,
    players_can_upload_video: true,
    players_can_see_ai_summaries: false,
    academics_module_enabled: false,
    travel_module_enabled: false,
    performance_module_depth: DEPTH_STD,
    recruiting_exposure_enabled: false,
    public_profiles_enabled: false,
    guardian_access_enabled: true, // academies often communicate with parents
    scout_access_enabled: false,
    default_visibility: STAFF_ONLY,
    ai_player_visible_enabled: false,
    ai_require_staff_approval: true,
  },
  roleTemplates: ['head_coach', 'assistant_coach', 'strength_coach', 'player', 'guardian', 'admin'],
};

const CLUB: BaseballProgramVariant = {
  programType: 'club',
  label: 'Club / Travel',
  description: 'Travel-ball team management with guardian communication.',
  coachDefaultLandingId: 'command-center',
  playerDefaultLandingId: 'player-today',
  coachNavPriority: [
    'command-center',
    'roster',
    'calendar',
    'practice-planner',
    'stats-center',
    'import-center',
  ],
  playerNavPriority: ['player-today', 'calendar', 'player-tasks', 'stats-center', 'player-profile'],
  terminology: {
    coachHome: 'Team Command',
    playerHome: 'Today',
    rosterNoun: 'Roster',
    eventNoun: 'Game',
    exposureNoun: 'Exposure',
    programNoun: 'Club',
  },
  defaultSettings: {
    players_require_invite: true,
    players_can_self_join: false,
    players_can_edit_profile: true,
    players_can_edit_public_profile: false,
    players_can_view_team_stats: true,
    players_can_self_log_lift: false,
    players_can_self_report_availability: true,
    players_can_upload_video: true,
    players_can_see_ai_summaries: false,
    academics_module_enabled: false,
    travel_module_enabled: true, // travel ball
    performance_module_depth: DEPTH_LITE,
    recruiting_exposure_enabled: true,
    public_profiles_enabled: false,
    guardian_access_enabled: true,
    scout_access_enabled: false,
    default_visibility: STAFF_ONLY,
    ai_player_visible_enabled: false,
    ai_require_staff_approval: true,
  },
  roleTemplates: ['head_coach', 'assistant_coach', 'player', 'guardian', 'team_manager', 'admin'],
};

// -----------------------------------------------------------------------------
// Registry + accessors
// -----------------------------------------------------------------------------

const VARIANTS: Record<BaseballProgramType, BaseballProgramVariant> = {
  college: COLLEGE,
  high_school: HIGH_SCHOOL,
  showcase: SHOWCASE,
  juco: JUCO,
  academy: ACADEMY,
  club: CLUB,
};

/** The full variant descriptor for a program type (falls back to college). */
export function getProgramVariant(programType: BaseballProgramType | null | undefined): BaseballProgramVariant {
  if (!programType) return COLLEGE;
  return VARIANTS[programType] ?? COLLEGE;
}

/** All variants, for the program-type picker. */
export function listProgramVariants(): BaseballProgramVariant[] {
  return Object.values(VARIANTS);
}

/**
 * The DISTINCT default program settings for a mode. Used once at first
 * baseball_program_settings creation; a coach can override afterward.
 */
export function getDefaultProgramSettings(
  programType: BaseballProgramType,
): BaseballProgramSettingsUpdate {
  return { ...getProgramVariant(programType).defaultSettings };
}

/** Mode-aware terminology pack (never golf vocabulary). */
export function getTerminology(programType: BaseballProgramType): BaseballTerminologyPack {
  return getProgramVariant(programType).terminology;
}

/**
 * Re-order a set of nav ids by this mode's coach priority. Ids not listed in the
 * priority fall to the end in their original order. Used by the shell to make the
 * SAME nav-registry feel mode-appropriate without forking the registry.
 */
export function orderCoachNav(
  programType: BaseballProgramType,
  navIds: string[],
): string[] {
  return orderByPriority(navIds, getProgramVariant(programType).coachNavPriority);
}

/** Re-order a set of nav ids by this mode's player priority. */
export function orderPlayerNav(
  programType: BaseballProgramType,
  navIds: string[],
): string[] {
  return orderByPriority(navIds, getProgramVariant(programType).playerNavPriority);
}

function orderByPriority(ids: string[], priority: string[]): string[] {
  const rank = new Map(priority.map((id, i) => [id, i]));
  return [...ids].sort((a, b) => {
    const ra = rank.has(a) ? rank.get(a)! : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b) ? rank.get(b)! : Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

/**
 * Does this mode meaningfully use a given v4 module by default? Pure helper used
 * by settings UI to highlight which toggles matter for the chosen mode (the
 * toggle still exists in every mode — this only affects emphasis/onboarding).
 */
export function moduleMattersForMode(
  programType: BaseballProgramType,
  module: 'academics' | 'travel' | 'guardian' | 'scout' | 'exposure' | 'performance',
): boolean {
  const d = getProgramVariant(programType).defaultSettings;
  switch (module) {
    case 'academics':
      return d.academics_module_enabled === true;
    case 'travel':
      return d.travel_module_enabled === true;
    case 'guardian':
      return d.guardian_access_enabled === true || programType === 'high_school';
    case 'scout':
      return d.scout_access_enabled === true || programType === 'showcase';
    case 'exposure':
      return d.recruiting_exposure_enabled === true;
    case 'performance':
      return d.performance_module_depth !== 'lite';
    default:
      return false;
  }
}
