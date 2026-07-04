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
// COACH_NAV_8TAB_PROPOSAL.md (approved 2026-07-01) — DERIVED, NOT HAND-LISTED:
// every COACH_*_TABS array below is built by grouping BASEBALL_NAV_REGISTRY on
// its `hub` field (nav-registry.ts), not by hand-maintaining a parallel route
// list. That is what fixed the drift the proposal documented: 5 registered
// features with no hub-tab entry anywhere (camps, postgame-review,
// practice-effectiveness, practice-planner, comparisons), a phantom coach
// `tasks` tab with no coach-visible registry row, and a player-only
// `college-interest` leaking into the coach recruiting hub. Labels, icons,
// requiredCapability/requiredAnyCapabilities, and allowedProgramTypes are all
// read from the registry entry verbatim — never re-declared here, so they can
// never drift from the registry again. The only hand-maintained data left is
// (a) each hub's DISPLAY ORDER (a small id list; entries not listed simply fall
// to the end in registry order — nothing can be silently dropped), and (b) a
// handful of SUPPLEMENTARY leaf tabs (Stats Center's Games/Season/Upload,
// Performance's Live/Programs/Groups/Builder) that are child pages of a
// registry feature, not registry features in their own right.
//
// PLAYER_*_TABS are intentionally NOT derived the same way: most player-only
// registry entries (player-dev-plan, player-lift, player-readiness, etc.) carry
// no `hub` field (hub is only required for role coach/both — see nav-registry.ts),
// so they stay hand-maintained here, unchanged by this pass.
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
  IconChartBar,
  IconClipboardList,
  IconTrendingUp,
  IconUpload,
  IconTarget,
  IconVideo,
  IconDumbbell,
  IconGauge,
  IconShieldCheck,
  IconBuilding,
  IconStar,
  IconHome,
  IconUser,
  IconGraduationCap,
  IconSettings,
  IconLock,
  IconDatabase,
} from '@/components/icons';
import type { HubSubNavTab } from './hub-sub-nav';
import {
  BASEBALL_NAV_REGISTRY,
  type BaseballNavEntry,
  type BaseballNavHub,
  type BaseballNavIcon,
} from '@/lib/baseball/nav-registry';

// -----------------------------------------------------------------------------
// Derivation core — group BASEBALL_NAV_REGISTRY by `hub`, in a curated display
// order, with registry-order fallback for anything not explicitly ordered.
// -----------------------------------------------------------------------------

/** Registry entry → HubSubNavTab, copying every gating field VERBATIM. */
function toHubTab(entry: BaseballNavEntry): HubSubNavTab {
  return {
    id: entry.id,
    label: entry.label,
    href: entry.href,
    icon: entry.icon,
    requiredCapability: entry.requiredCapability ?? undefined,
    requiredAnyCapabilities: entry.requiredAnyCapabilities,
    allowedProgramTypes: entry.allowedProgramTypes,
    matchPrefixes: entry.matchPrefixes,
  };
}

/**
 * Every coach/both registry entry tagged for `hub`, converted to tabs. `team`
 * is always excluded — it is the legacy `/dashboard/team` alias (hub:
 * 'dashboard' for the registry invariant, but its href is an exact duplicate
 * of `command-center` for coaches), never a distinct destination worth a tab.
 */
function hubEntries(hub: BaseballNavHub): HubSubNavTab[] {
  return BASEBALL_NAV_REGISTRY.filter((e) => e.hub === hub && e.role !== 'player' && e.id !== 'team').map(
    toHubTab,
  );
}

/** Stable-sort tabs by a curated id order; unlisted ids keep registry order at the end. */
function orderTabs(tabs: HubSubNavTab[], order: readonly string[]): HubSubNavTab[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...tabs].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.id) ? rank.get(b.id)! : Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}

