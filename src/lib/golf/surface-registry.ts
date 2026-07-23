// =============================================================================
// src/lib/golf/surface-registry.ts
//
// GOLF IA REORG — FOUNDATION (step 1/3, docs/golf-ia-plan.json final_migrations
// #1-#3). SINGLE SOURCE OF TRUTH for the canonical NAME + HREF of every
// CoachHelm AI + Stats surface. Before this module existed, the same surface
// could be labeled differently by nav-registry.ts (rail), CoachHelmSubNav.tsx
// (masthead sub-nav), CommandPalette.tsx (⌘K), page <title> metadata, and
// FairwayDashboardShell.tsx's breadcrumb route-name map — four independent
// hand-maintained string literals per surface, free to drift. They now all
// import from here instead.
//
// TWO NAME LEVELS coexist by design (same relationship as the pre-existing
// "Rounds & Stats" hub label vs. its "Rounds" / "Team Stats" tab labels):
//   - group: 'rail'           — the top-level nav entry (e.g. "CoachHelm AI"),
//                                shown in the sidebar rail + breadcrumb's
//                                middle segment. One href-independent identity
//                                per role even though several leaf pages live
//                                under it.
//   - group: 'coachhelm-tab'  — the masthead sub-nav strip's own tab identity
//                                (Brief/Signals/Players/Effectiveness/Ask for
//                                coach; Overview/Development/Game Profile/
//                                Standing for player). Also the breadcrumb's
//                                leaf segment inside the cluster.
//   - group: 'signals-segment'— the 3 sibling routes (Alerts/Insights/
//                                Patterns) the single "Signals" tab covers —
//                                each keeps its own page-level identity (page
//                                <title>, in-page FeatureUnavailable copy).
//   - group: 'stats'          — the Stats cockpit + Team Stats board.
//   - group: 'page'           — a standalone leaf page inside the cluster that
//                                isn't itself a rail item or masthead tab
//                                (Development Plans content, per-player
//                                surfaces, Genome, Chat History).
//
// Every `id` is unique; several entries legitimately share an `href` (a rail
// item and its cluster's own tab both point at the cluster's landing route)
// — that is NOT drift, it is two different name levels for the same click
// target, exactly like the pre-existing hub/tab pattern above.
//
// PURE DATA — no 'use client', no React, no Supabase. Safe to import from
// server or client code.
//
// SCOPE FENCE: this migration touches navigation/naming/routing only. It does
// NOT model every GolfHelm surface (Roster, Calendar, Messages, …) — only the
// CoachHelm AI cluster + Stats surfaces named in docs/golf-ia-plan.json
// final_routes, which is where the naming disagreements lived.
// =============================================================================

export type GolfSurfaceRole = 'coach' | 'player' | 'both';

export type GolfSurfaceGroup =
  | 'rail'
  | 'coachhelm-tab'
  | 'signals-segment'
  | 'stats'
  | 'page';

export interface GolfSurfaceEntry {
  /** Stable id — the lookup key every consumer uses. Never rendered directly. */
  id: string;
  /** The one canonical display string for this surface at this name level. */
  canonicalName: string;
  /** Canonical destination route (absolute, starts with /golf/dashboard). */
  href: string;
  role: GolfSurfaceRole;
  group: GolfSurfaceGroup;
  /** True once a newer canonical surface has replaced this one — the route
   *  still resolves (permanent redirect shim), but it is intentionally
   *  retired, not orphaned. */
  legacy?: boolean;
  /** True when the surface should never appear in generated nav UI (rail,
   *  sub-nav, palette) — reachable only by direct/legacy URL. */
  hidden?: boolean;
}

