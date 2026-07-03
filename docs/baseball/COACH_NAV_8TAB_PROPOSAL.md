<!-- BaseballHelm coach navigation consolidation — owner-requested (fold ~32 destinations → 8 grouped tabs, golf-style, ALL features preserved).
     Read-only design proposal for owner approval. Build during the execution phase after the fresh base. 2026-07-01. -->

# BaseballHelm — Coach Nav Consolidation (32 → 8 tabs)

**Owner ask:** fold the sprawling coach sidebar into ~8 grouped tabs like GolfHelm — every feature preserved, just reorganized (not a tab per thing).

## Headline
- **Current coach nav surface: 32 destinations** (31 `nav-registry.ts` rows role coach/both + a cross-cutting Messages slot; 30 unique routes).
- **Proposed: 8 top-level tabs** (7–8 visible per coach type), each with grouped sub-items. Every one of the 32 maps into exactly one tab — **zero orphans, zero deletions.**
- **Key finding — this is already half-built.** A "Grouped-Hubs Navigation" system (approved 2026-06-24) already exists: `src/components/layout/sidebar.tsx` (`buildCondensedBaseballNavigation`) + `src/app/baseball/(dashboard)/_components/{hub-definitions,resolve-active-hub}.ts` + `hub-sub-nav.tsx`. It already renders Dashboard/Signals/Team/Stats/Development/Management hubs. **This proposal formalizes, completes, and fixes that system — it does not invent a new one.** Much smaller lift than from scratch.

## The golf pattern (why baseball needs a variant)
Golf (`GolfSidebar.tsx` / `FairwayDashboardShell.tsx`) uses a flat two-tier list: ~7 daily items + ~6 weekly "Operations" items + Settings pinned. It gets away with flat because golf has only ~13 destinations. Baseball has 32 — so it needs golf's **frequency-tiering discipline** (small top set) **combined with hub sub-tabs** (which baseball already built) to absorb the volume.

## Proposed 8 tabs — full mapping (nothing orphaned)
| # | Tab | Folds in | Lane | Coach types |
|---|---|---|---|---|
| 1 | **Dashboard** | command-center, signals, (team alias) | Pressbox | All |
| 2 | **Team** | roster, calendar, announcements, documents, travel | Pressbox | All |
| 3 | **Messages** | messages (persistent slot, like golf) | cross-cut | All |
| 4 | **Stats & Performance** | stats-center, performance, postgame-review, practice-planner, practice-effectiveness, import-center | Pressbox | All |
| 5 | **Development** | dev-plans, videos | Pressbox | All |
| 6 | **Recruiting** | pipeline, discover, watchlist, compare, comparisons, scout-packets, camps | War Room | College/JUCO/Showcase/Academy/Club — **hidden for High School** |
| 7 | **Academics** | academics | — | JUCO only |
| 8 | **Management** | staff-decision-room, program, staff-settings, program-settings, organization, teams, events | Pressbox | All (Org/Teams/Events only for Showcase/Academy/Club) |

Placement calls flagged for owner confirmation: `camps` → Recruiting (Team/Calendar is an alt); `import-center` → Stats (corrected out of the Recruiting hub where it oddly lives today); `events` → Management (org-level scheduling).

## Per-coach-type views
- **College:** 7 tabs (no Academics).
- **High School:** 6 tabs (no Recruiting, no Academics) — matches CLAUDE.md + existing `RECRUITING_PROGRAM_TYPES` gate.
- **JUCO:** 8 tabs — Recruiting reframed as "Transfer Exposure" per `program-type-variants.ts`; Academics JUCO-exclusive.
- **Showcase:** intentional two-level (org-level → pick team → team-scoped subset); already reflected in `showcaseOrgNav`/`showcaseTeamNav`. Documented exception, not a violation.

## Live bugs this consolidation fixes (found during design)
Two hand-maintained sources of truth (`nav-registry.ts` + `hub-definitions.ts`) have already diverged:
1. **5 coach features are currently UNREACHABLE from the sidebar/mobile** — `camps`, `postgame-review`, `practice-effectiveness`, `practice-planner`, `comparisons` are registered `primary` but absent from every hub-tab array (only reachable via ⌘K or direct URL). Live navigational gap.
2. `COACH_TEAM_TABS` invents a `tasks` coach destination with no coach-visible registry row.
3. `COACH_RECRUITING_TABS` points coaches at `college-interest`, a player-only page.
4. Label drift: registry "Decision Room" vs hub "Staff Room".
**Fix:** add one derived `hub` field to `nav-registry.ts` (the declared single source of truth); rewrite `hub-definitions.ts` / `resolve-active-hub.ts` / `buildCondensedBaseballNavigation` to group by `entry.hub` instead of hand-listing routes.

## Biggest risk — update BOTH shells together
`BaseballFairwayShell.tsx` (the flag-gated future shell the in-flight **Lane B Fairway migration** is moving toward) has **no hubs** — it flattens all ~31 items. If Lane B ships before this consolidation is ported into the Fairway shell, flipping the redesign flag **silently regresses the sidebar to a 31-item flat wall.** Any implementation must update the legacy shell AND `BaseballFairwayShell.tsx` in lockstep (both consume the same `hub`-derived section builder).

## Other notes
- Nav-only + additive: no route moved/renamed/deleted → no deep-link/CRM/bookmark breakage.
- Hub sub-tabs must inherit each entry's `requiredCapability`/`allowedProgramTypes` verbatim from the registry (not re-declared — that's how the drift happened).
- Mobile: bottom bar's 3 fixed slots could become "3 of the 8 hubs" (follow-up, not required).
- Extend `src/lib/baseball/__tests__/nav-manifest.test.ts` to assert every coach/both entry has exactly one `hub` — prevents future orphaning.
- Compatible with the longer-range 3-lane Living-Annual masthead vision (tabs 1/2/4/5/8 = Pressbox green, 6 = War Room clay, 3/7 = cross-cutting) — a stepping stone, not a competing structure.

## Files (reference; untouched)
`nav-registry.ts` · `_components/{hub-definitions,resolve-active-hub,hub-sub-nav}` · `components/layout/sidebar.tsx` · `components/baseball/dashboard-shell.tsx` · `BaseballFairwayShell.tsx` · `command-palette-nav.ts` (leave flat) · `program-type-variants.ts` · `nav-manifest.test.ts`.
