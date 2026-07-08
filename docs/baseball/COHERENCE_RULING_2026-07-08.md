# BaseballHelm Coherence Ruling — 2026-07-08 (overnight consolidation)

**Authority:** Commander decision doc for the one-night coherence mission. Supersedes conflicting
guidance in CANONICAL_SPEC §2.1 (stale 10-item nav). Builds on COACH_NAV_8TAB_PROPOSAL.md
(owner-approved 2026-07-01) and the 2026-06-30 shell postmortem's unexecuted recommendations.
Baseline: `origin/main` e63de6044 — tsc/lint/ratchet/unit all green.

## Ruling 1 — ONE shell: BaseballFairwayShell, unconditional

`NEXT_PUBLIC_REDESIGN=true` is what prod serves. The legacy fork is pure regression risk
(`.env.example` defaults it off). Therefore:

- `(dashboard)/layout.tsx` and `(player-dashboard)/player/layout.tsx` render
  `BaseballFairwayShell` **unconditionally** — delete the `isRedesignEnabled()` forks
  (baseball layouts only; golf untouched).
- Delete `src/app/baseball/(coach-dashboard)/` entirely (zero page.tsx, confirmed dead).
- Remove the **baseball** nav paths from `src/components/layout/sidebar.tsx`
  (5 legacy arrays: collegeTeamNav/hsCoachTeamNav/jucoTeamNav/showcaseOrgNav/playerTeamNav +
  `buildCondensedBaseballNavigation`); the golf branch stays byte-identical.
- Delete `BaseballShellLayout`/`BaseballDashboardShell` baseball render path once unreferenced.
- Route groups `(dashboard)` + `(player-dashboard)` both stay (URLs are load-bearing:
  PWA start_url, bookmarks). Folding them is deferred — not tonight's risk.

## Ruling 2 — Navigation IA: ≤8 primary, ≤3 subtabs per primary (hard caps)

Top level keeps the owner-approved hub set (College sees 7, HS 6, JUCO 8 — all ≤8):
**Dashboard · Team · Messages · Stats & Performance · Development · Recruiting ·
Academics (JUCO) · Management**. The fix is inside the hubs — every destination stays
reachable ≤2 clicks (subtab landing pages surface deeper routes as cards/CTAs; command
palette stays flat with everything). Deep routes keep their URLs; `resolve-active-hub`
maps them to the owning subtab for highlight + breadcrumbs.

| Hub | Subtabs (≤3) | Folded in (reachable from landing) |
|---|---|---|
| Dashboard | Overview · Signals | — |
| Team | Roster · Calendar · Operations | Operations = new landing: Documents, Travel, Practice Planner, Practice Effectiveness |
| Messages | Messages · Announcements | announcements moves here from Team (it's comms) |
| Stats & Performance | Stats Center · Games · Postgame | Season = view inside Stats Center; Upload + Import Center = CTAs inside Stats Center |
| Development | Dev Plans · Training · Videos | Training = existing /dashboard/performance landing → Programs, Live Weight Room, Builder, Groups |
| Recruiting | Pipeline · Discover · Scouting | Scouting = new landing: Watchlist, Compare, Saved Comparisons, Scout Packets, Camps |
| Academics | (single page) | JUCO only |
| Management | Decision Room · Settings · Organization | Settings = existing card-grid landing (KEEP grid, DELETE the 9-tab splice from COACH_MANAGEMENT_TABS); Organization = org/teams/events (Showcase types) |

Player nav (Fairway): Today · Schedule · My Stats · Development · Team · Messages ·
My Profile (+ Recruiting when activated) — already ≤8; enforce ≤3 subtabs per hub the same way.
Players hitting `/baseball/dashboard/practice` redirect to `/baseball/player/practice` (canonical
player practice surface).

Nav-manifest test extended: every coach/both registry entry maps to exactly one hub, and no
hub resolves >3 subtabs for any coach type. That test is the anti-regression lock.

## Ruling 3 — ONE Lift Lab

Canonical = `src/components/lifting/*` + `helm_lifting_*`. Repoint the 6 baseball
performance routes at the canonical components; delete `src/components/baseball/performance/*`
(23-file legacy tree, GolfHelm-palette, writes legacy `baseball_lift_*`). Completes the
in-flight unification train.

## Ruling 4 — Data honesty & correctness cluster

- "Today" is **team-local** everywhere (`resolveTeamTimezone` + `todayIsoInTz`), never server-UTC:
  readiness page, command-center read-model, player-today read-model.
- Calendar: null `end_time` renders start + 1h default (never zero-duration); events query gets
  lookback bound + limit; badge labels pluralize.
- Academics eligibility is tri-state: `null` = gray "Not on file"; red "Ineligible" only for real `false`.
- Roster: drop EXIT V column (column doesn't exist in schema, no write path — honest UI);
  backfill career_obp/slg/ops for existing rows (prod data op).
- Breadcrumbs: UUID-shaped segments never title-cased; dynamic routes supply real names
  (players/[id], stats/games/[id], dev-plans/[id]).
- `createBaseballEvent` game-insert errors checked, not swallowed.
- E2E: spec cleans up its own rows (service-role delete in teardown); prod junk rows
  (`E2E Created Opponent%`) deleted as a data op; isolated E2E project documented as follow-up
  needing owner (new Supabase project).
- Seed script gets realistic event times (practice 15:30–17:30, games 18:00–21:00 local);
  demo team's polluted event rows corrected in place.

## Ruling 5 — Dead code deleted, not layered over

`(coach-dashboard)`; legacy sidebar baseball arrays; legacy shell baseball path; legacy Lift Lab
tree; `players/[id]/profile` duplicate page (canonical = `players/[id]` PlayerProfileClient);
knip-confirmed orphans (MatchScoreBadge, match-calculator, dashboard-types); 5 orphaned
`baseballhelm-*.{mjs,workflow.js}` scripts (superseded by Helm Bridge).

## Out of scope tonight (documented, not forgotten)

Route-group merge of `(player-dashboard)` into `(dashboard)`; dedicated E2E Supabase project;
PlayerPassportCard→Fairway preview swap if polish wave runs out of clock; full 3-lane
Living-Annual masthead vision (ui-migration-map L56) — the 8-hub IA is the stepping stone.