export const GOLF_SURFACES: readonly GolfSurfaceEntry[] = [
  // ---------------------------------------------------------------------
  // Rail-level — the "CoachHelm AI" cluster header (sidebar rail + bottom
  // nav + breadcrumb middle segment). One per role.
  // ---------------------------------------------------------------------
  { id: 'rail-coachhelm-ai-coach', canonicalName: 'CoachHelm AI', href: '/golf/dashboard/intelligence', role: 'coach', group: 'rail' },
  { id: 'rail-coachhelm-ai-player', canonicalName: 'CoachHelm AI', href: '/golf/dashboard/coachhelm', role: 'player', group: 'rail' },
  { id: 'rail-my-stats-player', canonicalName: 'My Stats', href: '/golf/dashboard/stats', role: 'player', group: 'rail' },

  // ---------------------------------------------------------------------
  // CoachHelmSubNav — coach's 5-tab strip (Brief · Signals · Players ·
  // Effectiveness · Ask). Also the breadcrumb's cluster leaf segment and
  // (Brief/Effectiveness) the page <title>.
  // ---------------------------------------------------------------------
  // GOLF IA REORG — Spine & Stage (2026-07-19, plan Task 9): Signals/Players/
  // Effectiveness are now `?view=` drills of the Brief home itself (the coach
  // stage IS the coach nav now, mirroring Task 8's player consolidation), so
  // all four flip legacy+hidden with hrefs pointing at their new stage
  // targets — Brief alone stays the canonical, visible coachhelm-tab entry.
  { id: 'brief', canonicalName: 'Brief', href: '/golf/dashboard/intelligence', role: 'coach', group: 'coachhelm-tab' },
  { id: 'signals', canonicalName: 'Signals', href: '/golf/dashboard/intelligence?view=signals', role: 'coach', group: 'coachhelm-tab', legacy: true, hidden: true },
  { id: 'players-tab', canonicalName: 'Players', href: '/golf/dashboard/intelligence?view=players', role: 'coach', group: 'coachhelm-tab', legacy: true, hidden: true },
  { id: 'effectiveness', canonicalName: 'Effectiveness', href: '/golf/dashboard/intelligence?view=effectiveness', role: 'coach', group: 'coachhelm-tab', legacy: true, hidden: true },
  { id: 'ask', canonicalName: 'Ask', href: '/golf/dashboard/coachhelm/chat', role: 'coach', group: 'coachhelm-tab' },

  // ---------------------------------------------------------------------
  // Signals segments — the 3 sibling routes the Signals drill covers, now
  // consolidated into ONE `?view=signals&filter=` workspace (plan Task 9).
  // Each keeps its own canonical NAME (page <title>, in-page copy,
  // CommandPalette entries) even though the destination is now shared.
  // ---------------------------------------------------------------------
  { id: 'alerts', canonicalName: 'Alerts', href: '/golf/dashboard/intelligence?view=signals&filter=alerts', role: 'coach', group: 'signals-segment', legacy: true, hidden: true },
  { id: 'insights', canonicalName: 'Insights', href: '/golf/dashboard/intelligence?view=signals&filter=insights', role: 'coach', group: 'signals-segment', legacy: true, hidden: true },
  { id: 'patterns', canonicalName: 'Patterns', href: '/golf/dashboard/intelligence?view=signals&filter=patterns', role: 'coach', group: 'signals-segment', legacy: true, hidden: true },

  // ---------------------------------------------------------------------
  // Players-tab leaves — content reachable under the Players drill besides
  // the ?view=players landing itself.
  // ---------------------------------------------------------------------
  { id: 'development', canonicalName: 'Development Plans', href: '/golf/dashboard/intelligence?view=players', role: 'coach', group: 'page', legacy: true, hidden: true },
  // GOLF IA REORG (final_migrations #11): /players/[playerId]/game is now the
  // ONE canonical per-player deep-dive URL — 'Player Insight' lives on as its
  // in-page "Scouting Report" tab (?tab=scouting), not a separate route, so
  // both entries below share the /players prefix (the dynamic leaf itself).
  { id: 'player-insight', canonicalName: 'Scouting Report', href: '/golf/dashboard/players', role: 'coach', group: 'page' },
  { id: 'player-game', canonicalName: 'Game Fingerprint', href: '/golf/dashboard/players', role: 'coach', group: 'page' },
  // Genome moved to a real nested path segment under /players/[playerId]/genome
  // (sibling of /game) — /coachhelm/genome/[playerId] is now a redirect shim.
  { id: 'genome-detail', canonicalName: 'Genome', href: '/golf/dashboard/players', role: 'coach', group: 'page' },
  { id: 'genome-compare', canonicalName: 'Genome Compare', href: '/golf/dashboard/coachhelm/genome/compare', role: 'coach', group: 'page' },

  // NOTE: /golf/dashboard/coachhelm/chat has no separate page-level entry —
  // final_routes names it "Ask — chat surface, unchanged", i.e. it shares its
  // canonical name with the `ask` coachhelm-tab entry above.

  // ---------------------------------------------------------------------
  // CoachHelmSubNav — player's 4-tab strip (Overview · Development ·
  // Game Profile · Standing), the single player CoachHelm home.
  // ---------------------------------------------------------------------
  { id: 'overview', canonicalName: 'Overview', href: '/golf/dashboard/coachhelm', role: 'player', group: 'coachhelm-tab' },
  // GOLF IA REORG — Spine & Stage (2026-07-19, plan Task 8): Development / Game
  // Profile / Standing are now `?view=` drills of the Overview home itself (the
  // stage IS the player nav) instead of separate CoachHelmSubNav tabs, so all
  // three flip legacy+hidden with hrefs pointing at their new stage targets —
  // the SAME permanent-redirect-shim pattern as `my-insights` below.
  { id: 'my-development-tab', canonicalName: 'Development', href: '/golf/dashboard/coachhelm?view=development', role: 'player', group: 'coachhelm-tab', legacy: true, hidden: true },
  { id: 'my-game-profile-tab', canonicalName: 'Game Profile', href: '/golf/dashboard/coachhelm?view=profile', role: 'player', group: 'coachhelm-tab', legacy: true, hidden: true },
  { id: 'my-standing-tab', canonicalName: 'Standing', href: '/golf/dashboard/coachhelm?view=standing', role: 'player', group: 'coachhelm-tab', legacy: true, hidden: true },

  // ---------------------------------------------------------------------
  // Stats — the Player Stats cockpit (both roles) + coach-only Team Stats.
  // ---------------------------------------------------------------------
  { id: 'stats', canonicalName: 'Stats', href: '/golf/dashboard/stats', role: 'both', group: 'stats' },
  { id: 'stats-team', canonicalName: 'Team Stats', href: '/golf/dashboard/stats/team', role: 'coach', group: 'stats' },

  // ---------------------------------------------------------------------
  // Legacy — permanent redirect shim, intentionally retired (not orphaned).
  // Never rendered in generated nav UI.
  // ---------------------------------------------------------------------
  // href points at the CANONICAL destination directly (not the /my-insights
  // shim itself) — same convention as every other legacy entry above. The
  // shim route still exists (now belt-and-braces behind a next.config.mjs
  // redirect, see hub/page.tsx's comment) but nothing in this registry should
  // hand a consumer a URL that just bounces again.
  { id: 'my-insights', canonicalName: 'My Insights', href: '/golf/dashboard/coachhelm', role: 'player', group: 'page', legacy: true, hidden: true },
] as const;

