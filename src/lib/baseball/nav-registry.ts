// =============================================================================
// src/lib/baseball/nav-registry.ts
//
// Wave 3 / packet P3.3 — SINGLE SOURCE OF TRUTH for BaseballHelm navigation.
//
// EVERY Phase-1 BaseballHelm feature declares its nav entry here, ONCE. No
// feature vertical (Player Today, Stats Center, Import Center, Practice Planner,
// Performance, Staff Decision Room, etc.) should ever edit the sidebar or the
// mobile bottom-nav directly — they add a row to BASEBALL_NAV_REGISTRY and the
// sidebar + mobile nav + shell pick it up automatically.
//
// This module is intentionally PURE + ISOMORPHIC:
//   - no 'use server' / 'use client'
//   - no Supabase, no cookies, no React
//   - only data + pure helper functions
// so it can be imported from server components (to resolve the visible nav once
// on the server) AND from client components (sidebar.tsx, dashboard-shell.tsx)
// without dragging server-only code into the client bundle.
//
// SECURITY NOTE: filtering the nav here is a UX affordance ONLY. It hides links
// a user cannot use. It is NOT an access-control boundary. Every gated route is
// independently protected server-side by middleware (Wave 2) + server-action
// capability checks (withBaseballAction + requireBaseballCapability). Never rely
// on this registry to keep a player out of a staff route.
// =============================================================================

import type { ComponentType, SVGProps } from 'react';
import type { BaseballCapability } from './capabilities';
import type { ActiveBaseballRole } from './active-context-shared';
import type { BaseballProgramType } from '@/lib/types/baseball-settings';
import {
  getProgramVariant,
  orderCoachNav,
  orderPlayerNav,
} from './program-type-variants';

import {
  IconLayers,
  IconHome,
  IconUsers,
  IconCalendar,
  IconUser,
  IconChartBar,
  IconUpload,
  IconClipboardList,
  IconDumbbell,
  IconBrain,
  IconGauge,
  IconSettings,
  IconBuilding,
  IconShieldAlert,
  IconShieldCheck,
  IconCheckCircle2,
  IconClock,
  IconMessage,
  IconTrendingUp,
  IconBell,
  IconTarget,
  IconNote,
  IconFolder,
  IconAirplane,
  IconStar,
  IconBookmark,
  IconVideo,
  IconGraduationCap,
  IconLayoutGrid,
  IconChart,
  IconBolt,
  IconFlag,
  IconMapPin,
} from '@/components/icons';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Who an entry is for. Mirrors ActiveBaseballRole plus `'both'` for shared
 * surfaces (e.g. Roster, Stats Center) that coaches and players both reach.
 */
export type BaseballNavRole = ActiveBaseballRole | 'both';

/** Stable identifier for a Phase-1 feature. Used as React keys + test anchors. */
export type BaseballNavId =
  | 'command-center'
  | 'signals'
  | 'player-today'
  | 'roster'
  | 'calendar'
  | 'player-tasks'
  | 'player-profile'
  | 'player-passport'
  | 'player-timeline'
  | 'stats-center'
  | 'import-center'
  | 'practice-planner'
  | 'practice-effectiveness'
  | 'postgame-review'
  | 'performance'
  | 'staff-decision-room'
  | 'staff-settings'
  | 'program-settings'
  // --- Previously orphaned routes now registered ---
  | 'analytics'
  | 'announcements'
  | 'pipeline'
  | 'discover'
  | 'documents'
  | 'travel'
  | 'player-dev-plan'
  | 'dev-plans'
  | 'player-journey'
  | 'player-lift'
  | 'player-college-interest'
  | 'colleges'
  | 'compare'
  | 'comparisons'
  | 'scout-packets'
  | 'watchlist'
  | 'videos'
  | 'academics'
  | 'camps'
  | 'events'
  | 'organization'
  | 'program'
  | 'player-readiness'
  | 'teams'
  | 'player-activate'
  | 'team';

/**
 * Icon contract shared by sidebar (`<icon size={18} className=... />`) and
 * mobile nav (`<icon className=... />`). Kept loose (extra SVG props allowed)
 * so the @/components/icons set (IconProps extends React.SVGAttributes) is
 * assignable. Both consumers only pass `size` and `className`.
 */
export type BaseballNavIcon = ComponentType<
  SVGProps<SVGSVGElement> & { size?: number }
>;

/**
 * The shape EVERY feature vertical must produce to appear in BaseballHelm nav.
 * Verticals build their route to match `href` exactly.
 */
