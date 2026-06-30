/**
 * normalize-devin-routes.ts
 *
 * Deterministically emits routes/routes.json from an EMBEDDED classification
 * table. The repo's .devin/wiki.json is a wiki-page outline (no route list),
 * so routes are normalized from static enumeration of src/app/golf page files
 * plus shared public routes plus the CLAUDE.md role map. See routes/routes.raw.md.
 *
 * Run with: tsx scripts/ui-intelligence/normalize-devin-routes.ts
 *
 * Side-effect: verifies each non-dynamic golf route still has a page.tsx by
 * globbing src/app/golf/**\/page.tsx (fs recursion, no external glob dep) and
 * console.warn()s about any drift in either direction.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { readdirSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Role = 'public' | 'player' | 'coach' | 'shared' | 'unknown';
type Criticality = 'high' | 'medium' | 'low';

/** A single row of the embedded classification table. */
interface TableRow {
  route: string;
  label?: string;
  role: Role;
  category: string;
  criticality: Criticality;
  /** Defaults below are applied per-row in expand(). */
  auth?: boolean;
  enabled?: boolean;
  needs_confirmation?: boolean;
  dynamic?: boolean;
  param?: string | null;
  notes?: string;
}

/** A fully-resolved entry as emitted to routes.json. */
interface RouteEntry {
  route: string;
  label: string;
  role: 'public' | 'player' | 'coach' | 'unknown';
  auth: boolean;
  category: string;
  criticality: Criticality;
  folder: string;
  enabled: boolean;
  notes: string;
  needs_confirmation: boolean;
  dynamic: boolean;
  param: string | null;
  /** When set, this entry is a client-side TAB of `route`: the capture step
   *  navigates to `route`, clicks the tab (by accessible name within the
   *  `tablist`), then screenshots. null for normal page entries. */
  tab: { slug: string; name: string } | null;
  tablist: string | null;
}

// ---------------------------------------------------------------------------
// Label derivation
// ---------------------------------------------------------------------------