/** Splice hand-declared supplementary leaf tabs directly after their parent registry tab. */
function withSupplements(
  tabs: readonly HubSubNavTab[],
  supplements: Readonly<Record<string, readonly HubSubNavTab[]>>,
): HubSubNavTab[] {
  const out: HubSubNavTab[] = [];
  for (const tab of tabs) {
    out.push(tab);
    const extra = supplements[tab.id];
    if (extra) out.push(...extra);
  }
  return out;
}

// -----------------------------------------------------------------------------
// Supplementary leaf tabs — child pages of a registry feature that are not
// themselves BASEBALL_NAV_REGISTRY entries (nav-registry.ts tracks the 32
// top-level features; these are deeper sub-pages within two of them).
// -----------------------------------------------------------------------------

const STATS_GAMES_TAB: HubSubNavTab = {
  id: 'games',
  label: 'Games',
  href: '/baseball/dashboard/stats/games',
  icon: IconClipboardList,
  matchPrefixes: ['/baseball/dashboard/stats/games'],
};
const STATS_SEASON_TAB: HubSubNavTab = {
  id: 'season',
  label: 'Season',
  href: '/baseball/dashboard/stats/season',
  icon: IconTrendingUp,
};
const STATS_UPLOAD_TAB: HubSubNavTab = {
  id: 'upload',
  label: 'Upload',
  href: '/baseball/dashboard/stats/upload',
  icon: IconUpload,
};
const PERFORMANCE_LIVE_TAB: HubSubNavTab = {
  id: 'performance-live',
  label: 'Live',
  href: '/baseball/dashboard/performance/live',
  icon: IconDumbbell,
  requiredCapability: 'can_manage_lifting',
};
const PERFORMANCE_PROGRAMS_TAB: HubSubNavTab = {
  id: 'performance-programs',
  label: 'Programs',
  href: '/baseball/dashboard/performance/programs',
  icon: IconClipboardList,
  matchPrefixes: ['/baseball/dashboard/performance/programs'],
  requiredCapability: 'can_manage_lifting',
};
const PERFORMANCE_GROUPS_TAB: HubSubNavTab = {
  id: 'performance-groups',
  label: 'Groups',
  href: '/baseball/dashboard/performance/groups',
  icon: IconUsers,
  requiredCapability: 'can_manage_lifting',
};
const PERFORMANCE_BUILDER_TAB: HubSubNavTab = {
  id: 'performance-builder',
  label: 'Builder',
  href: '/baseball/dashboard/performance/builder',
  icon: IconGauge,
  requiredCapability: 'can_manage_lifting',
};
const SETTINGS_HOME_TAB: HubSubNavTab = {
  id: 'settings-home',
  label: 'Settings',
  href: '/baseball/dashboard/settings',
  icon: IconSettings,
};
const SETTINGS_SEASON_TAB: HubSubNavTab = {
  id: 'settings-season',
  label: 'Season',
  href: '/baseball/dashboard/settings/season',
  icon: IconCalendar,
  requiredCapability: 'can_manage_settings',
};
const SETTINGS_PHILOSOPHY_TAB: HubSubNavTab = {
  id: 'settings-philosophy',
  label: 'Philosophy',
  href: '/baseball/dashboard/settings/philosophy',
  icon: IconTarget,
  requiredCapability: 'can_manage_settings',
};
const SETTINGS_ROLES_TAB: HubSubNavTab = {
  id: 'settings-roles',
  label: 'Roles',
  href: '/baseball/dashboard/settings/roles',
  icon: IconLock,
  requiredCapability: 'can_manage_settings',
};
const SETTINGS_PERMISSIONS_TAB: HubSubNavTab = {
  id: 'settings-permissions',
  label: 'Permissions',
  href: '/baseball/dashboard/settings/permissions',
  icon: IconShieldCheck,
  requiredCapability: 'can_manage_settings',
};
const SETTINGS_TEAMS_TAB: HubSubNavTab = {
  id: 'settings-teams',
  label: 'Team Settings',
  href: '/baseball/dashboard/settings/teams',
  icon: IconUsers,
  requiredCapability: 'can_manage_settings',
};
const SETTINGS_IMPORTS_TAB: HubSubNavTab = {
  id: 'settings-imports',
  label: 'Imports',
  href: '/baseball/dashboard/settings/imports',
  icon: IconUpload,
  requiredCapability: 'can_manage_imports',
};
const SETTINGS_INTEGRATIONS_TAB: HubSubNavTab = {
  id: 'settings-integrations',
  label: 'Integrations',
  href: '/baseball/dashboard/settings/integrations',
  icon: IconBuilding,
  requiredCapability: 'can_manage_settings',
};
const SETTINGS_AUDIT_TAB: HubSubNavTab = {
  id: 'settings-audit',
  label: 'Audit',
  href: '/baseball/dashboard/settings/audit',
  icon: IconDatabase,
  requiredCapability: 'can_manage_settings',
};

