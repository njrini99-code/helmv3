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
  IconEye,
} from '@/components/icons';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

/**
 * Who an entry is for. Mirrors ActiveBaseballRole plus `'both'` for shared
 * surfaces (e.g. Roster, Stats Center) that coaches and players both reach.
 */
export type BaseballNavRole = ActiveBaseballRole | 'both';

/**
 * The 8 top-level GROUPED HUBS the coach sidebar condenses ~32 destinations
 * into (COACH_NAV_8TAB_PROPOSAL.md, approved 2026-07-01; hub/subtab caps
 * finalized in COHERENCE_RULING_2026-07-08.md Ruling 2). 'messages' is a real
 * grouping target — the persistent Messages surface itself is STILL declared
 * outside the registry (see BASEBALL_MESSAGES_NAV below, the cross-cutting
 * "Messages" tab every consumer prepends), but Announcements folds into this
 * hub (moved off Team — comms belong with comms) so hub-definitions.ts can
 * derive a real "Messages · Announcements" sub-nav instead of rendering
 * Messages as a bare flat link with no sub-tab strip. Every coach/both
 * registry entry below declares exactly one of these (nav-manifest.test.ts
 * asserts it), so hub-definitions.ts can GROUP BY this field instead of
 * hand-listing routes per hub.
 */
export type BaseballNavHub =
  | 'dashboard'
  | 'team'
  | 'messages'
  | 'stats-performance'
  | 'development'
  | 'recruiting'
  | 'academics'
  | 'management';

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
  | 'college-interest'
  | 'discover'
  | 'documents'
  | 'travel'
  | 'player-dev-plan'
  | 'dev-plans'
  | 'player-journey'
  | 'player-lift'
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
  | 'team'
  // --- New hub-landing pages (COHERENCE_RULING_2026-07-08 Ruling 2) ---
  | 'operations'
  | 'scouting'
  | 'settings';

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
  /**
   * The grouped-hub this entry folds into (COACH_NAV_8TAB_PROPOSAL.md). REQUIRED
   * for every entry whose role is 'coach' or 'both' — hub-definitions.ts derives
   * every hub's sub-nav tab list by grouping BASEBALL_NAV_REGISTRY on this field,
   * so a coach/both entry without a hub is invisible to that grouping (silently
   * orphaned, the exact bug this field exists to prevent). Left undefined for
   * role: 'player' entries, which never appear in a coach hub.
   */
  hub?: BaseballNavHub;
  /**
   * Optional nested-route ownership prefixes for hub sub-nav active matching.
   * When set, hub-definitions copies this onto HubSubNavTab.matchPrefixes so
   * detail routes (e.g. /players/[id]) highlight the parent registry tab.
   */
  matchPrefixes?: readonly string[];
  /**
   * COHERENCE_RULING_2026-07-08 Ruling 2 — the "≤3 subtabs per hub" mechanism.
   * When set, this entry is a FOLDED destination: hub-definitions.ts's
   * `hubEntries()` excludes it from the hub's RENDERED sub-tab strip (so the
   * hub never exceeds 3 tabs), but the entry keeps its own registry row —
   * command palette, breadcrumbs, and deep links still resolve it normally.
   * The value is the id of the sibling registry entry that acts as this
   * entry's LANDING/parent tab (e.g. a Documents/Travel/Practice Planner row
   * folds under the 'operations' landing). The parent entry's own
   * `matchPrefixes` must list this entry's `href` so resolve-active-hub still
   * highlights the right hub + subtab when a user is on the folded route
   * (nav-manifest.test.ts asserts this pairing).
   */
  foldedUnder?: BaseballNavId;
  /**
   * Optional override for how this entry's label reads INSIDE a hub sub-nav
   * strip specifically, when the canonical `label` (used everywhere else —
   * breadcrumbs, command palette, mobile nav) reads better unchanged. Used by
   * Ruling 2's Development hub, where the "Performance" feature is folded in
   * as the hub's "Training" subtab without renaming the feature itself
   * everywhere it's referenced.
   */
  hubTabLabel?: string;
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