/** Title-case a single token (hyphen-split done by caller). */
function titleCaseWord(word: string): string {
  if (word.length === 0) return word;
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Derive a label from the last non-dynamic segment of a route:
 * replace '-' with ' ' and Title Case each word.
 * "coaching-intelligence" -> "Coaching Intelligence"
 * "my-game-profile"       -> "My Game Profile"
 */
function deriveLabel(route: string): string {
  const segments = route.split('/').filter((s) => s.length > 0);
  // Walk from the end to find the last segment that is not a dynamic param.
  let last = '';
  for (let i = segments.length - 1; i >= 0; i--) {
    if (!segments[i].includes('[')) {
      last = segments[i];
      break;
    }
  }
  if (last.length === 0) return 'Home';
  return last
    .split('-')
    .map(titleCaseWord)
    .join(' ');
}

// ---------------------------------------------------------------------------
// Folder rule
// ---------------------------------------------------------------------------

/**
 * tail = route with a leading '/golf/dashboard' or '/golf' or '/' prefix
 * stripped; if empty use 'home' for '/', 'golf' for '/golf', 'dashboard'
 * for '/golf/dashboard'. Lowercase, preserve nested '/' segments, replace any
 * char not in [a-z0-9/_-] with '-'. folder = role + '/' + tail.
 */
function computeFolder(route: string, role: 'public' | 'player' | 'coach' | 'unknown'): string {
  // Special-case the three exact-prefix routes first.
  let tail: string;
  if (route === '/') {
    tail = 'home';
  } else if (route === '/golf') {
    tail = 'golf';
  } else if (route === '/golf/dashboard') {
    tail = 'dashboard';
  } else if (route.startsWith('/golf/dashboard/')) {
    tail = route.slice('/golf/dashboard/'.length);
  } else if (route.startsWith('/golf/')) {
    tail = route.slice('/golf/'.length);
  } else if (route.startsWith('/')) {
    tail = route.slice('/'.length);
  } else {
    tail = route;
  }

  if (tail.length === 0) tail = 'home';

  const safe = tail
    .toLowerCase()
    .replace(/[^a-z0-9/_-]/g, '-');

  return `${role}/${safe}`;
}

// ---------------------------------------------------------------------------
// EMBEDDED CLASSIFICATION TABLE
// ---------------------------------------------------------------------------

const TABLE: TableRow[] = [
  // --- PUBLIC (role public, auth false, enabled true) ---
  { route: '/', label: 'Home', role: 'public', category: 'public', criticality: 'high' },
  { route: '/about', role: 'public', category: 'public', criticality: 'low' },
  { route: '/help', role: 'public', category: 'public', criticality: 'low' },
  { route: '/products', role: 'public', category: 'public', criticality: 'low' },
  { route: '/splash', role: 'public', category: 'public', criticality: 'low' },
  { route: '/support', role: 'public', category: 'public', criticality: 'low' },
  { route: '/privacy', role: 'public', category: 'legal', criticality: 'low' },
  { route: '/terms', role: 'public', category: 'legal', criticality: 'low' },
  { route: '/golf', label: 'Golf Landing', role: 'public', category: 'public', criticality: 'medium' },
  { route: '/golf/login', role: 'public', category: 'auth', criticality: 'high' },
  { route: '/golf/signup', role: 'public', category: 'auth', criticality: 'high' },
  { route: '/golf/forgot-password', role: 'public', category: 'auth', criticality: 'medium' },
  { route: '/golf/reset-password', role: 'public', category: 'auth', criticality: 'medium' },
  { route: '/golf/join', role: 'public', category: 'join', criticality: 'medium' },

  // --- PUBLIC, but enabled:false + needs_confirmation:true ---
  {
    route: '/golf/welcome',
    role: 'public',
    category: 'auth',
    criticality: 'low',
    enabled: false,
    needs_confirmation: true,
    notes: 'transient post-login greeting; needs ?next= param',
  },
  {
    route: '/golf/join/[code]',
    role: 'public',
    category: 'join',
    criticality: 'medium',
    enabled: false,
    dynamic: true,
    param: 'code',
    needs_confirmation: true,
  },

  // --- ONBOARDING (enabled true, needs_confirmation true) ---
  {
    route: '/golf/coach',
    role: 'coach',
    category: 'onboarding',
    criticality: 'medium',
    needs_confirmation: true,
    notes: 'coach onboarding; onboarded users may redirect',
  },
  {
    route: '/golf/player',
    role: 'player',
    category: 'onboarding',
    criticality: 'medium',
    needs_confirmation: true,
    notes: 'player onboarding; onboarded users may redirect',
  },

  // --- COACH-ONLY (role coach, auth true, enabled true) ---
  { route: '/golf/dashboard/alerts', role: 'coach', category: 'coachhelm', criticality: 'high' },
  { route: '/golf/dashboard/patterns', role: 'coach', category: 'coachhelm', criticality: 'high' },
  { route: '/golf/dashboard/insights', role: 'coach', category: 'coachhelm', criticality: 'high' },
  { route: '/golf/dashboard/intelligence', role: 'coach', category: 'coachhelm', criticality: 'high' },
  { route: '/golf/dashboard/analytics/coachhelm', role: 'coach', category: 'analytics', criticality: 'medium' },
  { route: '/golf/dashboard/settings/coaching-intelligence', role: 'coach', category: 'settings', criticality: 'medium' },
  { route: '/golf/dashboard/development', role: 'coach', category: 'coachhelm', criticality: 'high' },
  { route: '/golf/dashboard/qualifiers/create', role: 'coach', category: 'qualifiers', criticality: 'medium' },
  { route: '/golf/dashboard/stats/team', role: 'coach', category: 'stats', criticality: 'high' },
  { route: '/golf/dashboard/coachhelm/genome/compare-players-players-players', role: 'coach', category: 'coachhelm', criticality: 'medium' },
  {
    route: '/golf/dashboard/recruiting',
    role: 'coach',
    category: 'recruiting',
    criticality: 'medium',
    needs_confirmation: true,
    notes: 'role inferred',
  },

  // --- PLAYER-ONLY (role player, auth true, enabled true) ---
  { route: '/golf/dashboard/hub', role: 'player', category: 'player-hub', criticality: 'high' },
  { route: '/golf/dashboard/coachhelm', role: 'player', category: 'coachhelm', criticality: 'high' },
  { route: '/golf/dashboard/coachhelm/chat', role: 'player', category: 'coachhelm', criticality: 'medium' },
  { route: '/golf/dashboard/my-development', role: 'player', category: 'development', criticality: 'high' },
  { route: '/golf/dashboard/my-qualifiers', role: 'player', category: 'qualifiers', criticality: 'medium' },
  {
    route: '/golf/dashboard/my-insights',
    role: 'player',
    category: 'coachhelm',
    criticality: 'low',
    needs_confirmation: true,
    notes: 'redirects to /golf/dashboard/coachhelm',
  },
  { route: '/golf/dashboard/my-game-profile', role: 'player', category: 'player', criticality: 'medium' },
  { route: '/golf/dashboard/my-standing', role: 'player', category: 'player', criticality: 'medium' },
  { route: '/golf/dashboard/classes', role: 'player', category: 'player', criticality: 'low' },
  { route: '/golf/dashboard/rounds/create', role: 'player', category: 'rounds', criticality: 'high' },
  { route: '/golf/dashboard/rounds/recover-draft-draft', role: 'player', category: 'rounds', criticality: 'low' },

  // --- SHARED — emit BOTH coach + player. auth true, enabled true ---
  { route: '/golf/dashboard', label: 'Dashboard', role: 'shared', category: 'core', criticality: 'high' },
  { route: '/golf/dashboard/calendar', role: 'shared', category: 'team-ops', criticality: 'high' },
  { route: '/golf/dashboard/roster', role: 'shared', category: 'team-ops', criticality: 'high' },
  { route: '/golf/dashboard/messages', role: 'shared', category: 'team-ops', criticality: 'high' },
  { route: '/golf/dashboard/announcements', role: 'shared', category: 'team-ops', criticality: 'medium' },
  { route: '/golf/dashboard/tasks', role: 'shared', category: 'team-ops', criticality: 'medium' },
  { route: '/golf/dashboard/documents', role: 'shared', category: 'team-ops', criticality: 'medium' },
  { route: '/golf/dashboard/travel', role: 'shared', category: 'team-ops', criticality: 'medium' },
  { route: '/golf/dashboard/qualifiers', role: 'shared', category: 'qualifiers', criticality: 'high' },
  { route: '/golf/dashboard/stats', role: 'shared', category: 'stats', criticality: 'high' },
  { route: '/golf/dashboard/team', role: 'shared', category: 'team-ops', criticality: 'medium' },
  { route: '/golf/dashboard/settings', role: 'shared', category: 'settings', criticality: 'medium' },
  { route: '/golf/dashboard/settings/notifications', role: 'shared', category: 'settings', criticality: 'low' },
  { route: '/golf/dashboard/rounds', role: 'shared', category: 'rounds', criticality: 'high' },
  { route: '/golf/dashboard/whats-new', role: 'shared', category: 'core', criticality: 'low' },

  // --- ADMIN (role coach, category admin, auth true, needs_confirmation:true) ---
  { route: '/golf/admin', role: 'coach', category: 'admin', criticality: 'medium', needs_confirmation: true },
  { route: '/golf/admin/crm', role: 'coach', category: 'admin', criticality: 'medium', needs_confirmation: true },
  { route: '/golf/admin/crm/inbox', role: 'coach', category: 'admin', criticality: 'low', needs_confirmation: true },
  { route: '/golf/admin/crm/insights', role: 'coach', category: 'admin', criticality: 'low', needs_confirmation: true },
  { route: '/golf/admin/crm/sequences', role: 'coach', category: 'admin', criticality: 'low', needs_confirmation: true },
  { route: '/golf/admin/crm/settings/automations', role: 'coach', category: 'admin', criticality: 'low', needs_confirmation: true },
  { route: '/golf/admin/crm/settings/suppressions', role: 'coach', category: 'admin', criticality: 'low', needs_confirmation: true },

  // --- DYNAMIC (enabled:false, dynamic:true, needs_confirmation:true) ---
  { route: '/golf/dashboard/coachhelm/genome/[playerId]', role: 'coach', category: 'coachhelm', criticality: 'medium', enabled: false, dynamic: true, param: 'playerId', needs_confirmation: true },
  { route: '/golf/dashboard/coachhelm/qualifying/[id]', role: 'coach', category: 'coachhelm', criticality: 'medium', enabled: false, dynamic: true, param: 'id', needs_confirmation: true },
  { route: '/golf/dashboard/players/[playerId]', role: 'coach', category: 'roster', criticality: 'medium', enabled: false, dynamic: true, param: 'playerId', needs_confirmation: true },
  { route: '/golf/dashboard/players/[playerId]/game', role: 'coach', category: 'roster', criticality: 'medium', enabled: false, dynamic: true, param: 'playerId', needs_confirmation: true },
  { route: '/golf/dashboard/players/[playerId]/game/print', role: 'coach', category: 'roster', criticality: 'low', enabled: false, dynamic: true, param: 'playerId', needs_confirmation: true },
  { route: '/golf/dashboard/qualifiers/[id]', role: 'coach', category: 'qualifiers', criticality: 'medium', enabled: false, dynamic: true, param: 'id', needs_confirmation: true },
  { route: '/golf/dashboard/roster/[id]', role: 'coach', category: 'roster', criticality: 'medium', enabled: false, dynamic: true, param: 'id', needs_confirmation: true },
  { route: '/golf/dashboard/rounds/[id]', role: 'player', category: 'rounds', criticality: 'medium', enabled: false, dynamic: true, param: 'id', needs_confirmation: true },
  { route: '/golf/dashboard/rounds/[id]/review', role: 'player', category: 'rounds', criticality: 'high', enabled: false, dynamic: true, param: 'id', needs_confirmation: true },
  { route: '/golf/dashboard/rounds/continue/[id]', role: 'player', category: 'rounds', criticality: 'medium', enabled: false, dynamic: true, param: 'id', needs_confirmation: true },
  { route: '/golf/admin/crm/coach/[id]', role: 'coach', category: 'admin', criticality: 'low', enabled: false, dynamic: true, param: 'id', needs_confirmation: true },
];

// ---------------------------------------------------------------------------
// Expansion: TableRow -> RouteEntry[]
// ---------------------------------------------------------------------------

function makeEntry(row: TableRow, role: 'public' | 'player' | 'coach' | 'unknown'): RouteEntry {
  const isPublic = row.role === 'public';
  const dynamic = row.dynamic ?? false;
  // auth=true for everything except public.
  const auth = row.auth ?? !isPublic;
  // Dynamic routes => enabled:false; otherwise default enabled:true.
  const enabled = row.enabled ?? (dynamic ? false : true);
  const needs_confirmation = row.needs_confirmation ?? false;
  const param = row.param ?? null;
  const label = row.label ?? deriveLabel(row.route);

  return {
    route: row.route,
    label,
    role,
    auth,
    category: row.category,
    criticality: row.criticality,
    folder: computeFolder(row.route, role),
    enabled,
    notes: row.notes ?? '',
    needs_confirmation,
    dynamic,
    param,
    tab: null,
    tablist: null,
  };
}

// ---------------------------------------------------------------------------
// Stats tabs — client-side tabs on /golf/dashboard/stats (GolfStatsDisplay).
// Each becomes its own inventory entry so every tab is captured + listed.
// Tab `name` must match the accessible name of the role="tab" button.
// ---------------------------------------------------------------------------

const STATS_TABLIST = 'Stats categories';
const STATS_TABS: { slug: string; name: string }[] = [
  { slug: 'overview', name: 'Overview' },
  { slug: 'progress', name: 'Progress' },
  { slug: 'dispersion', name: 'Spray Charts' },
  { slug: 'scoring', name: 'Scoring' },
  { slug: 'driving', name: 'Driving' },
  { slug: 'approach', name: 'Approach' },
  { slug: 'putting', name: 'Putting' },
  { slug: 'scrambling', name: 'Scrambling' },
  { slug: 'strokes-gained', name: 'Strokes Gained' },
  { slug: 'analysis', name: 'Analysis' },
];

/**
 * For each base /golf/dashboard/stats entry (coach + player from the shared
 * expansion), append one entry per stats tab. Folder = "{base.folder}/{slug}"
 * (e.g. player/stats/scoring). The capture step clicks the tab before shooting.
 */
function appendStatsTabs(entries: RouteEntry[]): RouteEntry[] {
  const out = [...entries];
  const bases = entries.filter((e) => e.route === '/golf/dashboard/stats' && !e.tab);
  for (const base of bases) {
    for (const tab of STATS_TABS) {
      out.push({
        ...base,
        label: `Stats — ${tab.name}`,
        folder: `${base.folder}/${tab.slug}`,
        notes: `stats tab: ${tab.name}`,
        criticality: 'medium',
        needs_confirmation: false,
        tab: { slug: tab.slug, name: tab.name },
        tablist: STATS_TABLIST,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sample-player captures — concrete instances of the [playerId] dynamic routes
// and the coach-viewing-player stats (?player=) using a REAL roster player id.
// Swap SAMPLE_PLAYER to capture a different player. (Looked up in Supabase.)
// ---------------------------------------------------------------------------

const SAMPLE_PLAYER = {
  id: '49ffe06d-9b22-4f2f-8c69-f56badbbde6b',
  slug: 'nick-rini',
  name: 'Nick Rini',
};

function mkCoachEntry(
  route: string,
  folder: string,
  label: string,
  category: string,
  criticality: Criticality,
  tab: { slug: string; name: string } | null,
  tablist: string | null,
  notes: string,
): RouteEntry {
  return {
    route,
    label,
    role: 'coach',
    auth: true,
    category,
    criticality,
    folder,
    enabled: true,
    notes,
    needs_confirmation: false,
    dynamic: false,
    param: null,
    tab,
    tablist,
  };
}

/**
 * Concrete coach-side captures that require a real player id:
 *   - /golf/dashboard/players/{id}            (player profile)
 *   - /golf/dashboard/players/{id}/game       (game fingerprint)
 *   - /golf/dashboard/players/{id}/game/print (print view)
 *   - /golf/dashboard/coachhelm/genome/{id}   (CoachHelm genome)
 *   - /golf/dashboard/stats?player={id}       (coach viewing a player's stats)
 *     + one entry per stats tab (the 10 GolfStatsDisplay categories).
 */
function buildPlayerSampleEntries(): RouteEntry[] {
  const { id, slug, name } = SAMPLE_PLAYER;
  const note = `sample playerId: ${name} (${id})`;
  const out: RouteEntry[] = [
    mkCoachEntry(`/golf/dashboard/players/${id}`, `coach/players/${slug}`, `Player — ${name}`, 'roster', 'medium', null, null, note),
    mkCoachEntry(`/golf/dashboard/players/${id}/game`, `coach/players/${slug}/game`, `Player Game — ${name}`, 'roster', 'medium', null, null, note),
    mkCoachEntry(`/golf/dashboard/players/${id}/game/print`, `coach/players/${slug}/game-print`, `Player Game Print — ${name}`, 'roster', 'low', null, null, note),
    mkCoachEntry(`/golf/dashboard/coachhelm/genome/${id}`, `coach/genome/${slug}`, `Genome — ${name}`, 'coachhelm', 'medium', null, null, note),
    mkCoachEntry(`/golf/dashboard/stats?player=${id}`, `coach/stats-player/${slug}`, `Stats (Player: ${name})`, 'stats', 'high', null, null, note),
  ];
  for (const tab of STATS_TABS) {
    out.push(
      mkCoachEntry(
        `/golf/dashboard/stats?player=${id}`,
        `coach/stats-player/${slug}/${tab.slug}`,
        `Stats ${name} — ${tab.name}`,
        'stats',
        'medium',
        { slug: tab.slug, name: tab.name },
        STATS_TABLIST,
        note,
      ),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sample dynamic-route captures — concrete instances of the remaining
// [id]/[code] routes using REAL ids looked up in Supabase. Swap as needed.
// ---------------------------------------------------------------------------

const SAMPLE = {
  roundCompleted: 'd34955d1-8581-40b8-9f2a-970261732530', // Nick Rini, score 70
  roundInProgress: '41a1f47d-8eaf-4ba9-b1a9-a29a059375d3', // Nick Rini, in_progress
  qualifier: '3016698c-b185-4ce2-8f93-4fab596733cc',
  playerId: '49ffe06d-9b22-4f2f-8c69-f56badbbde6b', // Nick Rini (golf_players.id)
  crmCoach: '3964577d-5a08-4a8a-be44-2877e4262764', // Steve LeBrun, Lynn University
  joinCode: 'PXGF5L', // Men's Golf team
};

function mkSample(
  role: 'public' | 'player' | 'coach',
  route: string,
  folder: string,
  label: string,
  category: string,
  criticality: Criticality,
  notes: string,
): RouteEntry {
  return {
    route,
    label,
    role,
    auth: role !== 'public',
    category,
    criticality,
    folder,
    enabled: true,
    notes,
    needs_confirmation: false,
    dynamic: false,
    param: null,
    tab: null,
    tablist: null,
  };
}

/**
 * Concrete captures of the remaining [id]/[code] dynamic routes, with the
 * correct id type per route (verified in the page source):
 *   - rounds/{roundId}, rounds/{roundId}/review   → golf_rounds.id (completed)
 *   - rounds/continue/{roundId}                   → golf_rounds.id (in_progress)
 *   - qualifiers/{qualifierId}                     → golf_qualifiers.id
 *   - coachhelm/qualifying/{qualifierId}          → golf_qualifiers.id (coach)
 *   - roster/{playerId}                            → golf_players.id
 *   - admin/crm/coach/{crmCoachId}                 → crm_coaches.id
 *   - join/{code}                                  → golf_teams.join_code (public)
 */
function buildDynamicSampleEntries(): RouteEntry[] {
  const s = SAMPLE;
  return [
    mkSample('player', `/golf/dashboard/rounds/${s.roundCompleted}`, 'player/rounds/sample-detail', 'Round Detail — sample', 'rounds', 'high', `sample completed round ${s.roundCompleted} (Nick Rini)`),
    mkSample('player', `/golf/dashboard/rounds/${s.roundCompleted}/review`, 'player/rounds/sample-review', 'Round Review — sample', 'rounds', 'high', `sample completed round ${s.roundCompleted} (Nick Rini)`),
    mkSample('player', `/golf/dashboard/rounds/continue/${s.roundInProgress}`, 'player/rounds/sample-continue', 'Continue Round — sample', 'rounds', 'medium', `sample in-progress round ${s.roundInProgress} (Nick Rini)`),
    mkSample('coach', `/golf/dashboard/qualifiers/${s.qualifier}`, 'coach/qualifiers/sample-detail', 'Qualifier Detail — sample', 'qualifiers', 'high', `sample qualifier ${s.qualifier}`),
    mkSample('coach', `/golf/dashboard/coachhelm/qualifying/${s.qualifier}`, 'coach/qualifying/sample-workspace', 'Qualifying Workspace — sample', 'coachhelm', 'medium', `sample qualifier ${s.qualifier}`),
    mkSample('coach', `/golf/dashboard/roster/${s.playerId}`, 'coach/roster/nick-rini', 'Roster Profile — Nick Rini', 'roster', 'medium', `sample playerId ${s.playerId} (golf_players.id)`),
    mkSample('coach', `/golf/admin/crm/coach/${s.crmCoach}`, 'coach/admin/crm/coach-detail', 'CRM Coach — Steve LeBrun', 'admin', 'low', `sample crm_coaches.id ${s.crmCoach}`),
    mkSample('public', `/golf/join/${s.joinCode}`, `public/join/${s.joinCode.toLowerCase()}`, `Join Team — ${s.joinCode}`, 'join', 'medium', `sample team join code ${s.joinCode} (Men's Golf); public visit may redirect to signup`),
  ];
}

function expand(rows: TableRow[]): RouteEntry[] {
  const out: RouteEntry[] = [];
  for (const row of rows) {
    if (row.role === 'shared') {
      // Emit TWICE: once coach, once player.
      out.push(makeEntry(row, 'coach'));
      out.push(makeEntry(row, 'player'));
    } else {
      out.push(makeEntry(row, row.role as 'public' | 'player' | 'coach' | 'unknown'));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Glob verification against src/app/golf/**/page.tsx
// ---------------------------------------------------------------------------

/** Recursively collect all page.tsx file paths under a directory. */
function findPageFiles(dir: string, acc: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      findPageFiles(full, acc);
    } else if (entry.isFile() && entry.name === 'page.tsx') {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Convert a src/app/golf/.../page.tsx path into its route.
 * Strips the "src/app" prefix, the trailing "/page.tsx", and any route-group
 * "(group)" segments. Returns a leading-slash route (e.g. /golf/dashboard).
 */
function pageFileToRoute(absPath: string, appDir: string): string {
  let rel = absPath.slice(appDir.length); // e.g. /golf/(dashboard)/dashboard/page.tsx
  rel = rel.replace(/\/page\.tsx$/, '');
  // Drop route-group segments like (auth), (dashboard), (onboarding).
  const segments = rel.split('/').filter((s) => s.length > 0 && !/^\(.*\)$/.test(s));
  const route = '/' + segments.join('/');
  return route === '/' ? '/golf' : route;
}

function verifyAgainstPageFiles(entries: RouteEntry[]): void {
  const cwd = process.cwd();
  const appDir = join(cwd, 'src', 'app');
  const golfDir = join(appDir, 'golf');

  const pageFiles = findPageFiles(golfDir);
  const discoveredRoutes = new Set(pageFiles.map((p) => pageFileToRoute(p, appDir)));

  // Routes present in the table that are golf routes (start with /golf).
  const tableGolfRoutes = new Set(
    entries.filter((e) => e.route === '/golf' || e.route.startsWith('/golf/')).map((e) => e.route),
  );

  // (1) Table golf routes whose page file is missing.
  for (const route of tableGolfRoutes) {
    if (!discoveredRoutes.has(route)) {
      console.warn(`[normalize-devin-routes] WARN: table entry has no page.tsx on disk: ${route}`);
    }
  }

  // (2) Discovered golf page.tsx routes NOT in the table.
  for (const route of discoveredRoutes) {
    if (!tableGolfRoutes.has(route)) {
      console.warn(`[normalize-devin-routes] WARN: discovered golf page.tsx not in table: ${route}`);
    }
  }

  console.log(
    `[normalize-devin-routes] verification: ${discoveredRoutes.size} golf page.tsx files on disk, ` +
      `${tableGolfRoutes.size} distinct golf routes in table.`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const cwd = process.cwd();
  const entries = [
    ...appendStatsTabs(expand(TABLE)),
    ...buildPlayerSampleEntries(),
    ...buildDynamicSampleEntries(),
  ];

  // Verify table <-> disk drift (warnings only; never fail the run).
  verifyAgainstPageFiles(entries);

  // Write routes.json (pretty, 2 spaces).
  const outDir = join(cwd, 'routes');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'routes.json');
  const json = JSON.stringify(entries, null, 2) + '\n';
  writeFileSync(outPath, json, 'utf8');

  // Validate the JSON parses back.
  const parsed = JSON.parse(readFileSync(outPath, 'utf8')) as RouteEntry[];
  if (!Array.isArray(parsed)) {
    throw new Error('routes.json did not parse to an array');
  }

  // Summary.
  const total = parsed.length;
  const enabled = parsed.filter((e) => e.enabled).length;
  const byRole: Record<string, number> = {};
  for (const e of parsed) {
    byRole[e.role] = (byRole[e.role] ?? 0) + 1;
  }

  console.log(`[normalize-devin-routes] wrote ${outPath}`);
  console.log(`[normalize-devin-routes] total entries: ${total}`);
  console.log(`[normalize-devin-routes] enabled: ${enabled} (disabled: ${total - enabled})`);
  console.log('[normalize-devin-routes] by role:');
  for (const role of Object.keys(byRole).sort()) {
    console.log(`  ${role}: ${byRole[role]}`);
  }
}

main();