export interface BaseballNavEntry {
  /** Stable id (React key, test anchor, telemetry). */
  id: BaseballNavId;
  /** Human label rendered in the sidebar + mobile nav. */
  label: string;
  /**
   * Optional player-facing override for `label`, used by SHARED ('both') entries
   * that the player nav spec names differently from the coach nav. The canonical
   * example is Calendar / Team Ops: coaches see "Calendar", but the player's
   * 5-item nav spec (07_tab_architecture_v2/recommended_final_navigation.md →
   * Today, Schedule, Tasks, Performance, My Profile) names it "Schedule".
   * getVisibleBaseballNav substitutes this when ctx.role === 'player' so the
   * registry stays the single source of truth and consumers (sidebar.tsx,
   * dashboard-shell.tsx) need no role-aware logic. Coaches always see `label`.
   */
  playerLabel?: string;
  /**
   * Optional player-facing override for `href`, used by SHARED ('both') entries
   * whose route DIVERGES by role. The canonical case is Stats: the `stats-center`
   * surface is staff-only (its page server-redirects any non-coach away), while
   * the player's genuine stats depth surface lives at /baseball/dashboard/my-stats
   * (MyStatsClient — season line, trends, game-vs-practice, session history).
   * getVisibleBaseballNav substitutes this when ctx.role === 'player' so the
   * single "Stats" slot the player nav spec + program-type playerNavPriority
   * already reserve (via the `stats-center` id) lands players on their OWN stats
   * page instead of a dead-end redirect — keeping the registry the single source
   * of truth and consumers (sidebar.tsx, dashboard-shell.tsx) role-unaware.
   * Coaches always use `href`.
   */
  playerHref?: string;
  /** Absolute route. Always starts with `/baseball`. Verticals build to match. */
  href: string;
  /** Icon component (GolfHelm icon set in @/components/icons). */
  icon: BaseballNavIcon;
  /** Audience: 'coach' | 'player' | 'both'. */
  role: BaseballNavRole;
  /**
   * Capability required to SEE the entry, or `null` for entries every member of
   * the matching role can reach (Command Center, Player Today, own Profile).
   * When set, the resolved staff capability map must have this key === true.
   * Players are never asked for a capability (capabilities are a staff concept);
   * a player only ever sees role 'player' | 'both' entries with `null` here.
   */
  requiredCapability: BaseballCapability | null;
  /**
   * When set, the coach must hold at least one of these capabilities to see the
   * entry. Mutually exclusive with requiredCapability for a given entry (#408).
   */
  requiredAnyCapabilities?: readonly BaseballCapability[];
  /** When true, render the unread-message badge (messaging lives outside this set). */
  showUnreadBadge?: boolean;
  /**
   * Nav section. 'primary' = main team/feature group; 'secondary' = the "More"
   * group (settings/program). Sidebar groups by this; mobile nav ignores it.
   */
  section: 'primary' | 'secondary';
  /**
   * When set, the entry is only visible when the active team's program_type is
   * in this list (#367 — showcase-only org surfaces).
   */
  allowedProgramTypes?: readonly BaseballProgramType[];
}

/**
 * Resolved context the filter helper needs. Built once (server preferred) from
 * getActiveBaseballContext() (role) + resolveBaseballCapabilities() (caps).
 * `capabilities` is only consulted for coaches; for players it may be empty.
 */
export interface BaseballNavContext {
  role: ActiveBaseballRole;
  /** Fully-resolved capability map (every key present). Empty/partial for players. */
  capabilities: Partial<Record<BaseballCapability, boolean>>;
  /**
   * The active team's program_type (college / high_school / showcase / juco /
   * academy / club). Resolved server-side from the active team. When present, the
   * visible nav is RE-ORDERED by the mode's surface priority (program-type-
   * variants.ts) and the default landing is derived from the mode — so switching
   * program mode actually changes navigation order + landing, not just which
   * settings-defaults were seeded. Optional: when absent (golf, or pre-resolve),
   * the registry falls back to declaration order (college-neutral).
   */
  programType?: BaseballProgramType | null;
}