// -----------------------------------------------------------------------------
// Curated display order per hub (COACH_NAV_8TAB_PROPOSAL.md mapping table).
// Membership is always registry-derived (hubEntries); this only sequences it.
// -----------------------------------------------------------------------------

const DASHBOARD_ORDER = ['command-center', 'signals'];
const TEAM_ORDER = ['roster', 'calendar', 'announcements', 'documents', 'travel'];
const STATS_PERFORMANCE_ORDER = [
  'stats-center',
  'performance',
  'postgame-review',
  'practice-planner',
  'practice-effectiveness',
  'import-center',
];
const DEVELOPMENT_ORDER = ['dev-plans', 'videos'];
const RECRUITING_ORDER = ['pipeline', 'discover', 'watchlist', 'compare', 'comparisons', 'scout-packets', 'camps'];
const ACADEMICS_ORDER = ['academics'];
const MANAGEMENT_ORDER = [
  'staff-decision-room',
  'program',
  'staff-settings',
  'program-settings',
  'organization',
  'teams',
  'events',
];

// -----------------------------------------------------------------------------
// COACH HUBS — every array below is registry-derived (see the module header).
// -----------------------------------------------------------------------------

/** DASHBOARD hub — Command Center + Signals (folded from two flat top-level tabs). */
export const COACH_DASHBOARD_TABS: readonly HubSubNavTab[] = orderTabs(
  hubEntries('dashboard'),
  DASHBOARD_ORDER,
);

/** TEAM hub — roster + day-to-day team operations. */
export const COACH_TEAM_TABS: readonly HubSubNavTab[] = orderTabs(hubEntries('team'), TEAM_ORDER);

/**
 * STATS & PERFORMANCE hub — team-wide stats depth, game logs, season, practice
 * intelligence, and lifting/readiness, folded into one hub per the proposal
 * (previously Practice Planner/Effectiveness, Postgame Review, and Import
 * Center had no hub-tab entry anywhere — an unreachable-feature bug this fixes).
 */
export const COACH_STATS_TABS: readonly HubSubNavTab[] = withSupplements(
  orderTabs(hubEntries('stats-performance'), STATS_PERFORMANCE_ORDER),
  {
    'stats-center': [STATS_GAMES_TAB, STATS_SEASON_TAB, STATS_UPLOAD_TAB],
    performance: [PERFORMANCE_LIVE_TAB, PERFORMANCE_PROGRAMS_TAB, PERFORMANCE_GROUPS_TAB, PERFORMANCE_BUILDER_TAB],
  },
);

/** DEVELOPMENT hub — dev plans + video library. */
export const COACH_DEVELOPMENT_TABS: readonly HubSubNavTab[] = orderTabs(
  hubEntries('development'),
  DEVELOPMENT_ORDER,
);

