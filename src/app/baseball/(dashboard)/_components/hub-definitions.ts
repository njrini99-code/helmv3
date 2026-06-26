// =============================================================================
// hub-definitions.ts — the grouped-hub tab lists for BaseballHelm coach + player.
//
// Single source of truth for the SUB-TABS inside each top-level hub. The hub
// layout.tsx files render <HubSubNav tabs={...}> from these arrays, and the
// sidebar derives each hub's landing href from the FIRST tab here — so the
// top-level sidebar item and the hub's own sub-tab strip can never drift.
//
// These point at EXISTING leaf routes only. The grouped-hubs architecture is
// ADDITIVE: no route is moved, renamed, or deleted — the hub adds a navigation
// layer above the leaves that already work.
//
// PURE DATA + ICONS. No 'use client' / 'use server', no Supabase, no React state —
// safe to import from both the client sidebar and the client hub layouts.
// =============================================================================

import {
  IconUsers,
  IconCalendar,
  IconMessage,
  IconBell,
  IconCheckCircle2,
  IconFileText,
  IconAirplane,
  IconChartBar,
  IconClipboardList,
  IconTrendingUp,
  IconUpload,
  IconTarget,
  IconVideo,
  IconBrain,
  IconBuilding,
  IconSettings,
  IconStar,
  IconNote,
  IconHome,
  IconUser,
  IconGraduationCap,
} from '@/components/icons';
import type { HubSubNavTab } from './hub-sub-nav';

// -----------------------------------------------------------------------------
// COACH HUBS
// -----------------------------------------------------------------------------

/** TEAM hub — roster + day-to-day team operations. */
export const COACH_TEAM_TABS: readonly HubSubNavTab[] = [
  { id: 'roster', label: 'Roster', href: '/baseball/dashboard/roster', icon: IconUsers },
  { id: 'calendar', label: 'Calendar', href: '/baseball/dashboard/calendar', icon: IconCalendar },
  { id: 'messages', label: 'Messages', href: '/baseball/dashboard/messages', icon: IconMessage },
  { id: 'announcements', label: 'Announcements', href: '/baseball/dashboard/announcements', icon: IconBell },
  { id: 'tasks', label: 'Tasks', href: '/baseball/dashboard/tasks', icon: IconCheckCircle2 },
  { id: 'documents', label: 'Documents', href: '/baseball/dashboard/documents', icon: IconFileText },
  { id: 'travel', label: 'Travel', href: '/baseball/dashboard/travel', icon: IconAirplane },
];

/** STATS hub — team-wide stats depth, game logs, season, performance, upload. */
export const COACH_STATS_TABS: readonly HubSubNavTab[] = [
  {
    id: 'overview',
    label: 'Overview',
    href: '/baseball/dashboard/stats',
    icon: IconChartBar,
    // /stats is the overview; its nested /games, /season, /upload are separate
    // tabs below, so the overview tab matches the bare /stats route only.
  },
  { id: 'games', label: 'Games', href: '/baseball/dashboard/stats/games', icon: IconClipboardList },
  { id: 'season', label: 'Season', href: '/baseball/dashboard/stats/season', icon: IconTrendingUp },
  {
    id: 'performance',
    label: 'Performance',
    href: '/baseball/dashboard/performance',
    icon: IconTrendingUp,
    matchPrefixes: ['/baseball/dashboard/performance'],
  },
  { id: 'upload', label: 'Upload', href: '/baseball/dashboard/stats/upload', icon: IconUpload },
];

/** DEVELOPMENT hub — dev plans + video library. */
export const COACH_DEVELOPMENT_TABS: readonly HubSubNavTab[] = [
  { id: 'dev-plans', label: 'Dev Plans', href: '/baseball/dashboard/dev-plans', icon: IconTarget, matchPrefixes: ['/baseball/dashboard/dev-plans'] },
  { id: 'videos', label: 'Videos', href: '/baseball/dashboard/videos', icon: IconVideo, matchPrefixes: ['/baseball/dashboard/videos'] },
];

/** MANAGEMENT hub — staff room, program info, settings. */
export const COACH_MANAGEMENT_TABS: readonly HubSubNavTab[] = [
  { id: 'staff-room', label: 'Staff Room', href: '/baseball/dashboard/decision-room', icon: IconBrain },
  { id: 'program', label: 'Program', href: '/baseball/dashboard/program', icon: IconBuilding },
  { id: 'settings', label: 'Settings', href: '/baseball/dashboard/settings', icon: IconSettings, matchPrefixes: ['/baseball/dashboard/settings'] },
];