// -----------------------------------------------------------------------------
// THE REGISTRY — every Phase-1 feature, declared up front, exactly once.
// -----------------------------------------------------------------------------
//
// hrefs are the canonical routes from WAVE_BUILD_PLAN.json (route-group parens
// are stripped from URLs by Next.js, so e.g. (player-dashboard)/player/today
// resolves to /baseball/player/today).
//
//   Command Center        coach   /baseball/dashboard/command-center   (W4, exists)
//   Player Today          player  /baseball/player/today               (W4)
//   Roster                both    /baseball/dashboard/roster           (exists)
//   Calendar / Team Ops   both    /baseball/dashboard/calendar         (exists)
//   Player Profile        player  /baseball/dashboard/profile          (exists)
//   Stats Center          both    /baseball/dashboard/stats-center     (W7)
//   Import Center         coach   /baseball/dashboard/import           (W6)
//   Practice Planner      both    /baseball/dashboard/practice         (W8)
//   Performance           both    /baseball/dashboard/performance      (W9)
//   Staff Decision Room   coach   /baseball/dashboard/decision-room    (W11)
//   Staff Settings        coach   /baseball/dashboard/settings/staff   (W11)
//   Program Settings      coach   /baseball/dashboard/settings/program (W12)
// -----------------------------------------------------------------------------

// Showcase-style org surfaces (#367) — hidden from college/HS/JUCO program types.
const SHOWCASE_ORG_PROGRAM_TYPES = ['showcase', 'academy', 'club'] as const satisfies readonly BaseballProgramType[];