/**
 * RECRUITING hub — pipeline, discovery, comparisons, scout packets, camps.
 * Gated to RECRUITING_PROGRAM_TYPES by the sidebar/resolve-active-hub, hidden
 * entirely for High School. Fixed by this pass: `import` (misplaced here
 * previously) moved to Stats & Performance; `college-interest` (a player-only
 * page) removed; `comparisons` and `camps` (previously unreachable) added.
 */
export const COACH_RECRUITING_TABS: readonly HubSubNavTab[] = orderTabs(
  hubEntries('recruiting'),
  RECRUITING_ORDER,
);

/**
 * ACADEMICS hub — JUCO coaches only (the sidebar surfaces this hub only when
 * coach_type === 'juco'). A single-surface hub today; kept as a hub so it slots
 * into the same grouped-nav grammar and can grow sub-tabs later.
 */
export const COACH_ACADEMICS_TABS: readonly HubSubNavTab[] = orderTabs(hubEntries('academics'), ACADEMICS_ORDER);

const MANAGEMENT_SETTINGS_SUPPLEMENT_ID = 'program-settings';

/** Dev-only guard: settings supplement tabs must attach to a real registry row. */
function assertManagementSettingsSupplement(tabs: readonly HubSubNavTab[]): void {
  if (process.env.NODE_ENV === 'production') return;
  if (!tabs.some((tab) => tab.id === MANAGEMENT_SETTINGS_SUPPLEMENT_ID)) {
    throw new Error(
      `COACH_MANAGEMENT_TABS settings supplement requires registry tab "${MANAGEMENT_SETTINGS_SUPPLEMENT_ID}".`,
    );
  }
}

/**
 * MANAGEMENT hub — staff coordination, program settings, and (Showcase/Academy/
 * Club only, via allowedProgramTypes carried through verbatim from the
 * registry) org-level Organization/Teams/Events. Fixed by this pass: the
 * "Decision Room" vs "Staff Room" label drift (the registry's label always
 * wins now — it is read, not re-declared).
 */
const managementHubTabs = orderTabs(hubEntries('management'), MANAGEMENT_ORDER);
assertManagementSettingsSupplement(managementHubTabs);

export const COACH_MANAGEMENT_TABS: readonly HubSubNavTab[] = withSupplements(
  managementHubTabs,
  {
    [MANAGEMENT_SETTINGS_SUPPLEMENT_ID]: [
      SETTINGS_HOME_TAB,
      SETTINGS_SEASON_TAB,
      SETTINGS_PHILOSOPHY_TAB,
      SETTINGS_ROLES_TAB,
      SETTINGS_PERMISSIONS_TAB,
      SETTINGS_TEAMS_TAB,
      SETTINGS_IMPORTS_TAB,
      SETTINGS_INTEGRATIONS_TAB,
      SETTINGS_AUDIT_TAB,
    ],
  },
);

// -----------------------------------------------------------------------------
// HUB METADATA — the ordered list of coach hubs + their label/icon/tabs, so
// sidebar.tsx and BaseballFairwayShell.tsx can build the top-level grouped nav
// generically (loop over COACH_HUB_ORDER) instead of hand-listing hubs.
// -----------------------------------------------------------------------------

export interface CoachHubDef {
  id: BaseballNavHub;
  label: string;
  icon: BaseballNavIcon;
  tabs: readonly HubSubNavTab[];
}

/** Display order of the 7 registry-backed coach hubs (Messages is the 8th tab,
 *  a persistent cross-cutting slot outside this grouping — see nav-registry.ts). */
export const COACH_HUB_ORDER: readonly BaseballNavHub[] = [
  'dashboard',
  'team',
  'stats-performance',
  'development',
  'recruiting',
  'academics',
  'management',
];