// College/JUCO-only surfaces — hidden from HS/Showcase/Academy/Club program
// types. Postgame Review's page has always hard-redirected non-college/juco
// coaches (box-score-driven review only makes sense for those programs), but
// the nav entry itself was shown to ALL coach types, so HS/Showcase/Academy/
// Club coaches saw the tab, clicked it, and got silently bounced back to
// Command Center. Gating the entry here hides the tab for those program
// types instead; the page's own guard stays as defense-in-depth.
const COLLEGE_JUCO_PROGRAM_TYPES = ['college', 'juco'] as const satisfies readonly BaseballProgramType[];

export const BASEBALL_NAV_REGISTRY: readonly BaseballNavEntry[] = [
  // --- Daily loops (no capability gate beyond role) ----------------------------
  {
    id: 'command-center',
    // Ruling 2 (item 9): the top-level hub is already labeled "Dashboard" —
    // a subtab/breadcrumb ALSO reading "Command Center" is drift the founder
    // called out by name. The route/id/page masthead keep "Command Center"
    // (the page's own distinctive editorial title); only the NAV-visible
    // label (breadcrumbs, hub subtab strip, command palette, mobile nav)
    // changes to "Overview" so "Dashboard" never has two names in the UI.
    label: 'Overview',
    href: '/baseball/dashboard/command-center',
    icon: IconLayers,
    role: 'coach',
    requiredCapability: null,
    section: 'primary',
    hub: 'dashboard',
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
    hub: 'dashboard',
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
    hub: 'team',
    matchPrefixes: ['/baseball/dashboard/players'],
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
    hub: 'team',
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
    hub: 'stats-performance',
    // Ruling 2: Season is a VIEW inside Stats Center (no longer its own
    // subtab), and Upload + Import Center are CTAs on the Stats Center page
    // header — so all three routes must still resolve to this hub + subtab.
    matchPrefixes: [
      '/baseball/dashboard/stats/upload',
      '/baseball/dashboard/import',
    ],
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
    hub: 'stats-performance',
    // Ruling 2: a CTA inside Stats Center, not its own subtab.
    foldedUnder: 'stats-center',
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
    // Ruling 2: Practice Planner + Practice Effectiveness moved OFF
    // Stats & Performance (which caps at Stats Center/Games/Postgame) and
    // fold into the Team hub's new Operations landing alongside
    // Documents/Travel — all four are team-logistics surfaces, not stats.
    hub: 'team',
    foldedUnder: 'operations',
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
    hub: 'team',
    foldedUnder: 'operations',
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
    hub: 'stats-performance',
    allowedProgramTypes: COLLEGE_JUCO_PROGRAM_TYPES,
  },
  {
    id: 'performance',
    label: 'Performance',
    // Ruling 2: Development hub reads "Dev Plans · Training · Videos" — this
    // feature IS "Training" in that strip. The canonical label stays
    // "Performance" everywhere else (breadcrumbs, command palette, the
    // page's own masthead already titled "Performance") — only the hub
    // sub-nav tab renders the reframed name.
    hubTabLabel: 'Training',
    href: '/baseball/dashboard/performance',
    icon: IconDumbbell,
    role: 'coach',
    // Align with performance/page.tsx: lifting OR readiness review (#408).
    requiredCapability: null,
    requiredAnyCapabilities: ['can_manage_lifting', 'can_view_readiness'],
    section: 'primary',
    hub: 'development',
    matchPrefixes: ['/baseball/dashboard/performance'],
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
    hub: 'management',
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
    hub: 'management',
    // Ruling 2: folds into the Settings landing (card grid at
    // /dashboard/settings already links here) — Management caps at
    // Decision Room/Settings/Organization.
    foldedUnder: 'settings',
  },
  {
    id: 'program-settings',
    label: 'Program Settings',
    href: '/baseball/dashboard/settings/program',
    icon: IconBuilding,
    role: 'coach',
    requiredCapability: 'can_manage_settings',
    section: 'secondary',
    hub: 'management',
    foldedUnder: 'settings',
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
    hub: 'recruiting',
    // Ruling 2: Interest is a coach-facing recruiting-funnel view — closest
    // conceptual home is Pipeline (not explicitly named in the ruling's
    // Recruiting row; smallest-safe-choice fold, still command-palette +
    // deep-link reachable).
    matchPrefixes: ['/baseball/dashboard/college-interest'],
  },
  {
    id: 'college-interest',
    label: 'Interest',
    href: '/baseball/dashboard/college-interest',
    icon: IconTrendingUp,
    // Coach-facing player-interest dashboard. This was incorrectly surfaced as
    // a player Fairway tab; players either see a gate state or are routed back
    // to their own recruiting journey. Coaches own the actual data surface.
    role: 'coach',
    requiredCapability: null,
    section: 'primary',
    hub: 'recruiting',
    foldedUnder: 'pipeline',
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
    hub: 'recruiting',
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
    hub: 'recruiting',
    // Ruling 2: folds into the new Scouting landing (Recruiting caps at
    // Pipeline/Discover/Scouting).
    foldedUnder: 'scouting',
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
    hub: 'recruiting',
    foldedUnder: 'scouting',
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
    hub: 'recruiting',
    foldedUnder: 'scouting',
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
    hub: 'recruiting',
    foldedUnder: 'scouting',
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
    hub: 'development',
    matchPrefixes: ['/baseball/dashboard/dev-plans'],
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
    hub: 'academics',
  },
  {
    id: 'camps',
    label: 'Camps',
    href: '/baseball/dashboard/camps',
    icon: IconMapPin,
    // Camp creation/management (coaches) AND camp registration (players) —
    // CampsClient is a genuinely SHARED surface (spec: ui-migration-map.md
    // `camps` row), same pattern as Travel/Documents. The route guard
    // (camps/page.tsx) only requires a signed-in session — no role check —
    // and CampsClient branches its entire UI on `useAuth()`'s role (coach:
    // create/manage; player: browse + register for camps). This entry was
    // previously `role: 'coach'` only, which hid a fully-implemented player
    // flow from the player nav even though the page already supported it.
    // Ungated by capability — coaches manage their own camp listings; the
    // page's Supabase queries scope to the session coach/player.
    role: 'both',
    requiredCapability: null,
    section: 'primary',
    hub: 'recruiting',
    matchPrefixes: ['/baseball/dashboard/camps'],
    foldedUnder: 'scouting',
  },
  {
    // Ruling 2 (Recruiting hub): the new landing page that keeps Watchlist,
    // Compare Players, Saved Comparisons, Scout Packets, and Camps reachable
    // once Recruiting caps at 3 rendered subtabs (Pipeline · Discover ·
    // Scouting). Card-grid landing (dashboard/scouting) — each card inherits
    // its target's own registry gating, never re-declares it.
    id: 'scouting',
    label: 'Scouting',
    href: '/baseball/dashboard/scouting',
    icon: IconEye,
    role: 'coach',
    requiredCapability: null,
    section: 'primary',
    hub: 'recruiting',
    matchPrefixes: [
      '/baseball/dashboard/watchlist',
      '/baseball/dashboard/compare',
      '/baseball/dashboard/comparisons',
      '/baseball/dashboard/scout-packets',
      '/baseball/dashboard/camps',
    ],
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
    hub: 'management',
    // Ruling 2: Organization is the rendered Management subtab; Teams +
    // Events fold under it for Showcase-types (both already share this
    // entry's allowedProgramTypes gate), so both routes still highlight the
    // Organization subtab when visited directly.
    matchPrefixes: ['/baseball/dashboard/teams', '/baseball/dashboard/events'],
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
    hub: 'management',
    foldedUnder: 'organization',
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
    hub: 'management',
    foldedUnder: 'settings',
  },
  {
    // Ruling 2 (Management hub): the existing card-grid landing at
    // /dashboard/settings (KEPT, per the ruling — its own 13-tab strip is
    // gone by design now that Management caps at 3 subtabs: Decision Room ·
    // Settings · Organization). Program Info, Staff Settings, and Program
    // Settings fold into this one Settings destination; the card grid
    // already links every one of them (verified, nothing orphaned).
    id: 'settings',
    label: 'Settings',
    href: '/baseball/dashboard/settings',
    icon: IconSettings,
    role: 'coach',
    requiredCapability: null,
    section: 'secondary',
    hub: 'management',
    // '/baseball/dashboard/settings/*' sub-routes (staff, program, season,
    // philosophy, roles, permissions, imports, integrations, audit) resolve
    // via this entry's own href as a natural route PREFIX — only the
    // 'program' fold target needs an explicit prefix since its href is NOT
    // nested under /settings/.
    matchPrefixes: ['/baseball/dashboard/program'],
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
    // Ruling 2: moved OFF Team — announcements are comms, so they fold into
    // the Messages hub (Messages · Announcements) instead.
    hub: 'messages',
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
    hub: 'team',
    // Ruling 2: Team hub caps at Roster/Calendar/Operations — Documents folds
    // into the new Operations landing.
    foldedUnder: 'operations',
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
    hub: 'team',
    foldedUnder: 'operations',
  },
  {
    // Ruling 2 (Team hub): the new landing page that keeps Documents, Travel,
    // Practice Planner, and Practice Effectiveness reachable in ≤2 clicks
    // once Team caps at 3 rendered subtabs (Roster · Calendar · Operations).
    // Card-grid landing (src/app/baseball/(dashboard)/dashboard/operations) —
    // each card inherits its target's own registry gating, never re-declares it.
    id: 'operations',
    label: 'Operations',
    href: '/baseball/dashboard/operations',
    icon: IconClipboardList,
    role: 'coach',
    requiredCapability: null,
    section: 'primary',
    hub: 'team',
    matchPrefixes: [
      '/baseball/dashboard/documents',
      '/baseball/dashboard/travel',
      '/baseball/dashboard/practice',
      '/baseball/dashboard/practice-effectiveness',
    ],
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
    hub: 'development',
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
    hub: 'management',
    foldedUnder: 'organization',
  },
  {
    id: 'team',
    label: 'Dashboard',
    href: '/baseball/dashboard/command-center',
    icon: IconUsers,
    // Backward-compatible secondary landing. The old team dashboard route now
    // redirects here for coaches. Classified
    // 'dashboard' for the hub-required-field invariant, but hub-definitions.ts
    // deliberately EXCLUDES this id from the Dashboard hub's rendered sub-tabs
    // (its href is an exact duplicate of 'command-center' for coaches — it is a
    // legacy alias, never a distinct destination worth its own tab).
    role: 'coach',
    requiredCapability: null,
    section: 'secondary',
    hub: 'dashboard',
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

// -----------------------------------------------------------------------------
// isBaseballLateralDestination — Doctrine Rule 9 (docs/MOBILE_DOCTRINE.md):
// "Tab switches are instant." src/lib/motion/route-motion.ts's
// useRouteRevealMotion hook calls this to decide whether the CURRENT pathname
// is a lateral peer (instant swap) or a detail leaf (forward-push reveal).
//
// Backed by every href + playerHref declared in BASEBALL_NAV_REGISTRY (this
// automatically covers every hub-landing page — operations/scouting/settings/
// stats-center/etc. — since those are already registry rows, not a separately
// hand-maintained list) plus the cross-cutting BASEBALL_MESSAGES_NAV entry
// that deliberately lives outside the registry. `matchPrefixes` are NOT
// unioned in — those exist precisely to light a parent tab from a DETAIL
// route (dev-plans/[id], performance/players/[id], stats/games/[gameId]),
// which must still reveal as a forward push.
// -----------------------------------------------------------------------------

let baseballLateralDestinations: Set<string> | null = null;

function buildBaseballLateralDestinations(): Set<string> {
  const hrefs: string[] = [BASEBALL_MESSAGES_NAV.href];
  for (const entry of BASEBALL_NAV_REGISTRY) {
    hrefs.push(entry.href);
    if (entry.playerHref) hrefs.push(entry.playerHref);
  }
  return new Set(hrefs);
}

/**
 * True when `pathname` is a registered lateral navigation destination (every
 * BASEBALL_NAV_REGISTRY href/playerHref, plus Messages) for either baseball
 * role. Built once, lazily, and memoized module-wide — the registry is
 * static, so every subsequent navigation is an O(1) `Set.has` lookup, never a
 * fresh array walk.
 */
export function isBaseballLateralDestination(pathname: string): boolean {
  if (!baseballLateralDestinations) {
    baseballLateralDestinations = buildBaseballLateralDestinations();
  }
  return baseballLateralDestinations.has(pathname);
}