export const BASEBALL_NAV_REGISTRY: readonly BaseballNavEntry[] = [
  // --- Daily loops (no capability gate beyond role) ----------------------------
  {
    id: 'command-center',
    label: 'Command Center',
    href: '/baseball/dashboard/command-center',
    icon: IconLayers,
    role: 'coach',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'signals',
    label: 'Signals',
    href: '/baseball/dashboard/signals',
    icon: IconShieldAlert,
    role: 'coach',
    // Staff triage workspace. Visibility ungated for staff (the read model +
    // RLS are the real gate); write affordances gated on can_manage_stats
    // inside the page. Players never see it (role 'coach').
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'player-today',
    label: 'Today',
    href: '/baseball/player/today',
    icon: IconHome,
    role: 'player',
    requiredCapability: null,
    section: 'primary',
  },

  // --- Shared team surfaces ----------------------------------------------------
  {
    id: 'roster',
    label: 'Roster',
    href: '/baseball/dashboard/roster',
    icon: IconUsers,
    // COACH-ONLY. The /baseball/dashboard/roster surface is the staff roster
    // MANAGEMENT workspace: its read model (read-models/roster.ts → isTeamStaff)
    // authorizes staff only, and RosterClient renders add-player / lineup /
    // export affordances. Advertising it to players routed them straight into a
    // "You do not have permission to view this team roster" wall (QA nav dead-end
    // — the nav pointed a role at a page it could never use). Players reach their
    // teammates/day-to-day surfaces through Today, Schedule, and the Team hub
    // (announcements / tasks / documents) instead; there is no player-facing
    // roster-management page, so this entry is correctly staff-scoped.
    role: 'coach',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    // Player nav spec names this surface "Schedule" (item #2 of the 5-item player
    // nav). Coaches keep "Calendar" (item #3 of the coach primary nav). The shared
    // route is identical; only the label differs by role.
    playerLabel: 'Schedule',
    href: '/baseball/dashboard/calendar',
    icon: IconCalendar,
    // Calendar / Team Ops — spec item #3 of the final coach primary nav and the
    // player's "Schedule" (#2). Shared team-operations surface: games, practices,
    // travel, meetings, and the conflict/communication layer. Read-and-write for
    // coaches (event lifecycle gated server-side), read for players (their own
    // schedule + RSVP). Visibility ungated by role — the page itself shows only
    // what RLS + the role's read model permit (no staff-only/private rows leak to
    // players). Label kept role-neutral ("Calendar") so it reads cleanly on the
    // player's compact nav; the broader "Team Ops" depth is the page's concern.
    role: 'both',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'player-tasks',
    label: 'Tasks',
    href: '/baseball/dashboard/tasks',
    icon: IconCheckCircle2,
    // Player nav spec item #3 ("Tasks"). The /baseball/dashboard/tasks route
    // already exists and is player-reachable, but had no nav entry — players
    // could not reach their assignments/to-dos from the sidebar or mobile nav.
    // Player-only: this entry surfaces the player's own assigned tasks. The page
    // itself shows only what RLS + the player read model permit (no staff-only or
    // private rows leak). Coaches reach tasks through Calendar / Team Ops + the
    // command surfaces, so this stays role 'player' to keep the coach nav lean.
    role: 'player',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'player-profile',
    label: 'My Profile',
    href: '/baseball/dashboard/profile',
    icon: IconUser,
    role: 'player',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'player-passport',
    label: 'Passport',
    href: '/baseball/player/passport',
    icon: IconShieldCheck,
    // Full source-backed player proof packet. This is the polished self-view
    // under the player route group; coach/scout versions remain deep-linked
    // from player profile/scout-packet surfaces.
    role: 'player',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'player-timeline',
    label: 'My Timeline',
    href: '/baseball/player/timeline',
    icon: IconClock,
    // The PLAYER half of the source -> signal -> action -> timeline -> outcome
    // loop: the player's OWN visibility-filtered development story (team events +
    // their own player_only coach notes; never staff_only). Player-only by role.
    // Ungated by capability — getPlayerTimeline + RLS are the real boundary, and
    // the player can only ever see their own self-scoped, viewer-filtered feed.
    role: 'player',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'stats-center',
    label: 'Stats Center',
    // Coaches: the staff-only, team-wide Stats Center (its page server-redirects
    // any non-coach). Players: their OWN stats depth surface at /dashboard/my-stats
    // (MyStatsClient) — the season line, trend + game-vs-practice charts, and
    // session history that Player Today only previews inline. The player nav spec
    // and every program-type playerNavPriority already reserve this single "Stats"
    // slot via this id; the playerLabel/playerHref overrides make it land on the
    // player's real page instead of the staff redirect. Without this, the player's
    // Stats nav entry was a dead-end click and my-stats was orphaned.
    playerLabel: 'My Stats',
    href: '/baseball/dashboard/stats-center',
    playerHref: '/baseball/dashboard/my-stats',
    icon: IconChartBar,
    role: 'both',
    // Coaches managing stats need can_manage_stats; players view their own.
    // Visibility ungated (read), write-gated server-side.
    requiredCapability: null,
    section: 'primary',
  },

  // --- Coach feature verticals (capability-gated) ------------------------------
  {
    id: 'import-center',
    label: 'Import Center',
    href: '/baseball/dashboard/import',
    icon: IconUpload,
    role: 'coach',
    requiredCapability: 'can_manage_imports',
    section: 'primary',
  },
  {
    id: 'practice-planner',
    label: 'Practice Planner',
    playerLabel: 'Practice',
    href: '/baseball/dashboard/practice',
    playerHref: '/baseball/player/practice',
    icon: IconClipboardList,
    role: 'both',
    // Coaches need can_manage_practice to plan; players see the published plan.
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'practice-effectiveness',
    label: 'Practice Effectiveness',
    href: '/baseball/dashboard/practice-effectiveness',
    icon: IconGauge,
    role: 'coach',
    // Staff-only coaching intelligence: did practice transfer to performance?
    // Reviews blend game/scrimmage/practice scopes and carry staff confounders,
    // so this is gated on can_manage_practice (the read model enforces it too).
    requiredCapability: 'can_manage_practice',
    section: 'primary',
  },
  {
    id: 'postgame-review',
    label: 'Postgame Review',
    href: '/baseball/dashboard/postgame',
    icon: IconClipboardList,
    role: 'coach',
    // Staff-only: turns a completed game's box score into source-cited action
    // items. Generating/managing is a stats-analysis action; gate on
    // can_manage_stats (the action + RLS enforce it server-side too).
    requiredCapability: 'can_manage_stats',
    section: 'primary',
  },
  {
    id: 'performance',
    label: 'Performance',
    href: '/baseball/dashboard/performance',
    icon: IconDumbbell,
    role: 'coach',
    // Align with performance/page.tsx: lifting OR readiness review (#408).
    requiredCapability: null,
    requiredAnyCapabilities: ['can_manage_lifting', 'can_view_readiness'],
    section: 'primary',
  },
  {
    id: 'staff-decision-room',
    label: 'Decision Room',
    href: '/baseball/dashboard/decision-room',
    icon: IconBrain,
    role: 'coach',
    // Shared coaching intelligence — staff only. Gate on head-coach / staff
    // membership via the settings capability; refine in W11 if a dedicated cap
    // is added.
    requiredCapability: 'can_manage_settings',
    section: 'primary',
  },

  // --- Secondary ("More") group ------------------------------------------------
  {
    id: 'staff-settings',
    label: 'Staff Settings',
    href: '/baseball/dashboard/settings/staff',
    icon: IconSettings,
    role: 'coach',
    requiredCapability: 'can_invite_staff',
    section: 'secondary',
  },
  {
    id: 'program-settings',
    label: 'Program Settings',
    href: '/baseball/dashboard/settings/program',
    icon: IconBuilding,
    role: 'coach',
    requiredCapability: 'can_manage_settings',
    section: 'secondary',
  },

  // -----------------------------------------------------------------------
  // Previously orphaned routes — wired into nav 2026-06-24.
  //
  // Methodology: each page was inspected to determine its intended audience
  // (server route guard, role check, capability gate, etc.) and
  // assigned the narrowest correct role + capability gate. Routes that are
  // intentionally deep-linked detail pages (players/[id], dev-plans/[id],
  // lift/[sessionId], videos/[id]) are NOT registered here — they must be
  // reachable from a parent list page.
  // -----------------------------------------------------------------------

  // --- Coach recruiting surfaces (recruiting-capable coaches only) ---------
  {
    id: 'pipeline',
    label: 'Pipeline',
    href: '/baseball/dashboard/pipeline',
    icon: IconTarget,
    // Recruiting pipeline — server-gated for recruiting program modes. We
    // surface it to coaches here because program variants control ordering
    // and the page guard performs the real route decision.
    role: 'coach',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'discover',
    label: 'Discover',
    href: '/baseball/dashboard/discover',
    icon: IconStar,
    // Player discovery search — recruiting coaches. Visibility is ungated by
    // capability here; the server page guard owns route access.
    role: 'coach',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'watchlist',
    label: 'Watchlist',
    href: '/baseball/dashboard/watchlist',
    icon: IconBookmark,
    // Saved player shortlist — recruiting coaches. Server-gated at the route.
    role: 'coach',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'compare',
    label: 'Compare Players',
    href: '/baseball/dashboard/compare',
    icon: IconChart,
    // Side-by-side player comparison tool — recruiting coaches. Gated on
    // can_manage_roster because it reads player aggregates across the roster.
    role: 'coach',
    requiredCapability: 'can_manage_roster',
    section: 'primary',
  },
  {
    id: 'comparisons',
    label: 'Saved Comparisons',
    href: '/baseball/dashboard/comparisons',
    icon: IconBookmark,
    // Saved player comparison sets — recruiting coaches. Companion to Compare.
    role: 'coach',
    requiredCapability: 'can_manage_roster',
    section: 'primary',
  },
  {
    id: 'scout-packets',
    label: 'Scout Packets',
    href: '/baseball/dashboard/scout-packets',
    icon: IconNote,
    // Showcase event-roster to scout-packet export hub. The page itself gates
    // on can_export_reports (getScoutPacketRoster). Showcase-type only in
    // practice; the capability gate is the real boundary.
    role: 'coach',
    requiredCapability: 'can_export_reports',
    section: 'primary',
  },
  {
    id: 'dev-plans',
    label: 'Dev Plans',
    href: '/baseball/dashboard/dev-plans',
    icon: IconTarget,
    // Coach-facing development plan list + creation hub (CreateDevPlanModal).
    // The detail page /dev-plans/[id] is a deep-link from this list — NOT
    // registered separately.
    role: 'coach',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'academics',
    label: 'Academics',
    href: '/baseball/dashboard/academics',
    icon: IconGraduationCap,
    // Team GPA / credit-hour tracking. Editing is a staff action; view is
    // gated by can_view_academics.
    role: 'coach',
    requiredCapability: 'can_view_academics',
    section: 'primary',
  },
  {
    id: 'camps',
    label: 'Camps',
    href: '/baseball/dashboard/camps',
    icon: IconMapPin,
    // Camp creation and management (CreateCampModal from coach components).
    // Ungated by specific capability — coaches manage their own camp listings;
    // the page's Supabase queries scope to the session coach.
    role: 'coach',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'organization',
    label: 'Organization',
    href: '/baseball/dashboard/organization',
    icon: IconLayoutGrid,
    // Showcase multi-team org dashboard. A server route guard handles
    // showcase/academy/club access; can_manage_settings keeps this hidden for
    // non-head staff even within those orgs.
    role: 'coach',
    requiredCapability: 'can_manage_settings',
    allowedProgramTypes: SHOWCASE_ORG_PROGRAM_TYPES,
    section: 'secondary',
  },
  {
    id: 'teams',
    label: 'Teams',
    href: '/baseball/dashboard/teams',
    icon: IconUsers,
    // Showcase multi-team list. Same capability guard as organization —
    // surfaces only to head staff in showcase-style programs.
    role: 'coach',
    requiredCapability: 'can_manage_settings',
    allowedProgramTypes: SHOWCASE_ORG_PROGRAM_TYPES,
    section: 'secondary',
  },
  {
    id: 'program',
    label: 'Program Info',
    href: '/baseball/dashboard/program',
    icon: IconBuilding,
    // Organization / program-level details (logo, website, division). A
    // settings-adjacent page; gate on can_manage_settings so only head coaches
    // and full-authority staff see it.
    role: 'coach',
    requiredCapability: 'can_manage_settings',
    section: 'secondary',
  },

  // --- Shared team surfaces (coach + player) --------------------------------
  {
    id: 'announcements',
    label: 'Announcements',
    href: '/baseball/dashboard/announcements',
    icon: IconBell,
    // CoachView (create/manage) + PlayerView (read). The page detects role
    // server-side and renders the appropriate sub-component. Ungated by
    // capability — the page's write paths guard themselves via supabase RLS.
    role: 'both',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'documents',
    label: 'Documents',
    href: '/baseball/dashboard/documents',
    icon: IconFolder,
    // Team file library. Server component detects coach vs player and shows
    // the appropriate view. Ungated; Supabase RLS enforces write access.
    role: 'both',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'travel',
    label: 'Travel',
    href: '/baseball/dashboard/travel',
    icon: IconAirplane,
    // Trip itineraries. Client component detects role and passes isCoach to
    // TravelClient (coaches can edit; players read). Ungated; RLS is the wall.
    role: 'both',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'videos',
    label: 'Videos',
    href: '/baseball/dashboard/videos',
    icon: IconVideo,
    // Video library shared by coaches and players. Coach can upload/tag/delete;
    // players view shared clips. useAuth detects role inside the client.
    role: 'both',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'events',
    label: 'Events',
    href: '/baseball/dashboard/events',
    icon: IconFlag,
    // Calendar events list — distinct from the Calendar (team-ops) surface.
    // Coaches can create events; players see their team events. useAuth +
    // useTeams inside the client; RLS guards writes.
    role: 'both',
    requiredCapability: null,
    allowedProgramTypes: SHOWCASE_ORG_PROGRAM_TYPES,
    section: 'primary',
  },
  {
    id: 'team',
    label: 'Dashboard',
    href: '/baseball/dashboard/command-center',
    playerHref: '/baseball/player/today',
    icon: IconUsers,
    // Backward-compatible secondary landing. The old team dashboard route now
    // redirects here for coaches and to Player Today for players.
    role: 'both',
    requiredCapability: null,
    section: 'secondary',
  },
  {
    id: 'analytics',
    label: 'My Analytics',
    href: '/baseball/dashboard/analytics',
    icon: IconTrendingUp,
    // Player profile-view / recruiting analytics. Coaches are intentionally
    // redirected to Command Center, so this is not advertised in coach nav.
    role: 'player',
    requiredCapability: null,
    section: 'primary',
  },

  // --- Player-only surfaces --------------------------------------------------
  {
    id: 'player-dev-plan',
    label: 'My Dev Plan',
    href: '/baseball/dashboard/dev-plan',
    icon: IconTarget,
    // Player's ACTIVE development plan (goals, progress, timeline). The
    // /dev-plan page is the player's single-plan view; the coach-facing list
    // lives at /dev-plans (dev-plans id above). Player-only by design —
    // coaches reach development content through /dev-plans.
    role: 'player',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'player-journey',
    label: 'My Journey',
    href: '/baseball/dashboard/journey',
    icon: IconBolt,
    // Player's school-interest tracker — the list of programs the player is
    // researching/contacted/offered by. Drives the useJourney hook + interest
    // status updates. Player-only; coaches never need this view.
    role: 'player',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'player-college-interest',
    label: 'College Interest',
    href: '/baseball/dashboard/college-interest',
    icon: IconStar,
    // Player's college interest management (CollegeInterestClient). Companion
    // to My Journey — allows the player to flag schools and track status.
    role: 'player',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'colleges',
    label: 'Colleges',
    href: '/baseball/dashboard/colleges',
    icon: IconGraduationCap,
    // College browse/search (useColleges). Player discovers and marks interest
    // in programs. Player-only; coaches use Discover for the reverse direction.
    role: 'player',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'player-lift',
    label: 'Performance',
    href: '/baseball/dashboard/lift',
    icon: IconBolt,
    // Player's lift session home — upcoming sessions, recent history, readiness
    // check-in gate. Coaches are redirected to /performance server-side; this
    // entry is player-only to avoid a confusing dead-link for staff.
    role: 'player',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'player-readiness',
    label: 'Readiness',
    href: '/baseball/dashboard/readiness',
    icon: IconCheckCircle2,
    // Player readiness check-in (soreness, availability). Coaches are redirected
    // to /performance server-side; player-only entry keeps the nav honest.
    role: 'player',
    requiredCapability: null,
    section: 'primary',
  },
  {
    id: 'player-activate',
    label: 'Activate Recruiting',
    href: '/baseball/dashboard/activate',
    icon: IconFlag,
    // Opt-in recruiting activation — the player's one-time gate before coaches
    // can see their identity. The page guards college players (shows "Not
    // Available"). Player-only by design (coaches are bounced server-side).
    role: 'player',
    requiredCapability: null,
    section: 'secondary',
  },
] as const;