const SURFACE_BY_ID: ReadonlyMap<string, GolfSurfaceEntry> = new Map(
  GOLF_SURFACES.map((s) => [s.id, s]),
);

/** Look up a surface by id. Returns `undefined` for an unknown id — callers
 *  that need a guaranteed hit should use `surfaceName`/`surfaceHref` below,
 *  which throw immediately (fail fast beats silently rendering "undefined"
 *  in a nav label). */
export function getSurface(id: string): GolfSurfaceEntry | undefined {
  return SURFACE_BY_ID.get(id);
}

/** The canonical display name for `id`. Throws if `id` is not registered —
 *  every caller is a static string in source, so this can only fire on a
 *  genuine typo/drift, and failing loudly at import/render time is exactly
 *  the "structurally impossible to disagree" contract this registry exists
 *  to enforce. */
export function surfaceName(id: string): string {
  const entry = SURFACE_BY_ID.get(id);
  if (!entry) {
    throw new Error(`surface-registry: unknown surface id "${id}"`);
  }
  return entry.canonicalName;
}

/** The canonical href for `id`. See `surfaceName` for the fail-fast rationale. */
export function surfaceHref(id: string): string {
  const entry = SURFACE_BY_ID.get(id);
  if (!entry) {
    throw new Error(`surface-registry: unknown surface id "${id}"`);
  }
  return entry.href;
}