/**
 * RECRUITING hub — college interest, scout packets, import. Gated: currently
 * archived-ok to scaffold hidden (the sidebar does not surface this hub yet).
 * Defined here so the layout + future un-hide is a one-line sidebar change.
 */
export const COACH_RECRUITING_TABS: readonly HubSubNavTab[] = [
  { id: 'college-interest', label: 'College Interest', href: '/baseball/dashboard/college-interest', icon: IconStar },
  { id: 'scout-packets', label: 'Scout Packets', href: '/baseball/dashboard/scout-packets', icon: IconNote },
  { id: 'import', label: 'Import', href: '/baseball/dashboard/import', icon: IconUpload },
];

/**
 * ACADEMICS hub — JUCO coaches only (the sidebar surfaces this hub only when
 * coach_type === 'juco'). A single-surface hub today; kept as a hub so it slots
 * into the same grouped-nav grammar and can grow sub-tabs later.
 */
export const COACH_ACADEMICS_TABS: readonly HubSubNavTab[] = [
  { id: 'academics', label: 'Academics', href: '/baseball/dashboard/academics', icon: IconGraduationCap },
];

// -----------------------------------------------------------------------------
// PLAYER HUBS
// -----------------------------------------------------------------------------

/** Player STATS hub — own stats depth + game/season views. */
export const PLAYER_STATS_TABS: readonly HubSubNavTab[] = [
  { id: 'overview', label: 'Overview', href: '/baseball/dashboard/my-stats', icon: IconChartBar },
  {
    id: 'performance',
    label: 'Performance',
    href: '/baseball/dashboard/performance',
    icon: IconTrendingUp,
    matchPrefixes: ['/baseball/dashboard/performance'],
  },
];

/** Player DEVELOPMENT hub — own dev plan + video library. */
export const PLAYER_DEVELOPMENT_TABS: readonly HubSubNavTab[] = [
  { id: 'dev-plan', label: 'Dev Plan', href: '/baseball/dashboard/dev-plan', icon: IconTarget },
  { id: 'videos', label: 'Videos', href: '/baseball/dashboard/videos', icon: IconVideo, matchPrefixes: ['/baseball/dashboard/videos'] },
];

/** Player TEAM hub — shared team surfaces a player reads. */
export const PLAYER_TEAM_TABS: readonly HubSubNavTab[] = [
  { id: 'announcements', label: 'Announcements', href: '/baseball/dashboard/announcements', icon: IconBell },
  { id: 'tasks', label: 'Tasks', href: '/baseball/dashboard/tasks', icon: IconCheckCircle2 },
  { id: 'documents', label: 'Documents', href: '/baseball/dashboard/documents', icon: IconFileText },
];

// -----------------------------------------------------------------------------
// SHARED REFERENCES — non-hub leaf routes the sidebar links directly (no sub-nav).
// Kept here only so the sidebar and any future hub share one href string.
// -----------------------------------------------------------------------------

export const HUB_LANDING = {
  coachDashboard: '/baseball/dashboard/command-center',
  coachTeam: COACH_TEAM_TABS[0]!.href,
  coachStats: COACH_STATS_TABS[0]!.href,
  coachDevelopment: COACH_DEVELOPMENT_TABS[0]!.href,
  coachManagement: COACH_MANAGEMENT_TABS[0]!.href,
  coachRecruiting: COACH_RECRUITING_TABS[0]!.href,
  coachAcademics: COACH_ACADEMICS_TABS[0]!.href,
  playerDashboard: '/baseball/player/today',
  playerProfile: '/baseball/dashboard/profile',
  playerStats: PLAYER_STATS_TABS[0]!.href,
  playerDevelopment: PLAYER_DEVELOPMENT_TABS[0]!.href,
  playerCalendar: '/baseball/dashboard/calendar',
  playerMessages: '/baseball/dashboard/messages',
  playerTeam: PLAYER_TEAM_TABS[0]!.href,
} as const;

export const HUB_ICONS = {
  dashboard: IconHome,
  team: IconUsers,
  stats: IconChartBar,
  development: IconTarget,
  management: IconBuilding,
  recruiting: IconStar,
  academics: IconGraduationCap,
  profile: IconUser,
  calendar: IconCalendar,
  messages: IconMessage,
} as const;