// -----------------------------------------------------------------------------
// MESSAGING — the one cross-cutting surface that lives OUTSIDE the feature
// registry (see the module header + the `showUnreadBadge` doc: "messaging lives
// outside this set"). It is NOT a Phase-1 feature vertical, carries no capability
// gate, and every signed-in member (coach OR player) can reach it. Because it is
// deliberately excluded from BASEBALL_NAV_REGISTRY, every consumer that wants a
// Messages link must inject it explicitly.
//
// Previously ONLY the mobile shell injected it (a hardcoded item in
// dashboard-shell.tsx), so the registry-driven DESKTOP sidebar had no Messages
// link for non-showcase coaches or any player — the route was reachable only by
// direct URL. This shared constant is the SINGLE SOURCE OF TRUTH both the desktop
// sidebar AND the mobile bottom nav derive Messages from, so the two can never
// drift again. `badge: true` opts the entry into the live unread-count badge that
// each surface renders from useUnreadCount().
//
// Kept as a plain object (not a registry entry) so the registry's pure
// role+capability+program-mode machinery — and its regression tests — stay
// untouched. It is shaped to match BaseballNavEntry's renderable fields so
// consumers can treat it like a registry-derived item.
// -----------------------------------------------------------------------------
export const BASEBALL_MESSAGES_NAV: {
  id: 'messages';
  label: string;
  href: string;
  icon: BaseballNavIcon;
  showUnreadBadge: true;
} = {
  id: 'messages',
  label: 'Messages',
  href: '/baseball/dashboard/messages',
  icon: IconMessage,
  showUnreadBadge: true,
};