export const COACH_HUB_DEFS: Readonly<Record<BaseballNavHub, CoachHubDef>> = {
  dashboard: { id: 'dashboard', label: 'Dashboard', icon: IconHome, tabs: COACH_DASHBOARD_TABS },
  team: { id: 'team', label: 'Team', icon: IconUsers, tabs: COACH_TEAM_TABS },
  'stats-performance': {
    id: 'stats-performance',
    label: 'Stats & Performance',
    icon: IconChartBar,
    tabs: COACH_STATS_TABS,
  },
  development: { id: 'development', label: 'Development', icon: IconTarget, tabs: COACH_DEVELOPMENT_TABS },
  recruiting: { id: 'recruiting', label: 'Recruiting', icon: IconStar, tabs: COACH_RECRUITING_TABS },
  academics: { id: 'academics', label: 'Academics', icon: IconGraduationCap, tabs: COACH_ACADEMICS_TABS },
  management: { id: 'management', label: 'Management', icon: IconBuilding, tabs: COACH_MANAGEMENT_TABS },
};

// -----------------------------------------------------------------------------
// PLAYER HUBS — unchanged by this pass (see the module header: most player-only
// registry entries carry no `hub`, so these stay hand-maintained).
// -----------------------------------------------------------------------------

/** Player STATS hub — own stats depth + game/season views. */
export const PLAYER_STATS_TABS: readonly HubSubNavTab[] = [
  { id: 'overview', label: 'Overview', href: '/baseball/dashboard/my-stats', icon: IconChartBar },
];

/** Player DEVELOPMENT hub — own dev plan, training, proof packet, and video library. */
export const PLAYER_DEVELOPMENT_TABS: readonly HubSubNavTab[] = [
  { id: 'dev-plan', label: 'Dev Plan', href: '/baseball/dashboard/dev-plan', icon: IconTarget },
  { id: 'practice', label: 'Practice', href: '/baseball/player/practice', icon: IconClipboardList },
  { id: 'lifts', label: 'Lifts', href: '/baseball/dashboard/lift', icon: IconDumbbell, matchPrefixes: ['/baseball/dashboard/lift'] },
  { id: 'readiness', label: 'Readiness', href: '/baseball/dashboard/readiness', icon: IconGauge },
  { id: 'passport', label: 'Passport', href: '/baseball/player/passport', icon: IconShieldCheck },
  { id: 'videos', label: 'Videos', href: '/baseball/dashboard/videos', icon: IconVideo, matchPrefixes: ['/baseball/dashboard/videos'] },
];

/** Player TEAM hub — shared team surfaces a player reads. */
export const PLAYER_TEAM_TABS: readonly HubSubNavTab[] = [
  { id: 'announcements', label: 'Announcements', href: '/baseball/dashboard/announcements', icon: IconBell },
  { id: 'tasks', label: 'Tasks', href: '/baseball/dashboard/tasks', icon: IconCheckCircle2 },
  { id: 'documents', label: 'Documents', href: '/baseball/dashboard/documents', icon: IconFileText },
];

/** Player RECRUITING hub — player-owned exposure and college discovery surfaces. */
export const PLAYER_RECRUITING_TABS: readonly HubSubNavTab[] = [
  { id: 'journey', label: 'Journey', href: '/baseball/dashboard/journey', icon: IconStar },
  { id: 'interest', label: 'Interest', href: '/baseball/dashboard/college-interest', icon: IconTarget },
  { id: 'colleges', label: 'Colleges', href: '/baseball/dashboard/colleges', icon: IconGraduationCap },
  { id: 'analytics', label: 'Analytics', href: '/baseball/dashboard/analytics', icon: IconTrendingUp },
  { id: 'activate', label: 'Activate', href: '/baseball/dashboard/activate', icon: IconShieldCheck },
];

// -----------------------------------------------------------------------------
// SHARED REFERENCES — non-hub leaf routes the sidebar links directly (no sub-nav).
// Kept here only so the sidebar and any future hub share one href string.
// -----------------------------------------------------------------------------

export const HUB_LANDING = {
  coachDashboard: COACH_DASHBOARD_TABS[0]!.href,
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
  playerRecruiting: PLAYER_RECRUITING_TABS[0]!.href,
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