// -----------------------------------------------------------------------------
// Filter helper — the visible nav for a resolved context.
// -----------------------------------------------------------------------------

/**
 * True when `entry` should be VISIBLE for the given resolved context.
 *
 * Rules:
 *   1. Role gate: entry.role must be 'both' OR match ctx.role.
 *   2. Capability gate (coaches only): if entry.requiredCapability is set and
 *      the coach's resolved map does NOT have that key === true, hide it.
 *      Players are never capability-checked (capabilities are a staff concept);
 *      a player can only reach role 'player' | 'both' entries, which all carry
 *      requiredCapability: null by construction.
 *
 * Pure + side-effect free; safe in both server and client bundles.
 */
export function isBaseballNavEntryVisible(
  entry: BaseballNavEntry,
  ctx: BaseballNavContext,
): boolean {
  // 1. Role gate.
  if (entry.role !== 'both' && entry.role !== ctx.role) return false;

  // 2. Capability gate — coaches only.
  if (entry.requiredAnyCapabilities?.length) {
    if (ctx.role !== 'coach') return false;
    const anyGranted = entry.requiredAnyCapabilities.some(
      (cap) => ctx.capabilities[cap] === true,
    );
    if (!anyGranted) return false;
  } else if (entry.requiredCapability) {
    // Players are never granted staff capabilities; hide any capability-gated
    // entry from them outright (defence in depth even though role gate above
    // already excludes coach-only entries for players).
    if (ctx.role !== 'coach') return false;
    if (ctx.capabilities[entry.requiredCapability] !== true) return false;
  }

  // 3. Program-type gate (#367) — showcase-only org surfaces.
  if (entry.allowedProgramTypes?.length) {
    if (!ctx.programType || !entry.allowedProgramTypes.includes(ctx.programType)) {
      return false;
    }
  }

  return true;
}

/**
 * Return the ordered, visible nav entries for a resolved context.
 *
 * Ordering:
 *   - Base order is BASEBALL_NAV_REGISTRY declaration order.
 *   - When `ctx.programType` is set, the visible entries are RE-ORDERED by the
 *     program-type's surface priority (orderCoachNav / orderPlayerNav). Ids not
 *     listed in the mode's priority fall to the end in registry order, so the
 *     `section` split below is preserved (every secondary id is absent from the
 *     priority lists → they stay after primaries, in registry order). This is the
 *     mechanism that makes College vs High School vs Showcase feel different
 *     WITHOUT forking the registry (v4: "settings control features instead of
 *     hard-coded copies").
 *
 * Sidebar splits the result by `section`; mobile nav takes the first N primary
 * entries — so the mode-aware order propagates to both surfaces automatically.
 */
export function getVisibleBaseballNav(
  ctx: BaseballNavContext,
): BaseballNavEntry[] {
  const visible = BASEBALL_NAV_REGISTRY.filter((entry) =>
    isBaseballNavEntryVisible(entry, ctx),
  ).map((entry) => {
    // Player-facing overrides for shared surfaces, applied centrally so every
    // consumer (sidebar + mobile nav) gets the spec label/route without role-aware
    // logic of its own. Two independent overrides:
    //   - playerLabel → label  (e.g. Calendar → "Schedule", Stats Center → "My Stats")
    //   - playerHref  → href   (e.g. Stats Center → player's own /dashboard/my-stats,
    //                           since /dashboard/stats-center is staff-only)
    // Returns a fresh object so the frozen registry entry is never mutated; the
    // entry is left untouched (same reference) when no player override applies.
    if (ctx.role !== 'player') return entry;
    if (!entry.playerLabel && !entry.playerHref) return entry;
    return {
      ...entry,
      ...(entry.playerLabel ? { label: entry.playerLabel } : {}),
      ...(entry.playerHref ? { href: entry.playerHref } : {}),
    };
  });

  if (!ctx.programType) return visible;

  // Re-order by the mode's surface priority. We sort the entry list by the
  // priority of each entry's id, keyed by role (coach vs player).
  const orderedIds =
    ctx.role === 'player'
      ? orderPlayerNav(
          ctx.programType,
          visible.map((e) => e.id),
        )
      : orderCoachNav(
          ctx.programType,
          visible.map((e) => e.id),
        );
  const rank = new Map(orderedIds.map((id, i) => [id, i]));
  return [...visible].sort((a, b) => {
    // Section is the primary sort key: primary entries ALWAYS precede secondary
    // entries regardless of mode priority. This preserves the section split even
    // when a secondary registry entry (e.g. staff-settings at registry index 15)
    // appears before primary entries that are absent from the mode's priority list
    // (e.g. pipeline, discover, announcements) and would otherwise sort ahead of
    // them when both carry MAX_SAFE_INTEGER rank.
    if (a.section !== b.section) {
      return a.section === 'primary' ? -1 : 1;
    }
    // Within the same section, order by the mode's surface priority rank.
    return (
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

/** Visible entries in the 'primary' section, in registry order. */
export function getPrimaryBaseballNav(
  ctx: BaseballNavContext,
): BaseballNavEntry[] {
  return getVisibleBaseballNav(ctx).filter((e) => e.section === 'primary');
}

/** Visible entries in the 'secondary' ("More") section, in registry order. */
export function getSecondaryBaseballNav(
  ctx: BaseballNavContext,
): BaseballNavEntry[] {
  return getVisibleBaseballNav(ctx).filter((e) => e.section === 'secondary');
}

/**
 * Look up a single entry by id (e.g. to derive the active route for the mobile
 * "More" target). Returns undefined if the id is unknown.
 */
export function getBaseballNavEntry(
  id: BaseballNavId,
): BaseballNavEntry | undefined {
  return BASEBALL_NAV_REGISTRY.find((e) => e.id === id);
}

/**
 * Resolve the mode-aware DEFAULT LANDING route for a context. Drives the "land
 * the user on the right home for this program type + role" redirect (v4: default
 * navigation differs per mode). Resolution:
 *   1. Pick the variant's coach/player default-landing nav id for the program
 *      type (falls back to college when programType is absent).
 *   2. Map that id to its registry href; if the landing entry is not VISIBLE for
 *      this context (capability-gated and not held), fall back to the first
 *      visible primary entry, then to the role's safe home.
 *
 * Returns an absolute `/baseball/...` href. Never returns a route the user
 * cannot see (defence in depth even though routes are server-gated regardless).
 */
export function getBaseballDefaultLandingHref(ctx: BaseballNavContext): string {
  const variant = getProgramVariant(ctx.programType ?? null);
  const wantedId =
    ctx.role === 'player'
      ? variant.playerDefaultLandingId
      : variant.coachDefaultLandingId;

  const visible = getVisibleBaseballNav(ctx);
  const wanted = visible.find((e) => e.id === wantedId);
  if (wanted) return wanted.href;

  const firstPrimary = visible.find((e) => e.section === 'primary');
  if (firstPrimary) return firstPrimary.href;

  // Last-resort role homes (always-visible, capability-free registry entries).
  return ctx.role === 'player'
    ? '/baseball/player/today'
    : '/baseball/dashboard/command-center';
}

/**
 * The mode-aware terminology pack for a context's program type (re-exported from
 * the variant engine so UI surfaces import nav + terminology from one place).
 * Falls back to the college pack when programType is absent.
 */
export function getBaseballTerminology(ctx: BaseballNavContext) {
  return getProgramVariant(ctx.programType ?? null).terminology;
}
